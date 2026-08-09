import { and, eq, gte, lt, SQL, sql } from "drizzle-orm";
import { db } from "./db/client";
import { history, inventoryItem, inventoryLot, location } from "./db/schema";
import { snapshotDatabase } from "./backup";
import { newGroupId, recordHistory } from "./history";

export interface BulkAssignFilter {
  setName?: string;
  status?: string;
  /** Inclusive first-letter range, e.g. { from: "A", to: "F" } */
  nameRange?: { from: string; to: string };
  currentLocationId?: number | "UNASSIGNED";
}

interface FilteredItem {
  id: number;
  name: string;
  setName: string;
  status: string;
  lotId: number | null;
  currentLocationCode: string | null;
  currentQuantity: number | null;
}

function buildWhere(filter: BulkAssignFilter): SQL | undefined {
  const clauses: SQL[] = [];
  if (filter.setName) clauses.push(eq(inventoryItem.setName, filter.setName));
  if (filter.status) clauses.push(eq(inventoryItem.status, filter.status as never));
  if (filter.nameRange) {
    clauses.push(gte(sql`upper(substr(${inventoryItem.name}, 1, 1))`, filter.nameRange.from.toUpperCase()));
    clauses.push(lt(sql`upper(substr(${inventoryItem.name}, 1, 1))`, String.fromCharCode(filter.nameRange.to.toUpperCase().charCodeAt(0) + 1)));
  }
  if (clauses.length === 0) return undefined;
  return and(...clauses);
}

function fetchFilteredItems(filter: BulkAssignFilter): FilteredItem[] {
  const rows = db
    .select({
      id: inventoryItem.id,
      name: inventoryItem.name,
      setName: inventoryItem.setName,
      status: inventoryItem.status,
      lotId: inventoryLot.id,
      locationCode: location.code,
      quantity: inventoryLot.quantity,
    })
    .from(inventoryItem)
    .leftJoin(inventoryLot, eq(inventoryLot.inventoryItemId, inventoryItem.id))
    .leftJoin(location, eq(location.id, inventoryLot.locationId))
    .where(buildWhere(filter))
    .all();

  let filtered = rows.map((r) => ({
    id: r.id,
    name: r.name,
    setName: r.setName,
    status: r.status,
    lotId: r.lotId,
    currentLocationCode: r.locationCode,
    currentQuantity: r.quantity,
  }));

  if (filter.currentLocationId === "UNASSIGNED") {
    filtered = filtered.filter((r) => r.lotId == null);
  } else if (typeof filter.currentLocationId === "number") {
    const code = db.select({ code: location.code }).from(location).where(eq(location.id, filter.currentLocationId)).get()?.code;
    filtered = filtered.filter((r) => r.currentLocationCode === code);
  }

  return filtered;
}

export interface BulkAssignPreview {
  matchCount: number;
  sample: FilteredItem[];
}

export function previewBulkAssign(filter: BulkAssignFilter): BulkAssignPreview {
  const items = fetchFilteredItems(filter);
  return { matchCount: items.length, sample: items.slice(0, 20) };
}

export interface BulkAssignResult {
  assignedCount: number;
  historyGroupId: string;
  capacityWarning: string | null;
}

/** Assign every item matching `filter` to `targetLocationId` in one action.
 * Creates a lot (seeded from pendingQuantity) for items with none, or moves
 * the existing single lot's location for items that already have one.
 * Writes one grouped history entry per item, all sharing a groupId, so the
 * whole bulk action is reversible as a unit. */
export function applyBulkAssign(filter: BulkAssignFilter, targetLocationId: number): BulkAssignResult {
  const target = db.select().from(location).where(eq(location.id, targetLocationId)).get();
  if (!target) throw new Error("Target location not found");

  const items = fetchFilteredItems(filter);
  if (items.length === 0) return { assignedCount: 0, historyGroupId: "", capacityWarning: null };

  snapshotDatabase(`bulk-assign:${target.code}`);
  const groupId = newGroupId();

  for (const item of items) {
    if (item.lotId != null) {
      const before = db.select().from(inventoryLot).where(eq(inventoryLot.id, item.lotId)).get();
      db.update(inventoryLot)
        .set({ locationId: targetLocationId, updatedAt: new Date().toISOString() })
        .where(eq(inventoryLot.id, item.lotId))
        .run();
      recordHistory({
        entityType: "inventory_lot",
        entityId: item.lotId,
        action: "BULK_MOVE",
        reason: "bulk-location-assignment",
        before,
        after: { locationId: targetLocationId },
        groupId,
      });
    } else {
      const invItem = db.select().from(inventoryItem).where(eq(inventoryItem.id, item.id)).get()!;
      const created = db
        .insert(inventoryLot)
        .values({
          inventoryItemId: item.id,
          locationId: targetLocationId,
          quantity: invItem.pendingQuantity ?? 0,
          isPrimary: true,
        })
        .returning()
        .get();
      recordHistory({
        entityType: "inventory_lot",
        entityId: created.id,
        action: "BULK_ASSIGN",
        reason: "bulk-location-assignment",
        after: created,
        groupId,
      });
    }
  }

  let capacityWarning: string | null = null;
  if (target.kind === "GRANULAR") {
    const skuCount = db
      .select({ id: inventoryLot.id })
      .from(inventoryLot)
      .where(eq(inventoryLot.locationId, targetLocationId))
      .all().length;
    const totalQty = db
      .select({ quantity: inventoryLot.quantity })
      .from(inventoryLot)
      .where(eq(inventoryLot.locationId, targetLocationId))
      .all()
      .reduce((sum, r) => sum + r.quantity, 0);
    if (target.maxSkus != null && skuCount > target.maxSkus) {
      capacityWarning = `${target.code} now holds ${skuCount} SKUs, over its limit of ${target.maxSkus}.`;
    } else if (target.maxQuantity != null && totalQty > target.maxQuantity) {
      capacityWarning = `${target.code} now holds ${totalQty} units, over its limit of ${target.maxQuantity}.`;
    }
  }

  return { assignedCount: items.length, historyGroupId: groupId, capacityWarning };
}

/** Reverse every history entry in a bulk-assignment group, restoring each
 * lot's prior location (or removing lots that were newly created). */
export function reverseBulkAssign(groupId: string): number {
  const entries = db.select().from(history).where(and(eq(history.groupId, groupId), eq(history.reversed, false))).all();
  snapshotDatabase(`reverse-bulk-assign:${groupId}`);

  for (const entry of entries) {
    if (entry.action === "BULK_MOVE" && entry.beforeJson) {
      const before = JSON.parse(entry.beforeJson) as { locationId: number };
      db.update(inventoryLot).set({ locationId: before.locationId }).where(eq(inventoryLot.id, entry.entityId)).run();
    } else if (entry.action === "BULK_ASSIGN") {
      db.delete(inventoryLot).where(eq(inventoryLot.id, entry.entityId)).run();
    }
    db.update(history).set({ reversed: true }).where(eq(history.id, entry.id)).run();
  }
  return entries.length;
}

export function listActiveLocations(): { id: number; code: string; kind: string }[] {
  return db.select({ id: location.id, code: location.code, kind: location.kind }).from(location).where(eq(location.active, true)).all();
}
