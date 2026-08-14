import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "./db/client";
import { history, inventoryItem, inventoryLot, location, order, orderLine, settings } from "./db/schema";
import { snapshotDatabase } from "./backup";
import { newGroupId, recordHistory } from "./history";
import { recomputeOrderStatus } from "./import/order-import";

const LATE_THRESHOLD_SETTING_KEY = "pick.lateThresholdHours";
const DEFAULT_LATE_THRESHOLD_HOURS = 24;

export function getLateThresholdHours(): number {
  const row = db.select().from(settings).where(eq(settings.key, LATE_THRESHOLD_SETTING_KEY)).get();
  return row ? Number(row.value) : DEFAULT_LATE_THRESHOLD_HOURS;
}

export function setLateThresholdHours(hours: number) {
  const existing = db.select().from(settings).where(eq(settings.key, LATE_THRESHOLD_SETTING_KEY)).get();
  if (existing) {
    db.update(settings).set({ value: String(hours), updatedAt: new Date().toISOString() }).where(eq(settings.key, LATE_THRESHOLD_SETTING_KEY)).run();
  } else {
    db.insert(settings).values({ key: LATE_THRESHOLD_SETTING_KEY, value: String(hours) }).run();
  }
}

export function isOrderLate(importedAt: string, thresholdHours = getLateThresholdHours()): boolean {
  const ageMs = Date.now() - new Date(importedAt).getTime();
  return ageMs > thresholdHours * 60 * 60 * 1000;
}

export interface PickListLine {
  lineId: number;
  orderId: number;
  externalOrderId: string;
  rawName: string;
  quantityOrdered: number;
  quantityPicked: number;
  pickState: string;
  matchStatus: string;
  locationCode: string | null;
  itemName: string | null;
  late: boolean;
}

/** Lines needing action, grouped by location in walk order. Lines with no
 * resolved match sort first since they can't be located yet. */
export function getPickList(): PickListLine[] {
  const rows = db
    .select({
      lineId: orderLine.id,
      orderId: orderLine.orderId,
      externalOrderId: order.externalOrderId,
      importedAt: order.importedAt,
      rawName: orderLine.rawName,
      quantityOrdered: orderLine.quantityOrdered,
      quantityPicked: orderLine.quantityPicked,
      pickState: orderLine.pickState,
      matchStatus: orderLine.matchStatus,
      matchedInventoryItemId: orderLine.matchedInventoryItemId,
      itemName: inventoryItem.name,
    })
    .from(orderLine)
    .innerJoin(order, eq(order.id, orderLine.orderId))
    .leftJoin(inventoryItem, eq(inventoryItem.id, orderLine.matchedInventoryItemId))
    .where(and(ne(orderLine.pickState, "PULLED"), inArray(order.status, ["PENDING", "NEEDS_ATTENTION"])))
    .all();

  const withLocation = rows.map((r) => {
    let locationCode: string | null = null;
    if (r.matchedInventoryItemId) {
      const lot = db
        .select({ code: location.code })
        .from(inventoryLot)
        .innerJoin(location, eq(location.id, inventoryLot.locationId))
        .where(eq(inventoryLot.inventoryItemId, r.matchedInventoryItemId))
        .get();
      locationCode = lot?.code ?? null;
    }
    return {
      lineId: r.lineId,
      orderId: r.orderId,
      externalOrderId: r.externalOrderId,
      rawName: r.rawName,
      quantityOrdered: r.quantityOrdered,
      quantityPicked: r.quantityPicked,
      pickState: r.pickState,
      matchStatus: r.matchStatus,
      locationCode,
      itemName: r.itemName,
      late: isOrderLate(r.importedAt),
    };
  });

  return withLocation.sort((a, b) => {
    if (a.locationCode == null && b.locationCode != null) return -1;
    if (a.locationCode != null && b.locationCode == null) return 1;
    if (a.locationCode == null && b.locationCode == null) return 0;
    return a.locationCode!.localeCompare(b.locationCode!);
  });
}

