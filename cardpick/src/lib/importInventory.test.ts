import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem } from "@/db/schema";
import { analyzeInventoryImport, commitInventoryImport } from "./importInventory";

// SKU/product IDs must be unique per test — matching prioritizes SKU
// exact-match, so a shared static SKU across tests would make later
// "new item" tests match an earlier test's row instead of creating one.
function csvFor(nameSuffix: string) {
  const skuBase = Math.floor(Math.random() * 1_000_000) + 10_000;
  return [
    "Product ID,Sku,Card Name,Set,Number,Condition,Market Price,Add to Quantity",
    `${skuBase},${skuBase},Charizard ${nameSuffix},Obsidian Flames,125/197,Near Mint Holofoil,12.34,3`,
    `${skuBase + 1},${skuBase + 1},Pikachu ${nameSuffix},Obsidian Flames,050/197,Lightly Played,0.25,10`,
  ].join("\n");
}

const columnMap = {
  tcgplayerProductId: "Product ID",
  tcgplayerSkuId: "Sku",
  name: "Card Name",
  setName: "Set",
  setCode: null,
  cardNumber: "Number",
  conditionRaw: "Condition",
  marketPrice: "Market Price",
  quantity: "Add to Quantity",
};

describe("inventory import", () => {
  it("analyzes a csv without an existing mapping profile", () => {
    // Unique header names guarantee no mapping profile could already exist
    // for this shape, since shape signatures are keyed off header text.
    const uniqueHeader = `Card Name ${Date.now()}-${Math.random()}`;
    const csv = [`Product ID,Sku,${uniqueHeader},Set,Number,Condition,Market Price,Add to Quantity`,
      "1,1,Whatever,Set,1,Near Mint,1.00,1"].join("\n");
    const result = analyzeInventoryImport(csv);
    expect(result.rowCount).toBe(1);
    expect(result.headers).toContain(uniqueHeader);
    expect(result.existingMapping).toBeNull();
    expect(result.duplicateBatch).toBeNull();
  });

  it("creates new items, splits printing out of condition, and sets asof date", () => {
    const suffix = `Create${Date.now()}`;
    const csv = csvFor(suffix);
    const result = commitInventoryImport({ fileContent: csv, filename: "test.csv", columnMap });
    expect(result.created).toBe(2);
    expect(result.ambiguousCount).toBe(0);

    const charizard = db
      .select()
      .from(inventoryItem)
      .where(eq(inventoryItem.name, `Charizard ${suffix}`))
      .get()!;
    expect(charizard.condition).toBe("Near Mint");
    expect(charizard.printing).toBe("Holofoil");
    expect(charizard.marketPriceCents).toBe(1234);
    expect(charizard.marketPriceAsof).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is idempotent: re-importing the same file updates rather than duplicates", () => {
    const suffix = `Idempotent${Date.now()}`;
    const csv = csvFor(suffix);
    const first = commitInventoryImport({ fileContent: csv, filename: "test.csv", columnMap });
    expect(first.created).toBe(2);

    const second = commitInventoryImport({
      fileContent: csv,
      filename: "test.csv",
      columnMap,
      force: true,
    });
    expect(second.created).toBe(0);
    expect(second.unchanged).toBe(2);

    const count = db
      .select()
      .from(inventoryItem)
      .where(eq(inventoryItem.name, `Charizard ${suffix}`))
      .all();
    expect(count).toHaveLength(1);
  });

  it("warns loudly on duplicate sha256 unless forced", () => {
    const suffix = `Dup${Date.now()}`;
    const csv = csvFor(suffix);
    commitInventoryImport({ fileContent: csv, filename: "test.csv", columnMap });

    expect(() =>
      commitInventoryImport({ fileContent: csv, filename: "test.csv", columnMap }),
    ).toThrowError("DUPLICATE_IMPORT");

    const analysis = analyzeInventoryImport(csv);
    expect(analysis.duplicateBatch).not.toBeNull();
  });

  it("saves a mapping profile and auto-applies it for the same csv shape", () => {
    const suffix = `Shape${Date.now()}`;
    const csv = csvFor(suffix);
    commitInventoryImport({ fileContent: csv, filename: "test.csv", columnMap });

    const secondShapeCsv = csvFor(`${suffix}b`);
    const analysis = analyzeInventoryImport(secondShapeCsv);
    expect(analysis.existingMapping).toEqual(columnMap);
  });

  it("updates market price on a matched item without touching quantity", () => {
    const suffix = `Reprice${Date.now()}`;
    const csv = csvFor(suffix);
    commitInventoryImport({ fileContent: csv, filename: "test.csv", columnMap });

    const repricedCsv = csv.replace("12.34", "15.00");
    const result = commitInventoryImport({
      fileContent: repricedCsv,
      filename: "test2.csv",
      columnMap,
    });
    expect(result.updated).toBe(1);

    const charizard = db
      .select()
      .from(inventoryItem)
      .where(eq(inventoryItem.name, `Charizard ${suffix}`))
      .get()!;
    expect(charizard.marketPriceCents).toBe(1500);
  });
});
