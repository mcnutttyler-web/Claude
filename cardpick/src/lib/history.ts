import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryHistory } from "@/db/schema";

export function getItemHistory(inventoryItemId: number) {
  return db
    .select()
    .from(inventoryHistory)
    .where(eq(inventoryHistory.inventoryItemId, inventoryItemId))
    .orderBy(desc(inventoryHistory.createdAt))
    .all();
}

type HistoryAction =
  | "CREATE"
  | "UPDATE"
  | "PRICE_CHANGE"
  | "QTY_CHANGE"
  | "MOVE"
  | "BULK_ASSIGN"
  | "RECONCILE"
  | "FULFILLMENT"
  | "FULFILLMENT_REVERSAL"
  | "IMPORT"
  | "DELETE"
  | "PURGE";

export interface LogHistoryEntry {
  inventoryItemId?: number | null;
  orderId?: number | null;
  action: HistoryAction;
  field?: string | null;
  oldValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
  batchGroupId?: string | null;
  reversible?: boolean;
  notes?: string | null;
}

export function logHistory(entry: LogHistoryEntry) {
  db.insert(inventoryHistory)
    .values({
      inventoryItemId: entry.inventoryItemId ?? null,
      orderId: entry.orderId ?? null,
      action: entry.action,
      field: entry.field ?? null,
      oldValue: entry.oldValue === undefined || entry.oldValue === null ? null : String(entry.oldValue),
      newValue: entry.newValue === undefined || entry.newValue === null ? null : String(entry.newValue),
      batchGroupId: entry.batchGroupId ?? null,
      reversible: entry.reversible ?? false,
      notes: entry.notes ?? null,
    })
    .run();
}
