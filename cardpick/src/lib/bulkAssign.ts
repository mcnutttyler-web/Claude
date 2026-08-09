import { randomUUID } from "node:crypto";
import { and, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem, inventoryLot, location, inventoryHistory } from "@/db/schema";
import { logHistory } from "./history";
import { snapshot } from "@/db/backup";
import { getUnassignedLocationId } from "./locations";

export interface BulkAssignFilter {
  setName?: string;
  status?: string;
  nameFrom?: string; // e.g. "A"
  nameTo?: string; // e.g. "F"
  currentLocationId?: number | "unassigned";
}

function resolveCurrentLocationId(filter: BulkAssignFilter): number | undefined {
  if (filter.currentLocationId === "unassigned") return getUnassignedLocationId();
  if (typeof filter.currentLocationId === "number") return filter.currentLocationId;
  return undefined;
}

function matchingLotRows(filter: BulkAssignFilter) {
  const clauses: SQL[] = [eq(inventoryLot.isPrimary, true)];
  if (filter.setName) clauses.push(eq(inventoryItem.setName, filter.setName));
  if (filter.status) {
    clauses.push(eq(inventoryItem.status, filter.status as typeof inventoryItem.$inferSelect.status));
  }
  if (filter.nameFrom) clauses.push(gte(inventoryItem.name, filter.nameFrom));
  if (filter.nameTo) clauses.push(lte(inventoryItem.name, filter.nameTo + "￿"));
  const currentLocationId = resolveCurrentLocationId(filter);
  if (currentLocationId != null) clauses.push(eq(inventoryLot.locationId, currentLocationId));

  return db
    .select({
      itemId: inventoryItem.id,
      name: inventoryItem.name,
      setName: inventoryItem.setName,
      lotId: inventoryLot.id,
      currentLocationId: inventoryLot.locationId,
      currentLocationCode: location.code,
    })
    .from(inventoryItem)
    .innerJoin(inventoryLot, eq(inventoryLot.inventoryItemId, inventoryItem.id))
    .innerJoin(location, eq(location.id, inventoryLot.locationId))
    .where(and(...clauses))
    .all();
}

export function previewBulkAssign(filter: BulkAssignFilter, sampleSize = 20) {
  const rows = matchingLotRows(filter);
  return { matchCount: rows.length, sample: rows.slice(0, sampleSize) };
}

export interface ApplyBulkAssignResult {
  updatedCount: number;
  batchGroupId: string;
}

export function applyBulkAssign(filter: BulkAssignFilter, targetLocationId: number): ApplyBulkAssignResult {
  snapshot("bulk-assign");
  const rows = matchingLotRows(filter);
  const batchGroupId = randomUUID();
  let updatedCount = 0;

  for (const row of rows) {
    if (row.currentLocationId === targetLocationId) continue;
    db.update(inventoryLot)
      .set({ locationId: targetLocationId, updatedAt: new Date().toISOString() })
      .where(eq(inventoryLot.id, row.lotId))
      .run();
    logHistory({
      inventoryItemId: row.itemId,
      action: "BULK_ASSIGN",
      field: "location_id",
      oldValue: row.currentLocationId,
      newValue: targetLocationId,
      batchGroupId,
      reversible: true,
    });
    updatedCount++;
  }

  return { updatedCount, batchGroupId };
}

/** Reverses a bulk-assign batch by moving every affected lot back to its prior location. */
export function reverseBulkAssign(batchGroupId: string) {
  const entries = db
    .select()
    .from(inventoryHistory)
    .where(and(eq(inventoryHistory.batchGroupId, batchGroupId), eq(inventoryHistory.action, "BULK_ASSIGN")))
    .all();

  for (const entry of entries) {
    if (entry.reversedAt || !entry.inventoryItemId || entry.oldValue == null) continue;
    const lot = db
      .select()
      .from(inventoryLot)
      .where(and(eq(inventoryLot.inventoryItemId, entry.inventoryItemId), eq(inventoryLot.isPrimary, true)))
      .get();
    if (!lot) continue;
    db.update(inventoryLot)
      .set({ locationId: Number(entry.oldValue), updatedAt: new Date().toISOString() })
      .where(eq(inventoryLot.id, lot.id))
      .run();
    db.update(inventoryHistory)
      .set({ reversedAt: new Date().toISOString() })
      .where(eq(inventoryHistory.id, entry.id))
      .run();
  }
}
