import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export const location = sqliteTable("location", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  kind: text("kind", { enum: ["GRANULAR", "LEGACY"] }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  maxSkus: integer("max_skus"),
  maxQuantity: integer("max_quantity"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  codeUnique: uniqueIndex("location_code_unique").on(t.code),
}));

// ---------------------------------------------------------------------------
// Set aliases (abbreviation -> canonical set name)
// ---------------------------------------------------------------------------

export const setAlias = sqliteTable("set_alias", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alias: text("alias").notNull(),
  fullName: text("full_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  aliasUnique: uniqueIndex("set_alias_alias_unique").on(t.alias),
}));

// ---------------------------------------------------------------------------
// Condition/printing lookup — TCGplayer fuses printing into the condition
// string ("Near Mint Foil"). This table maps a suffix to a printing code so
// the importer can split it out before building match_key.
// ---------------------------------------------------------------------------

export const conditionSuffix = sqliteTable("condition_suffix", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  suffix: text("suffix").notNull(), // e.g. "Foil", "Holofoil", "Reverse Holofoil", "1st Edition"
  printingCode: text("printing_code").notNull(), // e.g. "HOLOFOIL"
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  suffixUnique: uniqueIndex("condition_suffix_unique").on(t.suffix),
}));

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const inventoryItem = sqliteTable("inventory_item", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tcgplayerProductId: text("tcgplayer_product_id"),
  tcgplayerSkuId: text("tcgplayer_sku_id"),
  name: text("name").notNull(),
  setName: text("set_name").notNull(),
  setCode: text("set_code"),
  cardNumber: text("card_number").notNull().default(""),
  printing: text("printing").notNull().default("NORMAL"),
  condition: text("condition").notNull(),
  matchKey: text("match_key").notNull(),
  marketPriceCents: integer("market_price_cents"),
  marketPriceAsof: text("market_price_asof"), // ISO date
  sellPriceCents: integer("sell_price_cents"),
  // Quantity captured from an import before the item has ever been assigned
  // a location (and therefore before an inventory_lot can exist). Bulk
  // location assignment consumes this to seed the item's first lot, then it
  // is no longer the source of truth — inventory_lot.quantity is.
  pendingQuantity: integer("pending_quantity"),
  status: text("status", {
    enum: ["ACTIVE", "RESERVE", "BULK", "SOLD_OUT", "INACTIVE"],
  }).notNull().default("ACTIVE"),
  source: text("source"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  matchKeyUnique: uniqueIndex("inventory_item_match_key_unique").on(t.matchKey),
  skuIdx: index("inventory_item_sku_idx").on(t.tcgplayerSkuId),
  productIdx: index("inventory_item_product_idx").on(t.tcgplayerProductId),
  nameIdx: index("inventory_item_name_idx").on(t.name),
  setNameIdx: index("inventory_item_set_name_idx").on(t.setName),
  cardNumberIdx: index("inventory_item_card_number_idx").on(t.cardNumber),
}));

export const inventoryLot = sqliteTable("inventory_lot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inventoryItemId: integer("inventory_item_id").notNull().references(() => inventoryItem.id),
  locationId: integer("location_id").notNull().references(() => location.id),
  quantity: integer("quantity").notNull().default(0),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  itemIdx: index("inventory_lot_item_idx").on(t.inventoryItemId),
  locationIdx: index("inventory_lot_location_idx").on(t.locationId),
}));

// ---------------------------------------------------------------------------
// Import mapping profiles — a saved header->field mapping keyed by the
// "shape" (sorted header list) of the source file, so the same file shape
// auto-applies its mapping on the next import.
// ---------------------------------------------------------------------------

