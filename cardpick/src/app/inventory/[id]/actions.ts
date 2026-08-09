"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem, inventoryLot } from "@/db/schema";
import { logHistory } from "@/lib/history";
import { parseCents } from "@/lib/money";

export async function updateSellPriceAction(itemId: number, sellPriceInput: string) {
  const cents = parseCents(sellPriceInput);
  const existing = db.select().from(inventoryItem).where(eq(inventoryItem.id, itemId)).get();
  if (!existing) throw new Error("Item not found");
  db.update(inventoryItem)
    .set({ sellPriceCents: cents, updatedAt: new Date().toISOString() })
    .where(eq(inventoryItem.id, itemId))
    .run();
  logHistory({
    inventoryItemId: itemId,
    action: "PRICE_CHANGE",
    field: "sell_price_cents",
    oldValue: existing.sellPriceCents,
    newValue: cents,
  });
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
}

export async function updateStatusAction(itemId: number, status: string) {
  const existing = db.select().from(inventoryItem).where(eq(inventoryItem.id, itemId)).get();
  if (!existing) throw new Error("Item not found");
  db.update(inventoryItem)
    .set({ status: status as typeof inventoryItem.$inferSelect.status, updatedAt: new Date().toISOString() })
    .where(eq(inventoryItem.id, itemId))
    .run();
  logHistory({
    inventoryItemId: itemId,
    action: status === "INACTIVE" ? "DELETE" : "UPDATE",
    field: "status",
    oldValue: existing.status,
    newValue: status,
  });
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
}

export async function setQuantityAction(itemId: number, quantity: number) {
  const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, itemId)).get();
  if (!lot) throw new Error("Lot not found");
  db.update(inventoryLot)
    .set({ quantity, updatedAt: new Date().toISOString() })
    .where(eq(inventoryLot.id, lot.id))
    .run();
  logHistory({
    inventoryItemId: itemId,
    action: "QTY_CHANGE",
    field: "quantity",
    oldValue: lot.quantity,
    newValue: quantity,
    notes: "Manual correction",
  });
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
}

export async function moveLotAction(itemId: number, newLocationId: number) {
  const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, itemId)).get();
  if (!lot) throw new Error("Lot not found");
  db.update(inventoryLot)
    .set({ locationId: newLocationId, updatedAt: new Date().toISOString() })
    .where(eq(inventoryLot.id, lot.id))
    .run();
  logHistory({
    inventoryItemId: itemId,
    action: "MOVE",
    field: "location_id",
    oldValue: lot.locationId,
    newValue: newLocationId,
  });
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
}
