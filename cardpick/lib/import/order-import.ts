import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { importBatch, importRow, order, orderLine } from "../db/schema";
import { snapshotDatabase } from "../backup";

export interface CommitOrderResult {
  ordersCreated: number;
  ordersUpdated: number;
  linesCreated: number;
  linesUpdated: number;
  unmatched: number;
  ambiguous: number;
}

/** Step 3 for ORDER imports: group staged rows by order id, upsert order +
 * order_line by the natural key (order_id, line_index) so re-imports are
 * idempotent, and never reset a line's pick progress on re-import. */
export function commitOrderImport(batchId: number): CommitOrderResult {
  const batch = db.select().from(importBatch).where(eq(importBatch.id, batchId)).get();
  if (!batch) throw new Error("Import batch not found");
  if (batch.status === "COMMITTED") throw new Error("Import batch already committed");

  snapshotDatabase(`order-import:${batch.filename}`);
  const rows = db.select().from(importRow).where(eq(importRow.importBatchId, batchId)).all();

  const result: CommitOrderResult = { ordersCreated: 0, ordersUpdated: 0, linesCreated: 0, linesUpdated: 0, unmatched: 0, ambiguous: 0 };

  const byOrder = new Map<string, typeof rows>();
  for (const row of rows) {
    const mapped = JSON.parse(row.mappedJson) as Record<string, string | number | null>;
    const externalOrderId = String(mapped.externalOrderId ?? "").trim();
    if (!externalOrderId) continue;
    const list = byOrder.get(externalOrderId) ?? [];
    list.push(row);
    byOrder.set(externalOrderId, list);
  }

  for (const [externalOrderId, orderRows] of byOrder) {
    let orderRecord = db.select().from(order).where(eq(order.externalOrderId, externalOrderId)).get();
    const firstMapped = JSON.parse(orderRows[0].mappedJson) as Record<string, string | number | null>;
    if (!orderRecord) {
      orderRecord = db
        .insert(order)
        .values({
          externalOrderId,
          source: batch.filename,
          importBatchId: batch.id,
          shipBy: (firstMapped.shipBy as string) ?? null,
          status: "PENDING",
        })
        .returning()
        .get();
      result.ordersCreated++;
    } else {
      result.ordersUpdated++;
    }

    orderRows.forEach((row, idx) => {
      const mapped = JSON.parse(row.mappedJson) as Record<string, string | number | null>;
      const lineIndex = idx;
      const matchStatus: "MATCHED" | "AMBIGUOUS" | "UNMATCHED" =
        row.matchStatus === "MATCHED" ? "MATCHED" : row.matchStatus === "AMBIGUOUS" ? "AMBIGUOUS" : "UNMATCHED";
      if (matchStatus === "AMBIGUOUS") result.ambiguous++;
      if (matchStatus === "UNMATCHED") result.unmatched++;

      const existingLine = db
        .select()
        .from(orderLine)
        .where(and(eq(orderLine.orderId, orderRecord!.id), eq(orderLine.lineIndex, lineIndex)))
        .get();

      const rawFields = {
        rawName: String(mapped.name ?? ""),
        rawSetName: (mapped.setName as string) ?? null,
        rawCardNumber: (mapped.cardNumber as string) ?? null,
        rawCondition: (mapped.rawCondition as string) ?? null,
        rawPrinting: (mapped.printingCode as string) ?? null,
        quantityOrdered: Number(mapped.quantity ?? 1),
        matchedInventoryItemId: matchStatus === "MATCHED" ? (row.matchedInventoryItemId ?? null) : null,
        matchStatus,
        candidatesJson: row.candidatesJson,
      };

      if (existingLine) {
        // Preserve pick progress across re-imports; only refresh the raw/match data.
        db.update(orderLine).set({ ...rawFields, updatedAt: new Date().toISOString() }).where(eq(orderLine.id, existingLine.id)).run();
        result.linesUpdated++;
      } else {
        db.insert(orderLine)
          .values({ orderId: orderRecord!.id, lineIndex, pickState: "PENDING", quantityPicked: 0, ...rawFields })
          .run();
        result.linesCreated++;
      }
    });

    recomputeOrderStatus(orderRecord.id);
  }

  db.update(importBatch).set({ status: "COMMITTED", committedAt: new Date().toISOString() }).where(eq(importBatch.id, batchId)).run();

  return result;
}

/** READY_TO_PACK only when every line is PULLED; any SHORT line or
 * unresolved match sends the order to NEEDS_ATTENTION; otherwise PENDING. */
export function recomputeOrderStatus(orderId: number) {
  const lines = db.select().from(orderLine).where(eq(orderLine.orderId, orderId)).all();
  if (lines.length === 0) return;

  const needsAttention = lines.some((l) => l.pickState === "SHORT" || l.matchStatus === "AMBIGUOUS" || l.matchStatus === "UNMATCHED");
  const allPulled = lines.every((l) => l.pickState === "PULLED");

  const current = db.select().from(order).where(eq(order.id, orderId)).get();
  if (!current || current.status === "FULFILLED" || current.status === "CANCELLED") return;

  const nextStatus = needsAttention ? "NEEDS_ATTENTION" : allPulled ? "READY_TO_PACK" : "PENDING";
  if (current.status !== nextStatus) {
    db.update(order).set({ status: nextStatus }).where(eq(order.id, orderId)).run();
  }
}