export const mappingProfile = sqliteTable("mapping_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["INVENTORY", "ORDER", "RECONCILE"] }).notNull(),
  shapeSignature: text("shape_signature").notNull(),
  fieldMapJson: text("field_map_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  shapeUnique: uniqueIndex("mapping_profile_shape_unique").on(t.kind, t.shapeSignature),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export const importBatch = sqliteTable("import_batch", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  sha256: text("sha256").notNull(),
  kind: text("kind", { enum: ["INVENTORY", "ORDER", "RECONCILE"] }).notNull(),
  rowCount: integer("row_count").notNull().default(0),
  mappingProfileId: integer("mapping_profile_id").references(() => mappingProfile.id),
  status: text("status", { enum: ["DRAFT", "COMMITTED", "DISCARDED"] }).notNull().default("DRAFT"),
  importedAt: text("imported_at").notNull().default(sql`(current_timestamp)`),
  committedAt: text("committed_at"),
  notes: text("notes"),
}, (t) => ({
  sha256Idx: index("import_batch_sha256_idx").on(t.sha256),
}));

export const importRow = sqliteTable("import_row", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importBatchId: integer("import_batch_id").notNull().references(() => importBatch.id),
  rowIndex: integer("row_index").notNull(),
  rawJson: text("raw_json").notNull(),
  mappedJson: text("mapped_json").notNull(),
  matchStatus: text("match_status", { enum: ["NEW", "MATCHED", "AMBIGUOUS"] }).notNull(),
  matchedInventoryItemId: integer("matched_inventory_item_id").references(() => inventoryItem.id),
  candidatesJson: text("candidates_json"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  batchIdx: index("import_row_batch_idx").on(t.importBatchId),
}));

// ---------------------------------------------------------------------------
// Orders / pick mode
// ---------------------------------------------------------------------------

export const order = sqliteTable("order", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalOrderId: text("external_order_id").notNull(),
  source: text("source"),
  importBatchId: integer("import_batch_id").references(() => importBatch.id),
  importedAt: text("imported_at").notNull().default(sql`(current_timestamp)`),
  shipBy: text("ship_by"),
  status: text("status", {
    enum: ["PENDING", "NEEDS_ATTENTION", "READY_TO_PACK", "FULFILLED", "CANCELLED"],
  }).notNull().default("PENDING"),
}, (t) => ({
  externalIdx: uniqueIndex("order_external_id_unique").on(t.externalOrderId),
}));

export const orderLine = sqliteTable("order_line", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => order.id),
  lineIndex: integer("line_index").notNull(),
  rawName: text("raw_name").notNull(),
  rawSetName: text("raw_set_name"),
  rawCardNumber: text("raw_card_number"),
  rawCondition: text("raw_condition"),
  rawPrinting: text("raw_printing"),
  quantityOrdered: integer("quantity_ordered").notNull().default(1),
  quantityPicked: integer("quantity_picked").notNull().default(0),
  matchedInventoryItemId: integer("matched_inventory_item_id").references(() => inventoryItem.id),
  matchStatus: text("match_status", { enum: ["MATCHED", "AMBIGUOUS", "UNMATCHED"] }).notNull(),
  candidatesJson: text("candidates_json"),
  pickState: text("pick_state", { enum: ["PENDING", "PULLED", "SHORT"] }).notNull().default("PENDING"),
  shortReason: text("short_reason"),
  resolutionAction: text("resolution_action", {
    enum: ["FOUND_ELSEWHERE", "REDUCE_QUANTITY", "CANCEL_LINE"],
  }),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  naturalKey: uniqueIndex("order_line_natural_key").on(t.orderId, t.lineIndex),
  orderIdx: index("order_line_order_idx").on(t.orderId),
}));

// ---------------------------------------------------------------------------
// History (audit trail, reversible actions)
// ---------------------------------------------------------------------------

export const history = sqliteTable("history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(), // e.g. "inventory_item", "inventory_lot", "order_line"
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(), // e.g. "CREATE", "PRICE_CHANGE", "QTY_CHANGE", "MOVE", "FULFILL", "RECONCILE"
  reason: text("reason"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  groupId: text("group_id"), // ties together a single grouped/reversible bulk action
  reversed: integer("reversed", { mode: "boolean" }).notNull().default(false),
  reversalOfId: integer("reversal_of_id"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
}, (t) => ({
  entityIdx: index("history_entity_idx").on(t.entityType, t.entityId),
  groupIdx: index("history_group_idx").on(t.groupId),
}));

// ---------------------------------------------------------------------------
// Settings (key/value)
// ---------------------------------------------------------------------------

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});
