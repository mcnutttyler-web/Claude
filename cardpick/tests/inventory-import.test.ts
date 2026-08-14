import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, migrateTestDb } from "./setup";

setupTestDb();

const SAMPLE_CSV = [
  "TCGplayer Id,Product Name,Set Name,Number,Condition,TCG Market Price,Total Quantity",
  '121522,"Mew ex",Pokémon 151,232/165,Near Mint Holofoil,"$1,234.56",3',
  "121523,Pikachu,Pokémon 151,025/165,Near Mint,$0.35,10",
].join("\n");

describe("inventory import", () => {
  let startImport: typeof import("../lib/import/inventory-import").startImport;
  let previewImport: typeof import("../lib/import/inventory-import").previewImport;
  let commitInventoryImport: typeof import("../lib/import/inventory-import").commitInventoryImport;
  let seedConditionSuffixes: typeof import("../lib/matching").seedConditionSuffixes;
  let db: typeof import("../lib/db/client").db;
  let inventoryItem: typeof import("../lib/db/schema").inventoryItem;
  let importBatch: typeof import("../lib/db/schema").importBatch;

  beforeAll(async () => {
    await migrateTestDb();
    const mod = await import("../lib/import/inventory-import");
    startImport = mod.startImport;
    previewImport = mod.previewImport;
    commitInventoryImport = mod.commitInventoryImport;
    const matching = await import("../lib/matching");
    seedConditionSuffixes = matching.seedConditionSuffixes;
    seedConditionSuffixes();
    const client = await import("../lib/db/client");
    db = client.db;
    const schema = await import("../lib/db/schema");
    inventoryItem = schema.inventoryItem;
    importBatch = schema.importBatch;
  });

  it("imports new rows, splits printing from condition, and stores cents (not floats)", () => {
    const started = startImport("INVENTORY", "prices.csv", SAMPLE_CSV);
    expect(started.rowCount).toBe(2);
    expect(started.duplicateOfBatchId).toBeNull();

    const mapping = {
      tcgplayerProductId: "TCGplayer Id",
      tcgplayerSkuId: null,
      name: "Product Name",
      setName: "Set Name",
      setCode: null,
      cardNumber: "Number",
      rawCondition: "Condition",
      marketPrice: "TCG Market Price",
      quantity: "Total Quantity",
    };

    const preview = previewImport(started.batchId, "INVENTORY", mapping);
    expect(preview.errors).toEqual([]);
    expect(preview.counts.new).toBe(2);

    const result = commitInventoryImport(started.batchId);
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);

    const items = db.select().from(inventoryItem).all();
    expect(items).toHaveLength(2);

    const mew = items.find((i) => i.name === "Mew ex")!;
    expect(mew.printing).toBe("HOLOFOIL");
    expect(mew.condition).toBe("NM");
    expect(mew.marketPriceCents).toBe(123456);
    expect(Number.isInteger(mew.marketPriceCents)).toBe(true);
  });

  it("re-importing the same file shape auto-applies the saved mapping and warns about duplicate sha256", () => {
    const started = startImport("INVENTORY", "prices.csv", SAMPLE_CSV);
    expect(started.savedProfileId).not.toBeNull();
    expect(started.suggestedMapping.name).toBe("Product Name");
    expect(started.duplicateOfBatchId).not.toBeNull();

    // Committing again should update the two existing items (matched by
    // match_key since they now carry the same identity), not create dupes.
    previewImport(started.batchId, "INVENTORY", started.suggestedMapping);
    const result = commitInventoryImport(started.batchId);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(2);

    const items = db.select().from(inventoryItem).all();
    expect(items).toHaveLength(2);
  });

  it("records one import_batch row per import with filename, sha256, row count", () => {
    const batches = db.select().from(importBatch).all();
    expect(batches.length).toBeGreaterThanOrEqual(2);
    for (const b of batches) {
      expect(b.sha256).toHaveLength(64);
      expect(b.rowCount).toBe(2);
    }
  });
});
