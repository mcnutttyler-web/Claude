import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

// LOCATION -------------------------------------------------------------

export const location = sqliteTable(
  "location",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    kind: text("kind", { enum: ["GRANULAR", "LEGACY"] }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    maxSkus: integer("max_skus"),
    maxQuantity: integer("max_quantity"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("location_code_idx").on(t.code)],
);

// INVENTORY ITEM ---------------------------------------------------------

export const inventoryItem = sqliteTable(
  "inventory_item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tcgplayerProductId: text("tcgplayer_product_id"),
    tcgplayerSkuId: text("tcgplayer_sku_id"),
    name: text("name").notNull(),
    setName: text("set_name").notNull(),
    setCode: text("set_code"),
    cardNumber: text("card_number"),
    printing: text("printing").notNull().default("Normal"),
    condition: text("condition").notNull(),
    matchKey: text("match_key").notNull(),
    marketPriceCents: integer("market_price_cents"),
    marketPriceAsof: text("market_price_asof"),
    sellPriceCents: integer("sell_price_cents"),
    status: text("status", {
      enum: ["ACTIVE", "RESERVE", "BULK", "SOLD_OUT", "INACTIVE"],
    })
      .notNull()
      .default("ACTIVE"),
    source: text("source"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("inventory_item_match_key_idx").on(t.matchKey),
    index("inventory_item_name_idx").on(t.name),
    index("inventory_item_set_name_idx").on(t.setName),
    index("inventory_item_card_number_idx").on(t.cardNumber),
    index("inventory_item_sku_idx").on(t.tcgplayerSkuId),
    index("inventory_item_product_idx").on(t.tcgplayerProductId),
  ],
);

// INVENTORY LOT ----------------------------------------------------------

export const inventoryLot = sqliteTable(
  "inventory_lot",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inventoryItemId: integer("inventory_item_id")
      .notNull()
      .references(() => inventoryItem.id),
    locationId: integer("location_id")
      .notNull()
      .references(() => location.id),
    quantity: integer("quantity").notNull().default(0),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(true),
    ...timestamps,
  },
  (t) => [index("inventory_lot_item_idx").on(t.inventoryItemId)],
);

// SET ALIAS ---------------------------------------------------------------

export const setAlias = sqliteTable(
  "set_alias",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    alias: text("alias").notNull(),
    fullName: text("full_name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("set_alias_alias_idx").on(t.alias)],
);

// MAPPING PROFILE -----------------------------------------------------------

export const mappingProfile = sqliteTable("mapping_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["INVENTORY_IMPORT", "ORDER_IMPORT", "EXPORT"],
  }).notNull(),
  shapeSignature: text("shape_signature").notNull(),
  columnMap: text("column_map").notNull(), // JSON
  ...timestamps,
});

// IMPORT BATCH --------------------------------------------------------------

export const importBatch = sqliteTable("import_batch", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  sha256: text("sha256").notNull(),
  kind: text("kind", { enum: ["INVENTORY", "ORDER"] }).notNull(),
  rowCount: integer("row_count").notNull(),
  mappingProfileId: integer("mapping_profile_id").references(
    () => mappingProfile.id,
  ),
  warnings: text("warnings"), // JSON array
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

// ORDER -----------------------------------------------------------------

export const order = sqliteTable(
  "order",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tcgplayerOrderId: text("tcgplayer_order_id").notNull(),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    shipBy: text("ship_by"),
    status: text("status", {
      enum: [
        "PENDING",
        "READY_TO_PACK",
        "NEEDS_ATTENTION",
        "FULFILLED",
        "CANCELLED",
      ],
    })
      .notNull()
      .default("PENDING"),
    importBatchId: integer("import_batch_id").references(() => importBatch.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("order_tcgplayer_id_idx").on(t.tcgplayerOrderId)],
);

// ORDER LINE ---------------------------------------------------------------

export const orderLine = sqliteTable(
  "order_line",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => order.id),
    lineIndex: integer("line_index").notNull(),
    name: text("name").notNull(),
    setName: text("set_name"),
    cardNumber: text("card_number"),
    condition: text("condition"),
    printing: text("printing"),
    tcgplayerSkuId: text("tcgplayer_sku_id"),
    quantity: integer("quantity").notNull().default(1),
    matchedInventoryItemId: integer("matched_inventory_item_id").references(
      () => inventoryItem.id,
    ),
    matchStatus: text("match_status", {
      enum: ["MATCHED", "AMBIGUOUS", "UNMATCHED"],
    })
      .notNull()
      .default("UNMATCHED"),
    pickState: text("pick_state", {
      enum: ["PENDING", "PULLED", "SHORT"],
    })
      .notNull()
      .default("PENDING"),
    shortReason: text("short_reason"),
    resolution: text("resolution", {
      enum: ["FOUND_ELSEWHERE", "REDUCE_QUANTITY", "CANCEL_LINE"],
    }),
    pickedLocationId: integer("picked_location_id").references(
      () => location.id,
    ),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("order_line_natural_key_idx").on(t.orderId, t.lineIndex),
  ],
);

// INVENTORY HISTORY ----------------------------------------------------------

export const inventoryHistory = sqliteTable(
  "inventory_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inventoryItemId: integer("inventory_item_id").references(
      () => inventoryItem.id,
    ),
    orderId: integer("order_id").references(() => order.id),
    action: text("action", {
      enum: [
        "CREATE",
        "UPDATE",
        "PRICE_CHANGE",
        "QTY_CHANGE",
        "MOVE",
        "BULK_ASSIGN",
        "RECONCILE",
        "FULFILLMENT",
        "FULFILLMENT_REVERSAL",
        "IMPORT",
        "DELETE",
        "PURGE",
      ],
    }).notNull(),
    field: text("field"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    batchGroupId: text("batch_group_id"),
    reversible: integer("reversible", { mode: "boolean" })
      .notNull()
      .default(false),
    reversedAt: text("reversed_at"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    index("inventory_history_item_idx").on(t.inventoryItemId),
    index("inventory_history_batch_idx").on(t.batchGroupId),
  ],
);

// PRICING SETTINGS (singleton row, id = 1) -----------------------------------

export const pricingSettings = sqliteTable("pricing_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lowFloorCents: integer("low_floor_cents").notNull().default(49),
  p1Bps: integer("p1_bps").notNull().default(0), // basis points, 100 = 1%
  p2Bps: integer("p2_bps").notNull().default(0),
  p3Bps: integer("p3_bps").notNull().default(0),
  roundingMode: text("rounding_mode", {
    enum: ["NONE", "NEAREST_CENT", "UP_TO_X9"],
  })
    .notNull()
    .default("UP_TO_X9"),
  hardFloorCents: integer("hard_floor_cents").notNull().default(49),
  stalenessDays: integer("staleness_days").notNull().default(30),
});

// APP SETTINGS (singleton row, id = 1) --------------------------------------

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exportIncludeQuantity: integer("export_include_quantity", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  exportQuantityMode: text("export_quantity_mode", {
    enum: ["ADD_TO", "TOTAL"],
  })
    .notNull()
    .default("TOTAL"),
  lateOrderThresholdHours: integer("late_order_threshold_hours")
    .notNull()
    .default(24),
});
