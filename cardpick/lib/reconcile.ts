import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { importBatch, importRow, inventoryItem, inventoryLot } from "./db/schema";
import { snapshotDatabase } from "./backup";
import { recordHistory } from "./history";

export interface ReconcileDiffRow {
  importRowId: number;
  matchStatus: "NEW" | "MATCHED" | "AMBIGUOUS";
  itemId: number | null;
  sku: string | null;
  cardName: string | null;
  cardpickQty: number | null;
  tcgplayerQty: number | null;
  deltaQty: number | null;
}

export function getReconcileDiff(batchId: number): ReconcileDiffRow[] {
  const rows = db.select().from(importRow).where(eq(importRow.importBatchId, batchId)).all();

  return rows.map((row) => {
    const mapped = JSON.parse(row.mappedJson) as Record<string, string | number | null>;
    const tcgplayerQty = mapped.quantity != null ? Number(mapped.quantity) : null;

    if (row.matchStatus !== "MATCHED" || !row.matchedInventoryItemId) {
      return {
        importRowId: row.id,
        matchStatus: row.matchStatus,
        itemId: null,
        sku: (mapped.tcgplayerSkuId as string) ?? null,
        cardName: (mapped.name as string) ?? null,
        cardpickQty: null,
        tcgplayerQty,
        deltaQty: null,
      };
    }

    const item = db.select().from(inventoryItem).where(eq(inventoryItem.id, row.matchedInventoryItemId)).get();
    const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, row.matchedInventoryItemId)).get();
    const cardpickQty = lot?.quantity ?? 0;

    return {
      importRowId: row.id,
      matchStatus: "MATCHED",
      itemId: item?.id ?? null,
      sku: item?.tcgplayerSkuId ?? null,
      cardName: item?.name ?? null,
      cardpickQty,
      tcgplayerQty,
      deltaQty: tcgplayerQty != null ? tcgplayerQty - cardpickQty : null,
    };
  });
}

export type ReconcileAction = "ACCEPT_CARDPICK" | "ACCEPT_TCGPLAYER" | "SKIP";

export interface ReconcileDecision {
  importRowId: number;
  action: ReconcileAction;
}

export interface ReconcileResult {
  changed: number;
  kept: number;
  skipped: number;
}

/** Nothing changes without an explicit per-row or bulk decision. Every
 * accepted TCGplayer quantity is logged to inventory history with reason
 * RECONCILE; "Accept CardPick" and "Skip" make no changes. */
export function applyReconcileDecisions(batchId: number, decisions: ReconcileDecision[]): ReconcileResult {
  const batch = db.select().from(importBatch).where(eq(importBatch.id, batchId)).get();
  if (!batch) throw new Error("Import batch not found");

  const diff = new Map(getReconcileDiff(batchId).map((d) => [d.importRowId, d]));
  const result: ReconcileResult = { changed: 0, kept: 0, skipped: 0 };
  const toApply = decisions.filter((d) => d.action === "ACCEPT_TCGPLAYER" && diff.get(d.importRowId)?.itemId != null);

  if (toApply.length > 0) {
    snapshotDatabase(`reconcile:${batch.filename}`);
  }

  for (const decision of decisions) {
    const row = diff.get(decision.importRowId);
    if (!row) continue;

    if (decision.action === "SKIP") {
      result.skipped++;
      continue;
    }
    if (decision.action === "ACCEPT_CARDPICK") {
      result.kept++;
      continue;
    }
    if (decision.action === "ACCEPT_TCGPLAYER" && row.itemId != null && row.tcgplayerQty != null) {
      const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, row.itemId)).get();
      if (!lot) continue;
      const before = { quantity: lot.quantity };
      db.update(inventoryLot).set({ quantity: row.tcgplayerQty, updatedAt: new Date().toISOString() }).where(eq(inventoryLot.id, lot.id)).run();
      recordHistory({
        entityType: "inventory_lot",
        entityId: lot.id,
        action: "QTY_CHANGE",
        reason: "RECONCILE",
        before,
        after: { quantity: row.tcgplayerQty },
      });
      result.changed++;
    }
  }

  db.update(importBatch).set({ status: "COMMITTED", committedAt: new Date().toISOString() }).where(eq(importBatch.id, batchId)).run();
  return result;
}
