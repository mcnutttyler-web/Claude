import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem, inventoryLot } from "@/db/schema";
import { getUnassignedLocationId } from "./locations";
import { applyReconcile, analyzeReconcile } from "./reconcile";

describe("reconcile", () => {
  it("computes qty deltas and applies only explicitly accepted rows", () => {
    const suffix = `Recon${Date.now()}`;
    const sku = `sku-${suffix}`;
    const inserted = db
      .insert(inventoryItem)
      .values({
        name: `Gyarados ${suffix}`,
        setName: "Base Set",
        condition: "Near Mint",
        printing: "Normal",
        matchKey: `gyarados-${suffix}`,
        tcgplayerSkuId: sku,
        status: "ACTIVE",
      })
      .run();
    const itemId = Number(inserted.lastInsertRowid);
    db.insert(inventoryLot)
      .values({ inventoryItemId: itemId, locationId: getUnassignedLocationId(), quantity: 5, isPrimary: true })
      .run();

    const csv = ["Sku,Name,Qty", `${sku},Gyarados ${suffix},2`].join("\n");
    const columnMap = { tcgplayerSkuId: "Sku", name: "Name", setName: null, cardNumber: null, conditionRaw: null, quantity: "Qty" };
    const rows = analyzeReconcile(csv, columnMap);
    expect(rows).toHaveLength(1);
    expect(rows[0].cardPickQty).toBe(5);
    expect(rows[0].tcgplayerQty).toBe(2);
    expect(rows[0].delta).toBe(3);

    applyReconcile([{ inventoryItemId: itemId, cardPickQty: 5, tcgplayerQty: 2, accept: "TCGPLAYER" }]);
    const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, itemId)).get()!;
    expect(lot.quantity).toBe(2);
  });

  it("does not change quantity when CardPick's value is accepted", () => {
    const suffix = `ReconKeep${Date.now()}`;
    const sku = `sku-${suffix}`;
    const inserted = db
      .insert(inventoryItem)
      .values({
        name: `Machamp ${suffix}`,
        setName: "Base Set",
        condition: "Near Mint",
        printing: "Normal",
        matchKey: `machamp-${suffix}`,
        tcgplayerSkuId: sku,
        status: "ACTIVE",
      })
      .run();
    const itemId = Number(inserted.lastInsertRowid);
    db.insert(inventoryLot)
      .values({ inventoryItemId: itemId, locationId: getUnassignedLocationId(), quantity: 5, isPrimary: true })
      .run();

    applyReconcile([{ inventoryItemId: itemId, cardPickQty: 5, tcgplayerQty: 2, accept: "CARDPICK" }]);
    const lot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, itemId)).get()!;
    expect(lot.quantity).toBe(5);
  });
});
