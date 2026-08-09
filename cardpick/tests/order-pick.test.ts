import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, migrateTestDb } from "./setup";

setupTestDb();

const ORDER_CSV = [
  "Order #,Product Name,Set,Number,Condition,Quantity",
  "ORD-1,Mew ex,Pokémon 151,232/165,Near Mint Holofoil,2",
  "ORD-1,Pikachu,Pokémon 151,025/165,Near Mint,1",
].join("\n");

const ORDER_MAPPING = {
  externalOrderId: "Order #",
  name: "Product Name",
  setName: "Set",
  cardNumber: "Number",
  rawCondition: "Condition",
  tcgplayerSkuId: null,
  quantity: "Quantity",
  shipBy: null,
};

describe("order import + pick mode", () => {
  let db: typeof import("../lib/db/client").db;
  let schema: typeof import("../lib/db/schema");
  let startImport: typeof import("../lib/import/inventory-import").startImport;
  let previewImport: typeof import("../lib/import/inventory-import").previewImport;
  let commitOrderImport: typeof import("../lib/import/order-import").commitOrderImport;
  let pick: typeof import("../lib/pick");
  let matching: typeof import("../lib/matching");
  let mewId: number;
  let pikaId: number;
  let locId: number;

  beforeAll(async () => {
    await migrateTestDb();
    schema = await import("../lib/db/schema");
    const client = await import("../lib/db/client");
    db = client.db;
    matching = await import("../lib/matching");
    matching.seedConditionSuffixes();
    const invMod = await import("../lib/import/inventory-import");
    startImport = invMod.startImport;
    previewImport = invMod.previewImport;
    const orderMod = await import("../lib/import/order-import");
    commitOrderImport = orderMod.commitOrderImport;
    pick = await import("../lib/pick");

    locId = db.insert(schema.location).values({ code: "A01", kind: "GRANULAR", active: true }).returning().get().id;

    mewId = db
      .insert(schema.inventoryItem)
      .values({
        name: "Mew ex", setName: "Pokémon 151", cardNumber: "232/165",
        condition: "NM", printing: "HOLOFOIL",
        matchKey: matching.buildMatchKey({ name: "Mew ex", setName: "Pokémon 151", cardNumber: "232/165", conditionCode: "NM", printingCode: "HOLOFOIL" }),
      })
      .returning().get().id;
    pikaId = db
      .insert(schema.inventoryItem)
      .values({
        name: "Pikachu", setName: "Pokémon 151", cardNumber: "025/165",
        condition: "NM", printing: "NORMAL",
        matchKey: matching.buildMatchKey({ name: "Pikachu", setName: "Pokémon 151", cardNumber: "025/165", conditionCode: "NM", printingCode: "NORMAL" }),
      })
      .returning().get().id;

    db.insert(schema.inventoryLot).values({ inventoryItemId: mewId, locationId: locId, quantity: 5, isPrimary: true }).run();
    db.insert(schema.inventoryLot).values({ inventoryItemId: pikaId, locationId: locId, quantity: 1, isPrimary: true }).run();
  });

  it("imports order lines without SKU IDs and matches them against inventory by match_key", () => {
    const started = startImport("ORDER", "orders.csv", ORDER_CSV);
    const preview = previewImport(started.batchId, "ORDER", ORDER_MAPPING);
    expect(preview.counts.matched).toBe(2);

    const result = commitOrderImport(started.batchId);
    expect(result.ordersCreated).toBe(1);
    expect(result.linesCreated).toBe(2);
    expect(result.unmatched).toBe(0);

    const orderRow = db.select().from(schema.order).where(eq(schema.order.externalOrderId, "ORD-1")).get()!;
    expect(orderRow.status).toBe("PENDING");
  });

  it("groups the pick list by location in walk order", () => {
    const list = pick.getPickList();
    expect(list.length).toBe(2);
    expect(list.every((l) => l.locationCode === "A01")).toBe(true);
  });

  it("blocks READY_TO_PACK while any line is SHORT, and resolving it unblocks", () => {
    const lines = db.select().from(schema.orderLine).all();
    const mewLine = lines.find((l) => l.rawName === "Mew ex")!;
    const pikaLine = lines.find((l) => l.rawName === "Pikachu")!;

    pick.markPulled(mewLine.id);
    pick.markShort(pikaLine.id, { reason: "not on shelf" });

    let orderRow = db.select().from(schema.order).where(eq(schema.order.id, mewLine.orderId)).get()!;
    expect(orderRow.status).toBe("NEEDS_ATTENTION");

    pick.resolveShort(pikaLine.id, "REDUCE_QUANTITY", 0);
    orderRow = db.select().from(schema.order).where(eq(schema.order.id, mewLine.orderId)).get()!;
    expect(orderRow.status).toBe("READY_TO_PACK");
  });

  it("fulfillment reduces on-hand quantity and is reversible via a compensating entry", () => {
    const mewLot = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.inventoryItemId, mewId)).get()!;
    expect(mewLot.quantity).toBe(5);

    const orderRow = db.select().from(schema.order).where(eq(schema.order.externalOrderId, "ORD-1")).get()!;
    const result = pick.confirmFulfillment(orderRow.id);
    expect(result.linesFulfilled).toBe(1); // pikachu line was reduced to qty 0, so only mew counts

    const mewLotAfter = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.inventoryItemId, mewId)).get()!;
    expect(mewLotAfter.quantity).toBe(3); // 5 - 2

    const reversedCount = pick.reverseFulfillment(result.historyGroupId);
    expect(reversedCount).toBe(1);

    const mewLotReversed = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.inventoryItemId, mewId)).get()!;
    expect(mewLotReversed.quantity).toBe(5);

    const originalEntry = db.select().from(schema.history).where(eq(schema.history.groupId, result.historyGroupId)).all();
    expect(originalEntry.every((e) => e.reversed)).toBe(true);
    // Original entry still exists (not deleted), plus a compensating entry.
    const allFulfillRelated = db.select().from(schema.history).all();
    expect(allFulfillRelated.length).toBeGreaterThanOrEqual(2);
  });

  it("re-importing the same order file does not reset pick progress (idempotent)", () => {
    const started = startImport("ORDER", "orders.csv", ORDER_CSV);
    previewImport(started.batchId, "ORDER", ORDER_MAPPING);
    const result = commitOrderImport(started.batchId);
    expect(result.ordersCreated).toBe(0);
    expect(result.ordersUpdated).toBe(1);
    expect(result.linesCreated).toBe(0);
    expect(result.linesUpdated).toBe(2);

    const lines = db.select().from(schema.orderLine).all();
    const mewLine = lines.find((l) => l.rawName === "Mew ex")!;
    expect(mewLine.pickState).toBe("PULLED"); // untouched by re-import
  });

  it("surfaces ambiguous matches rather than auto-resolving them", () => {
    // match_key is unique by schema, so real-world ambiguity comes from a
    // dirty tier-1 (duplicate SKU) or tier-2 (product+condition+printing)
    // collision. Simulate a duplicate SKU here.
    db.insert(schema.inventoryItem)
      .values({
        tcgplayerSkuId: "SKU-DUP",
        name: "Mew ex (alt print run)", setName: "Pokémon 151", cardNumber: "232/165",
        condition: "NM", printing: "HOLOFOIL",
        matchKey: "mew ex alt|pokemon 151|232/165|NM|HOLOFOIL",
      })
      .run();
    db.update(schema.inventoryItem).set({ tcgplayerSkuId: "SKU-DUP" }).where(eq(schema.inventoryItem.id, mewId)).run();

    const started = startImport(
      "ORDER",
      "orders2.csv",
      "Order #,Product Name,Set,Number,Condition,SKU,Quantity\nORD-2,Mew ex,Pokémon 151,232/165,Near Mint Holofoil,SKU-DUP,1"
    );
    const preview = previewImport(started.batchId, "ORDER", { ...ORDER_MAPPING, tcgplayerSkuId: "SKU" });
    expect(preview.counts.ambiguous).toBe(1);

    const commitResult = commitOrderImport(started.batchId);
    expect(commitResult.ambiguous).toBe(1);

    const orderRow = db.select().from(schema.order).where(eq(schema.order.externalOrderId, "ORD-2")).get()!;
    expect(orderRow.status).toBe("NEEDS_ATTENTION");

    const line = db.select().from(schema.orderLine).where(eq(schema.orderLine.orderId, orderRow.id)).get()!;
    expect(line.matchStatus).toBe("AMBIGUOUS");
    expect(line.matchedInventoryItemId).toBeNull();
  });
});
