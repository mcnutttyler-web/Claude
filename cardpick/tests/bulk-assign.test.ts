import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, migrateTestDb } from "./setup";

setupTestDb();

describe("bulk location assignment", () => {
  let db: typeof import("../lib/db/client").db;
  let schema: typeof import("../lib/db/schema");
  let previewBulkAssign: typeof import("../lib/bulk-assign").previewBulkAssign;
  let applyBulkAssign: typeof import("../lib/bulk-assign").applyBulkAssign;
  let reverseBulkAssign: typeof import("../lib/bulk-assign").reverseBulkAssign;
  let oldB: number;
  let boxA: number;

  beforeAll(async () => {
    await migrateTestDb();
    schema = await import("../lib/db/schema");
    const client = await import("../lib/db/client");
    db = client.db;
    const mod = await import("../lib/bulk-assign");
    previewBulkAssign = mod.previewBulkAssign;
    applyBulkAssign = mod.applyBulkAssign;
    reverseBulkAssign = mod.reverseBulkAssign;

    oldB = db.insert(schema.location).values({ code: "OLD-B", kind: "LEGACY", active: true }).returning().get().id;
    boxA = db.insert(schema.location).values({ code: "BOX-A", kind: "LEGACY", active: true }).returning().get().id;

    for (let i = 0; i < 5; i++) {
      db.insert(schema.inventoryItem)
        .values({
          name: `Mew ex ${i}`,
          setName: "Pokémon 151",
          condition: "NM",
          printing: "NORMAL",
          matchKey: `mew ${i}|pokemon 151|${i}|NM|NORMAL`,
          pendingQuantity: 4,
        })
        .run();
    }
    // A non-matching set to prove the filter is scoped.
    db.insert(schema.inventoryItem)
      .values({
        name: "Charizard",
        setName: "Base Set",
        condition: "NM",
        printing: "HOLOFOIL",
        matchKey: "charizard|base set|4|NM|HOLOFOIL",
        pendingQuantity: 1,
      })
      .run();
  });

  it("previews the match count and a sample without changing anything", () => {
    const preview = previewBulkAssign({ setName: "Pokémon 151" });
    expect(preview.matchCount).toBe(5);
    expect(preview.sample).toHaveLength(5);

    const lots = db.select().from(schema.inventoryLot).all();
    expect(lots).toHaveLength(0);
  });

  it("applies the assignment, seeding lot quantity from pendingQuantity, in one grouped action", () => {
    const result = applyBulkAssign({ setName: "Pokémon 151" }, oldB);
    expect(result.assignedCount).toBe(5);

    const lots = db.select().from(schema.inventoryLot).all();
    expect(lots).toHaveLength(5);
    expect(lots.every((l) => l.locationId === oldB && l.quantity === 4)).toBe(true);

    const historyRows = db.select().from(schema.history).where(eq(schema.history.groupId, result.historyGroupId)).all();
    expect(historyRows).toHaveLength(5);
  });

  it("is reversible via the grouped history entry", () => {
    const preview = previewBulkAssign({ setName: "Pokémon 151" });
    const result = applyBulkAssign({ setName: "Pokémon 151" }, boxA);
    let lots = db.select().from(schema.inventoryLot).all();
    expect(lots.every((l) => l.locationId === boxA)).toBe(true);

    const reversedCount = reverseBulkAssign(result.historyGroupId);
    expect(reversedCount).toBe(preview.matchCount);

    lots = db.select().from(schema.inventoryLot).all();
    expect(lots.every((l) => l.locationId === oldB)).toBe(true);
  });

  it("supports name-range and unassigned filters", () => {
    const range = previewBulkAssign({ nameRange: { from: "A", to: "F" } });
    expect(range.matchCount).toBe(1); // Charizard only

    const unassigned = previewBulkAssign({ currentLocationId: "UNASSIGNED" });
    expect(unassigned.matchCount).toBe(1); // Charizard was never assigned
  });
});
