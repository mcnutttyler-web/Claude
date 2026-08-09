import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { order, orderLine, inventoryLot, inventoryHistory } from "@/db/schema";
import { logHistory } from "./history";
import { snapshot } from "@/db/backup";

export function recomputeOrderStatus(orderId: number) {
  const lines = db.select().from(orderLine).where(eq(orderLine.orderId, orderId)).all();
  const current = db.select().from(order).where(eq(order.id, orderId)).get();
  if (!current || current.status === "FULFILLED" || current.status === "CANCELLED") return;

  const hasShort = lines.some((l) => l.pickState === "SHORT");
  const allPulled = lines.length > 0 && lines.every((l) => l.pickState === "PULLED");

  const status = hasShort ? "NEEDS_ATTENTION" : allPulled ? "READY_TO_PACK" : "PENDING";
  db.update(order).set({ status, updatedAt: new Date().toISOString() }).where(eq(order.id, orderId)).run();
}

export function markLinePulled(lineId: number, locationId?: number | null) {
  const line = db.select().from(orderLine).where(eq(orderLine.id, lineId)).get();
  if (!line) throw new Error("Order line not found");
  db.update(orderLine)
    .set({
      pickState: "PULLED",
      shortReason: null,
      resolution: null,
      pickedLocationId: locationId ?? line.pickedLocationId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(orderLine.id, lineId))
    .run();
  recomputeOrderStatus(line.orderId);
}

export interface MarkLineShortInput {
  lineId: number;
  reason: string;
  /** Optional inventory correction: sets on-hand qty at the item's lot to this value. */
  correctQuantityTo?: number;
}

export function markLineShort({ lineId, reason, correctQuantityTo }: MarkLineShortInput) {
  const line = db.select().from(orderLine).where(eq(orderLine.id, lineId)).get();
  if (!line) throw new Error("Order line not found");

  db.update(orderLine)
    .set({ pickState: "SHORT", shortReason: reason, updatedAt: new Date().toISOString() })
    .where(eq(orderLine.id, lineId))
    .run();

  if (correctQuantityTo != null && line.matchedInventoryItemId) {
    const lot = db
      .select()
      .from(inventoryLot)
      .where(and(eq(inventoryLot.inventoryItemId, line.matchedInventoryItemId), eq(inventoryLot.isPrimary, true)))
      .get();
    if (lot) {
      db.update(inventoryLot)
        .set({ quantity: correctQuantityTo, updatedAt: new Date().toISOString() })
        .where(eq(inventoryLot.id, lot.id))
        .run();
      logHistory({
        inventoryItemId: line.matchedInventoryItemId,
        orderId: line.orderId,
        action: "QTY_CHANGE",
        field: "quantity",
        oldValue: lot.quantity,
        newValue: correctQuantityTo,
        notes: `Correction from SHORT pick on order line ${lineId}: ${reason}`,
      });
    }
  }

  recomputeOrderStatus(line.orderId);
}

export type ShortResolution = "FOUND_ELSEWHERE" | "REDUCE_QUANTITY" | "CANCEL_LINE";

export function resolveShortLine(
  lineId: number,
  resolution: ShortResolution,
  opts?: { newQuantity?: number },
) {
  const line = db.select().from(orderLine).where(eq(orderLine.id, lineId)).get();
  if (!line) throw new Error("Order line not found");

  if (resolution === "FOUND_ELSEWHERE") {
    db.update(orderLine)
      .set({ pickState: "PENDING", resolution, shortReason: null, updatedAt: new Date().toISOString() })
      .where(eq(orderLine.id, lineId))
      .run();
  } else if (resolution === "REDUCE_QUANTITY") {
    const newQuantity = opts?.newQuantity ?? Math.max(0, line.quantity - 1);
    db.update(orderLine)
      .set({
        quantity: newQuantity,
        pickState: "PENDING",
        resolution,
        shortReason: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(orderLine.id, lineId))
      .run();
  } else if (resolution === "CANCEL_LINE") {
    db.update(orderLine)
      .set({ pickState: "PULLED", resolution, quantity: 0, updatedAt: new Date().toISOString() })
      .where(eq(orderLine.id, lineId))
      .run();
  }

  recomputeOrderStatus(line.orderId);
}

export interface ConfirmFulfillmentResult {
  batchGroupId: string;
  linesFulfilled: number;
}

/** Reduces on-hand quantities for every PULLED line and marks the order FULFILLED. Reversible. */
export function confirmFulfillment(orderId: number): ConfirmFulfillmentResult {
  snapshot("fulfillment");
  const batchGroupId = randomUUID();
  const lines = db
    .select()
    .from(orderLine)
    .where(and(eq(orderLine.orderId, orderId), eq(orderLine.pickState, "PULLED")))
    .all();

  let linesFulfilled = 0;
  for (const line of lines) {
    if (!line.matchedInventoryItemId || line.quantity <= 0) continue;
    const lot = db
      .select()
      .from(inventoryLot)
      .where(and(eq(inventoryLot.inventoryItemId, line.matchedInventoryItemId), eq(inventoryLot.isPrimary, true)))
      .get();
    if (!lot) continue;

    const newQuantity = Math.max(0, lot.quantity - line.quantity);
    db.update(inventoryLot)
      .set({ quantity: newQuantity, updatedAt: new Date().toISOString() })
      .where(eq(inventoryLot.id, lot.id))
      .run();

    logHistory({
      inventoryItemId: line.matchedInventoryItemId,
      orderId,
      action: "FULFILLMENT",
      field: "quantity",
      oldValue: lot.quantity,
      newValue: newQuantity,
      batchGroupId,
      reversible: true,
      notes: `Order line ${line.id} (qty ${line.quantity})`,
    });
    linesFulfilled++;
  }

  db.update(order)
    .set({ status: "FULFILLED", updatedAt: new Date().toISOString() })
    .where(eq(order.id, orderId))
    .run();

  return { batchGroupId, linesFulfilled };
}

/** Reverses a fulfillment batch: restores quantities via a compensating history entry. */
export function reverseFulfillment(batchGroupId: string) {
  const entries = db
    .select()
    .from(inventoryHistory)
    .where(and(eq(inventoryHistory.batchGroupId, batchGroupId), eq(inventoryHistory.action, "FULFILLMENT")))
    .all();

  let orderId: number | null = null;

  for (const entry of entries) {
    if (entry.reversedAt) continue;
    if (!entry.inventoryItemId) continue;
    const lot = db
      .select()
      .from(inventoryLot)
      .where(and(eq(inventoryLot.inventoryItemId, entry.inventoryItemId), eq(inventoryLot.isPrimary, true)))
      .get();
    if (!lot) continue;

    const delta = Number(entry.oldValue) - Number(entry.newValue);
    const restoredQuantity = lot.quantity + delta;

    db.update(inventoryLot)
      .set({ quantity: restoredQuantity, updatedAt: new Date().toISOString() })
      .where(eq(inventoryLot.id, lot.id))
      .run();

    db.update(inventoryHistory)
      .set({ reversedAt: new Date().toISOString() })
      .where(eq(inventoryHistory.id, entry.id))
      .run();

    logHistory({
      inventoryItemId: entry.inventoryItemId,
      orderId: entry.orderId,
      action: "FULFILLMENT_REVERSAL",
      field: "quantity",
      oldValue: lot.quantity,
      newValue: restoredQuantity,
      batchGroupId,
      notes: `Reversal of fulfillment entry ${entry.id}`,
    });

    orderId = entry.orderId;
  }

  if (orderId) {
    db.update(order)
      .set({ status: "READY_TO_PACK", updatedAt: new Date().toISOString() })
      .where(eq(order.id, orderId))
      .run();
  }
}
