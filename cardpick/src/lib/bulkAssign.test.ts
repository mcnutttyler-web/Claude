import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem, inventoryLot, location } from "@/db/schema";
import { getUnassignedLocationId } from "./locations";
import { applyBulkAssign, previewBulkAssign, reverseBulkAssign } from "./bulkAssign";

function makeItem(setName: string, name: string) {
  const inserted = db
    .insert(inventoryItem)
    .values({
      name,
      setName,
      condition: "Near Mint",
      printing: "Normal",
      matchKey: `${name}-${setName}-${Math.random()}`,
      status: "ACTIVE",
    })
    .run();
  const itemId = Number(inserted.lastInsertRowid);
  db.insert(inventoryLot)
    .values({ inventoryItemId: itemId, locationId: getUnassignedLocationId(), quantity: 1, isPrimary: true })
    .run();
  return itemId;
}

describe("bulk location assignment by rule", () => {
  it("previews and applies a set-name filter as one grouped, reversible action", () => {
    const setName = `Pokemon 151 ${Date.now()}`;
    const itemA = makeItem(setName, "Card A");
    const itemB = makeItem(setName, "Card B");

    const targetInserted = db
      .insert(location)
      .values({ code: `OLD-B-${Date.now()}`, kind: "LEGACY" })
      .run();
    const targetLocationId = Number(targetInserted.lastInsertRowid);

    const preview = previewBulkAssign({ setName });
    expect(preview.matchCount).toBe(2);

    const { updatedCount, batchGroupId } = applyBulkAssign({ setName }, targetLocationId);
    expect(updatedCount).toBe(2);

    for (const itemId of [itemA, itemB]) {
      const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, itemId)).get()!;
      expect(lot.locationId).toBe(targetLocationId);
    }

    reverseBulkAssign(batchGroupId);
    for (const itemId of [itemA, itemB]) {
      const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, itemId)).get()!;
      expect(lot.locationId).toBe(getUnassignedLocationId());
    }
  });
});
