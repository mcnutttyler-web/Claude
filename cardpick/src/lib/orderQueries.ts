import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import { order, orderLine, location, inventoryLot, inventoryHistory } from "@/db/schema";

const pickedLocation = alias(location, "picked_location");
const currentLocation = alias(location, "current_location");

export function listOrders() {
  return db.select().from(order).orderBy(asc(order.importedAt)).all();
}

export function getOrderDetail(orderId: number) {
  const orderRow = db.select().from(order).where(eq(order.id, orderId)).get();
  if (!orderRow) return null;
  const lines = db
    .select({
      id: orderLine.id,
      lineIndex: orderLine.lineIndex,
      name: orderLine.name,
      setName: orderLine.setName,
      cardNumber: orderLine.cardNumber,
      condition: orderLine.condition,
      printing: orderLine.printing,
      quantity: orderLine.quantity,
      matchStatus: orderLine.matchStatus,
      matchedInventoryItemId: orderLine.matchedInventoryItemId,
      pickState: orderLine.pickState,
      shortReason: orderLine.shortReason,
      resolution: orderLine.resolution,
      pickedLocationCode: pickedLocation.code,
      currentLocationCode: currentLocation.code,
      currentQuantity: inventoryLot.quantity,
    })
    .from(orderLine)
    .leftJoin(pickedLocation, eq(pickedLocation.id, orderLine.pickedLocationId))
    .leftJoin(
      inventoryLot,
      and(eq(inventoryLot.inventoryItemId, orderLine.matchedInventoryItemId), eq(inventoryLot.isPrimary, true)),
    )
    .leftJoin(currentLocation, eq(currentLocation.id, inventoryLot.locationId))
    .where(eq(orderLine.orderId, orderId))
    .orderBy(asc(currentLocation.code), asc(orderLine.lineIndex))
    .all();
  return { order: orderRow, lines };
}

/** Most recent not-yet-reversed FULFILLMENT batch for this order, if any. */
export function getReversibleFulfillmentBatch(orderId: number): string | null {
  const row = db
    .select({ batchGroupId: inventoryHistory.batchGroupId })
    .from(inventoryHistory)
    .where(
      and(
        eq(inventoryHistory.orderId, orderId),
        eq(inventoryHistory.action, "FULFILLMENT"),
      ),
    )
    .all()
    .find((r) => r.batchGroupId);
  if (!row?.batchGroupId) return null;

  const entries = db
    .select()
    .from(inventoryHistory)
    .where(and(eq(inventoryHistory.batchGroupId, row.batchGroupId), eq(inventoryHistory.action, "FULFILLMENT")))
    .all();
  const allReversed = entries.length > 0 && entries.every((e) => e.reversedAt);
  return allReversed ? null : row.batchGroupId;
}
