import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, migrateTestDb } from "./setup";

setupTestDb();

describe("pricing engine", () => {
  let computeSellPriceCents: typeof import("../lib/pricing").computeSellPriceCents;
  let DEFAULT_PRICING_SETTINGS: typeof import("../lib/pricing").DEFAULT_PRICING_SETTINGS;
  let isStale: typeof import("../lib/pricing").isStale;
  let previewReprice: typeof import("../lib/pricing").previewReprice;
  let applyReprice: typeof import("../lib/pricing").applyReprice;
  let db: typeof import("../lib/db/client").db;
  let inventoryItem: typeof import("../lib/db/schema").inventoryItem;

  beforeAll(async () => {
    await migrateTestDb();
    const mod = await import("../lib/pricing");
    computeSellPriceCents = mod.computeSellPriceCents;
    DEFAULT_PRICING_SETTINGS = mod.DEFAULT_PRICING_SETTINGS;
    isStale = mod.isStale;
    previewReprice = mod.previewReprice;
    applyReprice = mod.applyReprice;
    const client = await import("../lib/db/client");
    db = client.db;
    const schema = await import("../lib/db/schema");
    inventoryItem = schema.inventoryItem;
  });

  it("applies the flat floor below $0.49", () => {
    expect(computeSellPriceCents(10)).toBe(49);
    expect(computeSellPriceCents(48)).toBe(49);
  });

  it("evaluates bands with explicit boundaries (first match wins)", () => {
    const s = { ...DEFAULT_PRICING_SETTINGS, p1: 0.1, p2: 0.2, p3: 0.3, roundingMode: "nearest_cent" as const };
    // $0.49 <= market < $2.00 -> p1
    expect(computeSellPriceCents(100, s)).toBe(110);
    // boundary exactly at $2.00 -> p2, not p1
    expect(computeSellPriceCents(200, s)).toBe(240);
    // $2.00 <= market < $10.00 -> p2
    expect(computeSellPriceCents(500, s)).toBe(600);
    // boundary exactly at $10.00 -> p3, not p2
    expect(computeSellPriceCents(1000, s)).toBe(1300);
    // market >= $10.00 -> p3
    expect(computeSellPriceCents(2000, s)).toBe(2600);
  });

  it("rounds up to the nearest $0.X9 by default", () => {
    const s = { ...DEFAULT_PRICING_SETTINGS, p1: 0, p2: 0, p3: 0 };
    expect(computeSellPriceCents(1201, s)).toBe(1209); // $12.01 -> $12.09
    expect(computeSellPriceCents(1209, s)).toBe(1209); // already charm-priced
    expect(computeSellPriceCents(1210, s)).toBe(1219); // $12.10 -> $12.19
  });

  it("never lets a price fall below the hard floor even with a negative-ish outcome", () => {
    const s = { ...DEFAULT_PRICING_SETTINGS, hardFloorCents: 99 };
    expect(computeSellPriceCents(60, s)).toBe(99);
  });

  it("flags staleness beyond the configured window and preview skips proposing a price", () => {
    const s = DEFAULT_PRICING_SETTINGS;
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fresh = new Date().toISOString().slice(0, 10);
    expect(isStale(old, s)).toBe(true);
    expect(isStale(fresh, s)).toBe(false);
    expect(isStale(null, s)).toBe(true);
  });

  it("preview never mutates inventory; apply requires explicit item ids and is skippable for stale rows", () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fresh = new Date().toISOString().slice(0, 10);
    const staleItem = db.insert(inventoryItem).values({
      name: "Stale Card", setName: "Set", condition: "NM", matchKey: "stale",
      marketPriceCents: 500, marketPriceAsof: old, sellPriceCents: 100,
    }).returning().get();
    const freshItem = db.insert(inventoryItem).values({
      name: "Fresh Card", setName: "Set", condition: "NM", matchKey: "fresh",
      marketPriceCents: 500, marketPriceAsof: fresh, sellPriceCents: 100,
    }).returning().get();

    const preview = previewReprice([staleItem.id, freshItem.id]);
    expect(preview.find((r) => r.itemId === staleItem.id)?.proposedSellPriceCents).toBeNull();
    expect(preview.find((r) => r.itemId === freshItem.id)?.proposedSellPriceCents).not.toBeNull();

    const afterPreview = db.select().from(inventoryItem).where(inventoryItemEq(staleItem.id)).get();
    expect(afterPreview?.sellPriceCents).toBe(100); // untouched by preview

    const result = applyReprice([staleItem.id, freshItem.id]);
    expect(result.skippedStale).toBe(1);
    expect(result.applied).toBe(1);

    const staleAfter = db.select().from(inventoryItem).where(inventoryItemEq(staleItem.id)).get();
    expect(staleAfter?.sellPriceCents).toBe(100); // still untouched, skipped

    const freshAfter = db.select().from(inventoryItem).where(inventoryItemEq(freshItem.id)).get();
    expect(freshAfter?.sellPriceCents).not.toBe(100);
  });

  function inventoryItemEq(id: number) {
    return eq(inventoryItem.id, id);
  }
});