export function resolveOrderLineMatch(lineId: number, inventoryItemId: number) {
  db.update(orderLine)
    .set({ matchedInventoryItemId: inventoryItemId, matchStatus: "MATCHED", updatedAt: new Date().toISOString() })
    .where(eq(orderLine.id, lineId))
    .run();
  const line = db.select().from(orderLine).where(eq(orderLine.id, lineId)).get();
  if (line) recomputeOrderStatus(line.orderId);
}

export function markPulled(lineId: number, quantityPicked?: number) {
  const line = db.select().from(orderLine).where(eq(orderLine.id, lineId)).get();
  if (!line) throw new Error("Order line not found");
  db.update(orderLine)
    .set({ pickState: "PULLED", quantityPicked: quantityPicked ?? line.quantityOrdered, shortReason: null, updatedAt: new Date().toISOString() })
    .where(eq(orderLine.id, lineId))
    .run();
  recomputeOrderStatus(line.orderId);
}

export interface MarkShortOptions {
  reason: string;
  /** Optional inventory correction: set on-hand quantity at this location to N. */
  correctedQuantity?: number;
}

export function markShort(lineId: number, options: MarkShortOptions) {
  const line = db.select().from(orderLine).where(eq(orderLine.id, lineId)).get();
  if (!line) throw new Error("Order line not found");

  db.update(orderLine)
    .set({ pickState: "SHORT", shortReason: options.reason, updatedAt: new Date().toISOString() })
    .where(eq(orderLine.id, lineId))
    .run();

  if (options.correctedQuantity != null && line.matchedInventoryItemId) {
    const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, line.matchedInventoryItemId)).get();
    if (lot) {
      const before = { quantity: lot.quantity };
      db.update(inventoryLot).set({ quantity: options.correctedQuantity, updatedAt: new Date().toISOString() }).where(eq(inventoryLot.id, lot.id)).run();
      recordHistory({
        entityType: "inventory_lot",
        entityId: lot.id,
        action: "QTY_CORRECTION",
        reason: "SHORT_PICK",
        before,
        after: { quantity: options.correctedQuantity },
      });
    }
  }

  recomputeOrderStatus(line.orderId);
}

export type ShortResolution = "FOUND_ELSEWHERE" | "REDUCE_QUANTITY" | "CANCEL_LINE";

export function resolveShort(lineId: number, resolution: ShortResolution, reducedQuantity?: number) {
  const line = db.select().from(orderLine).where(eq(orderLine.id, lineId)).get();
  if (!line) throw new Error("Order line not found");

  if (resolution === "FOUND_ELSEWHERE") {
    db.update(orderLine)
      .set({ pickState: "PENDING", resolutionAction: resolution, shortReason: null, updatedAt: new Date().toISOString() })
      .where(eq(orderLine.id, lineId))
      .run();
  } else if (resolution === "REDUCE_QUANTITY") {
    const qty = reducedQuantity ?? line.quantityPicked;
    db.update(orderLine)
      .set({ quantityOrdered: qty, quantityPicked: qty, pickState: "PULLED", resolutionAction: resolution, shortReason: null, updatedAt: new Date().toISOString() })
      .where(eq(orderLine.id, lineId))
      .run();
  } else if (resolution === "CANCEL_LINE") {
    db.update(orderLine)
      .set({ pickState: "PULLED", quantityPicked: 0, resolutionAction: resolution, shortReason: null, updatedAt: new Date().toISOString() })
      .where(eq(orderLine.id, lineId))
      .run();
  }

  recomputeOrderStatus(line.orderId);
}

export interface FulfillResult {
  orderId: number;
  linesFulfilled: number;
  historyGroupId: string;
}

/** Reduce on-hand quantities for a READY_TO_PACK order. Reversible via a
 * compensating history entry (never deletes the original). */
