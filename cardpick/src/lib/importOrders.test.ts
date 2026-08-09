import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem, inventoryLot, order, orderLine } from "@/db/schema";
import { getUnassignedLocationId } from "./locations";
import { buildMatchKey } from "./matchKey";
import { analyzeOrderImport, commitOrderImport } from "./importOrders";

function makeInventoryItem(suffix: string, quantity: number) {
  const inserted = db
    .insert(inventoryItem)
    .values({
      name: `Blastoise ${suffix}`,
      setName: "Base Set",
      cardNumber: "002/102",
      condition: "Near Mint",
      printing: "Holofoil",
      matchKey: buildMatchKey({
        name: `Blastoise ${suffix}`,
        setName: "Base Set",
        cardNumber: "002/102",
        condition: "Near Mint",
        printing: "Holofoil",
      }),
      status: "ACTIVE",
    })
    .run();
  const itemId = Number(inserted.lastInsertRowid);
  db.insert(inventoryLot)
    .values({ inventoryItemId: itemId, locationId: getUnassignedLocationId(), quantity, isPrimary: true })
    .run();
  return itemId;
}

describe("order import", () => {
  it("matches order lines even without a SKU column, using name/set/number/condition", () => {
    const suffix = `Order${Date.now()}`;
    makeInventoryItem(suffix, 5);

    const csv = [
      "Order #,Product Name,Set,Number,Condition,Qty",
      `TCG-1-${suffix},Blastoise ${suffix},Base Set,002/102,Near Mint Holofoil,2`,
    ].join("\n");

    const columnMap = {
      orderId: "Order #",
      lineIndex: null,
      name: "Product Name",
      setName: "Set",
      cardNumber: "Number",
      conditionRaw: "Condition",
      tcgplayerSkuId: null,
      quantity: "Qty",
      shipBy: null,
    };

    const result = commitOrderImport({ fileContent: csv, filename: "orders.csv", columnMap });
    expect(result.ordersCreated).toBe(1);
    expect(result.ambiguousCount).toBe(0);
    expect(result.unmatchedCount).toBe(0);

    const orderRow = db.select().from(order).where(eq(order.tcgplayerOrderId, `TCG-1-${suffix}`)).get()!;
    const lines = db.select().from(orderLine).where(eq(orderLine.orderId, orderRow.id)).all();
    expect(lines).toHaveLength(1);
    expect(lines[0].matchStatus).toBe("MATCHED");
  });

  it("re-importing the identical order file changes nothing", () => {
    const suffix = `Reimport${Date.now()}`;
    makeInventoryItem(suffix, 5);
    const csv = [
      "Order #,Product Name,Set,Number,Condition,Qty",
      `TCG-2-${suffix},Blastoise ${suffix},Base Set,002/102,Near Mint Holofoil,1`,
    ].join("\n");
    const columnMap = {
      orderId: "Order #",
      lineIndex: null,
      name: "Product Name",
      setName: "Set",
      cardNumber: "Number",
      conditionRaw: "Condition",
      tcgplayerSkuId: null,
      quantity: "Qty",
      shipBy: null,
    };

    commitOrderImport({ fileContent: csv, filename: "orders.csv", columnMap });
    const second = commitOrderImport({
      fileContent: csv,
      filename: "orders.csv",
      columnMap,
      force: true,
    });
    expect(second.linesUpserted).toBe(0);
    expect(second.linesUnchanged).toBe(1);

    const orderRow = db.select().from(order).where(eq(order.tcgplayerOrderId, `TCG-2-${suffix}`)).get()!;
    const lines = db.select().from(orderLine).where(eq(orderLine.orderId, orderRow.id)).all();
    expect(lines).toHaveLength(1);
  });

  it("warns on duplicate sha256 unless forced", () => {
    const suffix = `OrderDup${Date.now()}`;
    const csv = [
      "Order #,Product Name,Set,Number,Condition,Qty",
      `TCG-3-${suffix},Whatever ${suffix},Some Set,1,Near Mint,1`,
    ].join("\n");
    const columnMap = {
      orderId: "Order #",
      lineIndex: null,
      name: "Product Name",
      setName: "Set",
      cardNumber: "Number",
      conditionRaw: "Condition",
      tcgplayerSkuId: null,
      quantity: "Qty",
      shipBy: null,
    };
    commitOrderImport({ fileContent: csv, filename: "orders.csv", columnMap });
    expect(() => commitOrderImport({ fileContent: csv, filename: "orders.csv", columnMap })).toThrowError(
      "DUPLICATE_IMPORT",
    );
    expect(analyzeOrderImport(csv).duplicateBatch).not.toBeNull();
  });
});
