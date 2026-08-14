import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, migrateTestDb } from "./setup";

setupTestDb();

describe("matching", () => {
  let normalize: typeof import("../lib/matching").normalize;
  let splitConditionAndPrinting: typeof import("../lib/matching").splitConditionAndPrinting;
  let buildMatchKey: typeof import("../lib/matching").buildMatchKey;
  let matchInventoryItem: typeof import("../lib/matching").matchInventoryItem;
  let seedConditionSuffixes: typeof import("../lib/matching").seedConditionSuffixes;
  let db: typeof import("../lib/db/client").db;
  let inventoryItem: typeof import("../lib/db/schema").inventoryItem;

  beforeAll(async () => {
    await migrateTestDb();
    const matching = await import("../lib/matching");
    normalize = matching.normalize;
    splitConditionAndPrinting = matching.splitConditionAndPrinting;
    buildMatchKey = matching.buildMatchKey;
    matchInventoryItem = matching.matchInventoryItem;
    seedConditionSuffixes = matching.seedConditionSuffixes;
    seedConditionSuffixes();
    const client = await import("../lib/db/client");
    db = client.db;
    const schema = await import("../lib/db/schema");
    inventoryItem = schema.inventoryItem;
  });

  it("normalizes whitespace and punctuation but keeps digits and slashes", () => {
    expect(normalize("  Pikachu, VMAX!!  ")).toBe("pikachu vmax");
    expect(normalize("025/165")).toBe("025/165");
    expect(normalize("Mr. Mime")).toBe("mr mime");
  });

  it("splits fused printing out of the condition string", () => {
    const a = splitConditionAndPrinting("Near Mint Foil");
    expect(a.conditionCode).toBe("NM");
    expect(a.printingCode).toBe("FOIL");

    const b = splitConditionAndPrinting("Lightly Played Reverse Holofoil");
    expect(b.conditionCode).toBe("LP");
    expect(b.printingCode).toBe("REVERSE_HOLOFOIL");

    const c = splitConditionAndPrinting("Near Mint");
    expect(c.conditionCode).toBe("NM");
    expect(c.printingCode).toBe("NORMAL");
  });

  it("builds a stable match_key that preserves leading zeros and slash in card number", () => {
    const key = buildMatchKey({
      name: "Mew ex",
      setName: "Pokémon 151",
      cardNumber: "025/165",
      conditionCode: "NM",
      printingCode: "HOLOFOIL",
    });
    expect(key).toBe("mew ex|pokémon 151|025/165|NM|HOLOFOIL");
  });

  it("matches by sku id first, then product+condition+printing, then match_key, and flags ambiguity", () => {
    db.insert(inventoryItem)
      .values({
        tcgplayerSkuId: "SKU-1",
        tcgplayerProductId: "PROD-1",
        name: "Charizard",
        setName: "Base Set",
        cardNumber: "004/102",
        printing: "HOLOFOIL",
        condition: "NM",
        matchKey: "charizard|base set|004/102|NM|HOLOFOIL",
      })
      .run();

    const bySku = matchInventoryItem({
      tcgplayerSkuId: "SKU-1",
      tcgplayerProductId: null,
      conditionCode: "NM",
      printingCode: "HOLOFOIL",
      matchKey: "irrelevant",
    });
    expect(bySku.status).toBe("MATCHED");

    const byMatchKey = matchInventoryItem({
      tcgplayerSkuId: null,
      tcgplayerProductId: null,
      conditionCode: "NM",
      printingCode: "HOLOFOIL",
      matchKey: "charizard|base set|004/102|NM|HOLOFOIL",
    });
    expect(byMatchKey.status).toBe("MATCHED");

    const brandNew = matchInventoryItem({
      tcgplayerSkuId: null,
      tcgplayerProductId: null,
      conditionCode: "LP",
      printingCode: "NORMAL",
      matchKey: "something else|set|001|LP|NORMAL",
    });
    expect(brandNew.status).toBe("NEW");

    // A second row sharing the same SKU makes tier-1 ambiguous.
    db.insert(inventoryItem)
      .values({
        tcgplayerSkuId: "SKU-1",
        name: "Charizard (dup)",
        setName: "Base Set",
        cardNumber: "004/102",
        printing: "HOLOFOIL",
        condition: "NM",
        matchKey: "charizard dup|base set|004/102|NM|HOLOFOIL",
      })
      .run();
    const ambiguous = matchInventoryItem({
      tcgplayerSkuId: "SKU-1",
      tcgplayerProductId: null,
      conditionCode: "NM",
      printingCode: "HOLOFOIL",
      matchKey: "irrelevant",
    });
    expect(ambiguous.status).toBe("AMBIGUOUS");
  });
});
