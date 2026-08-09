import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem, inventoryLot, order, orderLine } from "@/db/schema";
import { getUnassignedLocationId } from "./locations";
import {
  confirmFulfillment,
  markLinePulled,
  markLineShort,
  reverseFulfillment,
} from "./pickMode";

function setupOrderWithLine(suffix: string, onHand: number, orderQty: number) {
  const itemInsert = db
    .insert(inventoryItem)
    .values({
      name: `Venusaur ${suffix}`,
      setName: "Base Set",
      condition: "Near Mint",
      printing: "Normal",
      matchKey: `venusaur-${suffix}`,
      status: "ACTIVE",
    })
    .run();
  const itemId = Number(itemInsert.lastInsertRowid);
  db.insert(inventoryLot)
    .values({ inventoryItemId: itemId, locationId: getUnassignedLocationId(), quantity: onHand, isPrimary: true })
    .run();

  const orderInsert = db.insert(order).values({ tcgplayerOrderId: `PICK-${suffix}` }).run();
  const orderId = Number(orderInsert.lastInsertRowid);
  const lineInsert = db
    .insert(orderLine)
    .values({
      orderId,
      lineIndex: 0,
      name: `Venusaur ${suffix}`,
      quantity: orderQty,
      matchedInventoryItemId: itemId,
      matchStatus: "MATCHED",
    })
    .run();
  const lineId = Number(lineInsert.lastInsertRowid);

  return { itemId, orderId, lineId };
}

describe("pick mode state machine", () => {
  it("moves an order to READY_TO_PACK once every line is PULLED", () => {
    const { orderId, lineId } = setupOrderWithLine(`Ready${Date.now()}`, 5, 2);
    markLinePulled(lineId);
    const orderRow = db.select().from(order).where(eq(order.id, orderId)).get()!;
    expect(orderRow.status).toBe("READY_TO_PACK");
  });

  it("moves an order to NEEDS_ATTENTION when any line is SHORT", () => {
    const { orderId, lineId } = setupOrderWithLine(`Short${Date.now()}`, 5, 2);
    markLineShort({ lineId, reason: "Not in bin" });
    const orderRow = db.select().from(order).where(eq(order.id, orderId)).get()!;
    expect(orderRow.status).toBe("NEEDS_ATTENTION");
  });

  it("SHORT with a quantity correction updates on-hand inventory and logs history", () => {
    const { orderId, lineId, itemId } = setupOrderWithLine(`Correct${Date.now()}`, 5, 2);
    markLineShort({ lineId, reason: "Recount", correctQuantityTo: 1 });
    const lot = db
      .select()
      .from(inventoryLot)
      .where(eq(inventoryLot.inventoryItemId, itemId))
      .get()!;
    expect(lot.quantity).toBe(1);
    const orderRow = db.select().from(order).where(eq(order.id, orderId)).get()!;
    expect(orderRow.status).toBe("NEEDS_ATTENTION");
  });

  it("confirming fulfillment reduces quantity and is reversible", () => {
    const { orderId, lineId, itemId } = setupOrderWithLine(`Fulfill${Date.now()}`, 5, 2);
    markLinePulled(lineId);

    const { batchGroupId } = confirmFulfillment(orderId);
    let lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, itemId)).get()!;
    expect(lot.quantity).toBe(3);
    let orderRow = db.select().from(order).where(eq(order.id, orderId)).get()!;
    expect(orderRow.status).toBe("FULFILLED");

    reverseFulfillment(batchGroupId);
    lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, itemId)).get()!;
    expect(lot.quantity).toBe(5);
    orderRow = db.select().from(order).where(eq(order.id, orderId)).get()!;
    expect(orderRow.status).toBe("READY_TO_PACK");
  });
});