export function confirmFulfillment(orderId: number): FulfillResult {
  const orderRecord = db.select().from(order).where(eq(order.id, orderId)).get();
  if (!orderRecord) throw new Error("Order not found");
  if (orderRecord.status !== "READY_TO_PACK") throw new Error("Order is not ready to pack");

  snapshotDatabase(`fulfill:${orderRecord.externalOrderId}`);
  const groupId = newGroupId();
  const lines = db.select().from(orderLine).where(eq(orderLine.orderId, orderId)).all();

  let linesFulfilled = 0;
  for (const line of lines) {
    if (line.resolutionAction === "CANCEL_LINE" || !line.matchedInventoryItemId || line.quantityPicked === 0) continue;
    const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, line.matchedInventoryItemId)).get();
    if (!lot) continue;
    const before = { quantity: lot.quantity };
    const nextQty = Math.max(0, lot.quantity - line.quantityPicked);
    db.update(inventoryLot).set({ quantity: nextQty, updatedAt: new Date().toISOString() }).where(eq(inventoryLot.id, lot.id)).run();
    recordHistory({
      entityType: "inventory_lot",
      entityId: lot.id,
      action: "FULFILL",
      reason: `order:${orderRecord.externalOrderId}`,
      before,
      after: { quantity: nextQty },
      groupId,
    });
    linesFulfilled++;
  }

  db.update(order).set({ status: "FULFILLED" }).where(eq(order.id, orderId)).run();
  return { orderId, linesFulfilled, historyGroupId: groupId };
}

/** Reverses a fulfillment by writing compensating history entries that add
 * the quantities back — the original FULFILL entries are kept, not deleted. */
export function reverseFulfillment(historyGroupId: string): number {
  const entries = db.select().from(history).where(and(eq(history.groupId, historyGroupId), eq(history.action, "FULFILL"))).all();
  if (entries.length === 0) throw new Error("No fulfillment found for that group");

  snapshotDatabase(`reverse-fulfill:${historyGroupId}`);
  const compensationGroupId = newGroupId();

  for (const entry of entries) {
    const after = JSON.parse(entry.afterJson ?? "{}") as { quantity: number };
    const before = JSON.parse(entry.beforeJson ?? "{}") as { quantity: number };
    const lot = db.select().from(inventoryLot).where(eq(inventoryLot.id, entry.entityId)).get();
    if (!lot) continue;
    db.update(inventoryLot).set({ quantity: before.quantity, updatedAt: new Date().toISOString() }).where(eq(inventoryLot.id, lot.id)).run();
    recordHistory({
      entityType: "inventory_lot",
      entityId: lot.id,
      action: "FULFILL_REVERSED",
      reason: `reversal of history #${entry.id}`,
      before: after,
      after: before,
      groupId: compensationGroupId,
    });
    db.update(history).set({ reversed: true }).where(eq(history.id, entry.id)).run();
  }

  const orderRow = db.select().from(order).where(eq(order.externalOrderId, entries[0].reason?.replace("order:", "") ?? "")).get();
  if (orderRow) {
    db.update(order).set({ status: "READY_TO_PACK" }).where(eq(order.id, orderRow.id)).run();
  }

  return entries.length;
}

export function findFulfillmentGroupId(externalOrderId: string): string | null {
  const row = db
    .select({ groupId: history.groupId })
    .from(history)
    .where(and(eq(history.action, "FULFILL"), eq(history.reason, `order:${externalOrderId}`), eq(history.reversed, false)))
    .get();
  return row?.groupId ?? null;
}

export function oldestUnpickedOrderAgeMs(): number | null {
  const rows = db.select({ importedAt: order.importedAt }).from(order).where(inArray(order.status, ["PENDING", "NEEDS_ATTENTION"])).all();
  if (rows.length === 0) return null;
  const oldest = rows.reduce((min, r) => Math.min(min, new Date(r.importedAt).getTime()), Date.now());
  return Date.now() - oldest;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
