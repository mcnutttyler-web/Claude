import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, migrateTestDb } from "./setup";

setupTestDb();

describe("commitScan", () => {
  let db: typeof import("../lib/db/client").db;
  let schema: typeof import("../lib/db/schema");
  let commitScan: typeof import("../lib/recognition/scan").commitScan;
  let matching: typeof import("../lib/matching");
  let locId: number;

  beforeAll(async () => {
    await migrateTestDb();
    const client = await import("../lib/db/client");
    db = client.db;
    schema = await import("../lib/db/schema");
    matching = await import("../lib/matching");
    matching.seedConditionSuffixes();
    const mod = await import("../lib/recognition/scan");
    commitScan = mod.commitScan;

    locId = db.insert(schema.location).values({ code: "A01", kind: "GRANULAR", active: true }).returning().get().id;
  });

  function makeScan(overrides: Partial<typeof schema.cardScan.$inferInsert> = {}) {
    return db
      .insert(schema.cardScan)
      .values({ imagePath: "/tmp/x.jpg", resolutionStatus: "PENDING", ...overrides })
      .returning()
      .get();
  }

  it("creates a new inventory item from manual identity, with no location leaving pendingQuantity set", () => {
    const scan = makeScan();
    const result = commitScan({
      scanId: scan.id,
      referenceCardId: null,
      manualIdentity: { name: "Charizard", setName: "Base Set", cardNumber: "004/102" },
      conditionLabel: "Near Mint",
      printingLabel: "Holofoil",
      quantity: 3,
      locationId: null,
      sellPriceCents: 250000,
    });

    expect(result.status).toBe("CREATED");
    if (result.status !== "CREATED") throw new Error("unreachable");

    const item = db.select().from(schema.inventoryItem).where(eq(schema.inventoryItem.id, result.inventoryItemId)).get()!;
    expect(item.condition).toBe("NM");
    expect(item.printing).toBe("HOLOFOIL");
    expect(item.pendingQuantity).toBe(3);
    expect(item.sellPriceCents).toBe(250000);
    expect(item.matchKey).toBe(
      matching.buildMatchKey({ name: "Charizard", setName: "Base Set", cardNumber: "004/102", conditionCode: "NM", printingCode: "HOLOFOIL" })
    );

    const lots = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.inventoryItemId, result.inventoryItemId)).all();
    expect(lots).toHaveLength(0);

    const scanAfter = db.select().from(schema.cardScan).where(eq(schema.cardScan.id, scan.id)).get()!;
    expect(scanAfter.resolutionStatus).toBe("RESOLVED");
    expect(scanAfter.resultingInventoryItemId).toBe(result.inventoryItemId);
  });

  it("creates a lot directly when a location is given, and pulls market price from a cached reference card", () => {
    const ref = db
      .insert(schema.referenceCard)
      .values({
        sourceId: "sv3pt5-232",
        name: "Mew ex",
        setName: "Pokemon 151",
        cardNumber: "232",
        printingCode: "HOLOFOIL",
        rawJson: JSON.stringify({ tcgplayer: { prices: { holofoil: { market: 12.34 } } } }),
      })
      .returning()
      .get();

    const scan = makeScan();
    const result = commitScan({
      scanId: scan.id,
      referenceCardId: ref.id,
      conditionLabel: "Near Mint",
      printingLabel: "Holofoil",
      quantity: 2,
      locationId: locId,
      sellPriceCents: null,
    });

    expect(result.status).toBe("CREATED");
    if (result.status !== "CREATED") throw new Error("unreachable");

    const item = db.select().from(schema.inventoryItem).where(eq(schema.inventoryItem.id, result.inventoryItemId)).get()!;
    expect(item.marketPriceCents).toBe(1234);
    expect(item.pendingQuantity).toBeNull();

    const lot = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.inventoryItemId, result.inventoryItemId)).get()!;
    expect(lot.locationId).toBe(locId);
    expect(lot.quantity).toBe(2);
  });

  it("updates (not duplicates) an existing item, adding to its on-hand quantity", () => {
    const existing = db
      .insert(schema.inventoryItem)
      .values({
        name: "Pikachu", setName: "Pokemon 151", cardNumber: "025/165",
        condition: "NM", printing: "NORMAL",
        matchKey: matching.buildMatchKey({ name: "Pikachu", setName: "Pokemon 151", cardNumber: "025/165", conditionCode: "NM", printingCode: "NORMAL" }),
        sellPriceCents: 50,
      })
      .returning()
      .get();
    const existingLot = db.insert(schema.inventoryLot).values({ inventoryItemId: existing.id, locationId: locId, quantity: 4, isPrimary: true }).returning().get();

    const scan = makeScan();
    const result = commitScan({
      scanId: scan.id,
      referenceCardId: null,
      manualIdentity: { name: "Pikachu", setName: "Pokemon 151", cardNumber: "025/165" },
      conditionLabel: "Near Mint",
      printingLabel: "Normal",
      quantity: 5,
      locationId: locId,
      sellPriceCents: null,
    });

    expect(result.status).toBe("UPDATED");
    if (result.status !== "UPDATED") throw new Error("unreachable");
    expect(result.inventoryItemId).toBe(existing.id);

    const allItems = db.select().from(schema.inventoryItem).all();
    expect(allItems.filter((i) => i.name === "Pikachu")).toHaveLength(1); // no duplicate

    const lotAfter = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.id, existingLot.id)).get()!;
    expect(lotAfter.quantity).toBe(9); // 4 + 5

    const itemAfter = db.select().from(schema.inventoryItem).where(eq(schema.inventoryItem.id, existing.id)).get()!;
    expect(itemAfter.sellPriceCents).toBe(50); // untouched, no override given
  });

  it("never auto-resolves an ambiguous match and leaves the scan unresolved", () => {
    // commitScan never passes a tcgplayerSkuId (photos don't carry one), so
    // it can only ever hit tier-2 ambiguity: two items sharing the same
    // tcgplayer_product_id + condition + printing.
    db.insert(schema.inventoryItem)
      .values({
        tcgplayerProductId: "PROD-1", name: "Blastoise", setName: "Base Set", cardNumber: "002/102",
        condition: "NM", printing: "HOLOFOIL", matchKey: "blastoise a|base set|002/102|NM|HOLOFOIL",
      })
      .run();
    db.insert(schema.inventoryItem)
      .values({
        tcgplayerProductId: "PROD-1", name: "Blastoise (dup)", setName: "Base Set", cardNumber: "002/102",
        condition: "NM", printing: "HOLOFOIL", matchKey: "blastoise b|base set|002/102|NM|HOLOFOIL",
      })
      .run();
    const ref = db
      .insert(schema.referenceCard)
      .values({ sourceId: "amb-1", name: "Blastoise", setName: "Base Set", cardNumber: "002/102", printingCode: "HOLOFOIL", tcgplayerProductId: "PROD-1", rawJson: "{}" })
      .returning()
      .get();

    const beforeCount = db.select().from(schema.inventoryItem).all().length;
    const scan = makeScan();
    const result = commitScan({
      scanId: scan.id,
      referenceCardId: ref.id,
      conditionLabel: "Near Mint",
      printingLabel: "Holofoil",
      quantity: 1,
      locationId: null,
      sellPriceCents: null,
    });

    expect(result.status).toBe("AMBIGUOUS");
    if (result.status !== "AMBIGUOUS") throw new Error("unreachable");
    expect(result.candidateItemIds).toHaveLength(2);

    const afterCount = db.select().from(schema.inventoryItem).all().length;
    expect(afterCount).toBe(beforeCount); // nothing created

    const scanAfter = db.select().from(schema.cardScan).where(eq(schema.cardScan.id, scan.id)).get()!;
    expect(scanAfter.resolutionStatus).toBe("PENDING");
    expect(scanAfter.resultingInventoryItemId).toBeNull();
  });
});
