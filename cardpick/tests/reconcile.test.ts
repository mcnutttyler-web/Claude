import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, migrateTestDb } from "./setup";

setupTestDb();

const RECONCILE_CSV = [
  "TCGplayer Id,Product Name,Set Name,Number,Condition,Total Quantity",
  "1,Pikachu,Pokémon 151,025/165,Near Mint,7",
].join("\n");

const MAPPING = {
  tcgplayerProductId: "TCGplayer Id",
  tcgplayerSkuId: null,
  name: "Product Name",
  setName: "Set Name",
  setCode: null,
  cardNumber: "Number",
  rawCondition: "Condition",
  marketPrice: null,
  quantity: "Total Quantity",
};

describe("quantity reconciliation", () => {
  let db: typeof import("../lib/db/client").db;
  let schema: typeof import("../lib/db/schema");
  let startImport: typeof import("../lib/import/inventory-import").startImport;
  let previewImport: typeof import("../lib/import/inventory-import").previewImport;
  let getReconcileDiff: typeof import("../lib/reconcile").getReconcileDiff;
  let applyReconcileDecisions: typeof import("../lib/reconcile").applyReconcileDecisions;
  let pikaId: number;
  let lotId: number;

  beforeAll(async () => {
    await migrateTestDb();
    schema = await import("../lib/db/schema");
    const client = await import("../lib/db/client");
    db = client.db;
    const matching = await import("../lib/matching");
    matching.seedConditionSuffixes();
    const invMod = await import("../lib/import/inventory-import");
    startImport = invMod.startImport;
    previewImport = invMod.previewImport;
    const reconcileMod = await import("../lib/reconcile");
    getReconcileDiff = reconcileMod.getReconcileDiff;
    applyReconcileDecisions = reconcileMod.applyReconcileDecisions;

    const locId = db.insert(schema.location).values({ code: "A01", kind: "GRANULAR", active: true }).returning().get().id;
    pikaId = db
      .insert(schema.inventoryItem)
      .values({
        name: "Pikachu", setName: "Pokémon 151", cardNumber: "025/165",
        condition: "NM", printing: "NORMAL",
        matchKey: matching.buildMatchKey({ name: "Pikachu", setName: "Pokémon 151", cardNumber: "025/165", conditionCode: "NM", printingCode: "NORMAL" }),
      })
      .returning().get().id;
    lotId = db.insert(schema.inventoryLot).values({ inventoryItemId: pikaId, locationId: locId, quantity: 3, isPrimary: true }).returning().get().id;
  });

  it("computes a three-column diff without changing anything", () => {
    const started = startImport("RECONCILE", "reconcile.csv", RECONCILE_CSV);
    previewImport(started.batchId, "RECONCILE", MAPPING);

    const diff = getReconcileDiff(started.batchId);
    expect(diff).toHaveLength(1);
    expect(diff[0].cardpickQty).toBe(3);
    expect(diff[0].tcgplayerQty).toBe(7);
    expect(diff[0].deltaQty).toBe(4);

    const lot = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.id, lotId)).get()!;
    expect(lot.quantity).toBe(3); // untouched until a decision is applied
  });

  it("applies only explicitly-accepted rows and logs RECONCILE history", () => {
    const started = startImport("RECONCILE", "reconcile2.csv", RECONCILE_CSV);
    previewImport(started.batchId, "RECONCILE", MAPPING);
    const diff = getReconcileDiff(started.batchId);

    const result = applyReconcileDecisions(started.batchId, [{ importRowId: diff[0].importRowId, action: "ACCEPT_TCGPLAYER" }]);
    expect(result.changed).toBe(1);

    const lot = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.id, lotId)).get()!;
    expect(lot.quantity).toBe(7);

    const historyRows = db.select().from(schema.history).where(eq(schema.history.entityId, lotId)).all();
    expect(historyRows.some((h) => h.reason === "RECONCILE")).toBe(true);
  });

  it("Accept CardPick and Skip make no changes", () => {
    db.update(schema.inventoryLot).set({ quantity: 3 }).where(eq(schema.inventoryLot.id, lotId)).run();
    const started = startImport("RECONCILE", "reconcile3.csv", RECONCILE_CSV);
    previewImport(started.batchId, "RECONCILE", MAPPING);
    const diff = getReconcileDiff(started.batchId);

    applyReconcileDecisions(started.batchId, [{ importRowId: diff[0].importRowId, action: "ACCEPT_CARDPICK" }]);
    let lot = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.id, lotId)).get()!;
    expect(lot.quantity).toBe(3);

    const started2 = startImport("RECONCILE", "reconcile4.csv", RECONCILE_CSV);
    previewImport(started2.batchId, "RECONCILE", MAPPING);
    const diff2 = getReconcileDiff(started2.batchId);
    applyReconcileDecisions(started2.batchId, [{ importRowId: diff2[0].importRowId, action: "SKIP" }]);
    lot = db.select().from(schema.inventoryLot).where(eq(schema.inventoryLot.id, lotId)).get()!;
    expect(lot.quantity).toBe(3);
  });
});
