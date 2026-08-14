"use server";

import { revalidatePath } from "next/cache";
import { eq, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { inventoryItem, inventoryLot, location } from "../db/schema";
import { startImport, previewImport, commitInventoryImport, type StartImportResult, type PreviewResult } from "../import/inventory-import";
import type { FieldMapping } from "../import/mapping";
import { suggestLocation, type SuggestedLocation } from "../location-suggest";
import { recordHistory } from "../history";

export async function startInventoryImportAction(formData: FormData): Promise<StartImportResult | { error: string }> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };
  const contents = await file.text();
  return startImport("INVENTORY", file.name, contents);
}

export async function previewInventoryImportAction(batchId: number, mapping: FieldMapping): Promise<PreviewResult> {
  return previewImport(batchId, "INVENTORY", mapping);
}

export async function commitInventoryImportAction(batchId: number): Promise<Record<string, number>> {
  const result = commitInventoryImport(batchId);
  revalidatePath("/inventory");
  revalidatePath("/");
  return { ...result };
}

export interface InventorySearchRow {
  id: number;
  name: string;
  setName: string;
  cardNumber: string;
  printing: string;
  condition: string;
  status: string;
  marketPriceCents: number | null;
  marketPriceAsof: string | null;
  sellPriceCents: number | null;
  locationCode: string | null;
  quantity: number | null;
}

export async function searchInventoryAction(term: string): Promise<InventorySearchRow[]> {
  const trimmed = term.trim();
  const rows = db
    .select({
      id: inventoryItem.id,
      name: inventoryItem.name,
      setName: inventoryItem.setName,
      cardNumber: inventoryItem.cardNumber,
      printing: inventoryItem.printing,
      condition: inventoryItem.condition,
      status: inventoryItem.status,
      marketPriceCents: inventoryItem.marketPriceCents,
      marketPriceAsof: inventoryItem.marketPriceAsof,
      sellPriceCents: inventoryItem.sellPriceCents,
      locationCode: location.code,
      quantity: inventoryLot.quantity,
    })
    .from(inventoryItem)
    .leftJoin(inventoryLot, eq(inventoryLot.inventoryItemId, inventoryItem.id))
    .leftJoin(location, eq(location.id, inventoryLot.locationId))
    .where(
      trimmed
        ? or(
            like(inventoryItem.name, `%${trimmed}%`),
            like(inventoryItem.setName, `%${trimmed}%`),
            like(inventoryItem.cardNumber, `%${trimmed}%`),
            like(inventoryItem.tcgplayerSkuId, `%${trimmed}%`),
            like(inventoryItem.matchKey, `%${trimmed}%`)
          )
        : undefined
    )
    .limit(200)
    .all();

  return rows;
}

export async function setSellPriceAction(itemId: number, cents: number) {
  db.update(inventoryItem).set({ sellPriceCents: cents, updatedAt: new Date().toISOString() }).where(eq(inventoryItem.id, itemId)).run();
  revalidatePath("/inventory");
}

export async function suggestLocationAction(): Promise<SuggestedLocation | null> {
  return suggestLocation();
}

export async function assignItemLocationAction(itemId: number, locationId: number) {
  const item = db.select().from(inventoryItem).where(eq(inventoryItem.id, itemId)).get();
  if (!item) throw new Error("Item not found");
  const existingLot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, itemId)).get();

  if (existingLot) {
    const before = { locationId: existingLot.locationId };
    db.update(inventoryLot).set({ locationId, updatedAt: new Date().toISOString() }).where(eq(inventoryLot.id, existingLot.id)).run();
    recordHistory({ entityType: "inventory_lot", entityId: existingLot.id, action: "MOVE", before, after: { locationId } });
  } else {
    const created = db
      .insert(inventoryLot)
      .values({ inventoryItemId: itemId, locationId, quantity: item.pendingQuantity ?? 0, isPrimary: true })
      .returning()
      .get();
    recordHistory({ entityType: "inventory_lot", entityId: created.id, action: "CREATE", after: created });
  }
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
}
