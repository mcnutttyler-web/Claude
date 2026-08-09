import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryLot } from "@/db/schema";
import { parseCsv } from "./csv";
import { applyMapping, type ColumnMap } from "./mapping";
import { splitConditionAndPrinting } from "./condition";
import { buildMatchKey } from "./matchKey";
import { findMatch } from "./matching";
import { logHistory } from "./history";

export interface ReconcileRow {
  rowIndex: number;
  tcgplayerSkuId: string | null;
  name: string;
  cardPickQty: number | null;
  tcgplayerQty: number;
  delta: number;
  inventoryItemId: number | null;
  matchStatus: "MATCHED" | "AMBIGUOUS" | "UNMATCHED";
}

export function analyzeReconcile(fileContent: string, columnMap: ColumnMap): ReconcileRow[] {
  const { rows } = parseCsv(fileContent);
  const out: ReconcileRow[] = [];

  rows.forEach((raw, rowIndex) => {
    const m = applyMapping(raw, columnMap);
    const name = m.name?.trim();
    if (!name) return;

    const tcgplayerSkuId = m.tcgplayerSkuId?.trim() || null;
    const setName = m.setName?.trim() || null;
    const cardNumber = m.cardNumber?.trim() || null;
    const { condition, printing } = splitConditionAndPrinting(m.conditionRaw?.trim() || "Near Mint");
    const quantityParsed = Number.parseInt((m.quantity ?? "0").replace(/[^0-9-]/g, ""), 10);
    const tcgplayerQty = Number.isFinite(quantityParsed) ? quantityParsed : 0;

    const matchKey = setName
      ? buildMatchKey({ name, setName, cardNumber, condition, printing })
      : "__unresolved__";
    const match = findMatch({ skuId: tcgplayerSkuId, condition, printing, matchKey });

    let cardPickQty: number | null = null;
    let inventoryItemId: number | null = null;
    if (match.status === "MATCHED" && match.itemId) {
      inventoryItemId = match.itemId;
      const lot = db
        .select()
        .from(inventoryLot)
        .where(and(eq(inventoryLot.inventoryItemId, match.itemId), eq(inventoryLot.isPrimary, true)))
        .get();
      cardPickQty = lot?.quantity ?? 0;
    }

    out.push({
      rowIndex,
      tcgplayerSkuId,
      name,
      cardPickQty,
      tcgplayerQty,
      delta: (cardPickQty ?? 0) - tcgplayerQty,
      inventoryItemId,
      matchStatus: match.status === "NEW" ? "UNMATCHED" : match.status,
    });
  });

  return out;
}

export type ReconcileAcceptSide = "CARDPICK" | "TCGPLAYER";

export interface ReconcileAcceptance {
  inventoryItemId: number;
  cardPickQty: number;
  tcgplayerQty: number;
  accept: ReconcileAcceptSide;
}

/** Applies approved reconcile decisions. Nothing changes without explicit per-row/bulk approval. */
export function applyReconcile(acceptances: ReconcileAcceptance[]) {
  const batchGroupId = randomUUID();
  let applied = 0;

  for (const a of acceptances) {
    if (a.accept !== "TCGPLAYER") continue; // CARDPICK means "keep ours" — no write needed.
    const lot = db
      .select()
      .from(inventoryLot)
      .where(and(eq(inventoryLot.inventoryItemId, a.inventoryItemId), eq(inventoryLot.isPrimary, true)))
      .get();
    if (!lot) continue;

    db.update(inventoryLot)
      .set({ quantity: a.tcgplayerQty, updatedAt: new Date().toISOString() })
      .where(eq(inventoryLot.id, lot.id))
      .run();

    logHistory({
      inventoryItemId: a.inventoryItemId,
      action: "RECONCILE",
      field: "quantity",
      oldValue: a.cardPickQty,
      newValue: a.tcgplayerQty,
      batchGroupId,
      notes: "Accepted TCGplayer quantity during reconcile",
    });
    applied++;
  }

  return { batchGroupId, applied };
}
