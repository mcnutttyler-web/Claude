import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTestDb, migrateTestDb } from "./setup";

setupTestDb();

const API_CARD = {
  id: "sv3pt5-232",
  name: "Mew ex",
  number: "232",
  set: { name: "Pokemon 151", id: "sv3pt5", ptcgoCode: "MEW" },
  images: { small: "https://example.com/small.png", large: "https://example.com/large.png" },
  tcgplayer: {
    url: "https://www.tcgplayer.com/product/598126/pokemon-sv-151-mew-ex",
    prices: { holofoil: { market: 12.34 } },
  },
};

describe("pokemontcg.io cached reference lookups", () => {
  let searchReferenceCards: typeof import("../lib/recognition/pokemontcg").searchReferenceCards;
  let db: typeof import("../lib/db/client").db;
  let referenceCard: typeof import("../lib/db/schema").referenceCard;

  beforeAll(async () => {
    await migrateTestDb();
    const mod = await import("../lib/recognition/pokemontcg");
    searchReferenceCards = mod.searchReferenceCards;
    const client = await import("../lib/db/client");
    db = client.db;
    const schema = await import("../lib/db/schema");
    referenceCard = schema.referenceCard;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the API on a cache miss and caches the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [API_CARD] }) });
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchReferenceCards({ name: "Mew ex", cardNumberGuess: "232/165" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Mew ex");
    expect(results[0].tcgplayerProductId).toBeTruthy();

    const cached = db.select().from(referenceCard).all();
    expect(cached).toHaveLength(1);
  });

  it("serves a repeat lookup from cache without a second API call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchReferenceCards({ name: "Mew ex", cardNumberGuess: "232/165" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Mew ex");
  });

  it("leaves tcgplayerProductId null when the source URL has no extractable numeric id", async () => {
    db.delete(referenceCard).run();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ ...API_CARD, id: "sv3pt5-233", tcgplayer: { url: "https://prices.pokemontcg.io/tcgplayer/sv3pt5-233" } }] }),
    }));
    const results = await searchReferenceCards({ name: "Mew ex" });
    expect(results[0].tcgplayerProductId).toBeNull();
  });

  it("upserts on (source, source_id) so a repeated card in one API response doesn't duplicate", async () => {
    db.delete(referenceCard).run();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [API_CARD, { ...API_CARD }] }) });
    vi.stubGlobal("fetch", fetchMock);

    await searchReferenceCards({ name: "Mew ex" });

    const cached = db.select().from(referenceCard).all();
    expect(cached).toHaveLength(1);
  });
});
