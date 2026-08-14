import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { inventoryItem, inventoryLot, location, settings } from "./db/schema";
import { centsToDollarsString } from "./money";

function toCsvField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(toCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(toCsvField).join(","));
  }
  return lines.join("\n");
}

/** Full CardPick-native export. Every field the importer can read back in,
 * so import -> export -> import round-trips without data loss. */
export function exportInventoryRoundTripCsv(): string {
  const rows = db
    .select({
      id: inventoryItem.id,
      tcgplayerProductId: inventoryItem.tcgplayerProductId,
      tcgplayerSkuId: inventoryItem.tcgplayerSkuId,
      name: inventoryItem.name,
      setName: inventoryItem.setName,
      setCode: inventoryItem.setCode,
      cardNumber: inventoryItem.cardNumber,
      printing: inventoryItem.printing,
      condition: inventoryItem.condition,
      marketPriceCents: inventoryItem.marketPriceCents,
      marketPriceAsof: inventoryItem.marketPriceAsof,
      sellPriceCents: inventoryItem.sellPriceCents,
      status: inventoryItem.status,
      locationCode: location.code,
      quantity: inventoryLot.quantity,
    })
    .from(inventoryItem)
    .leftJoin(inventoryLot, eq(inventoryLot.inventoryItemId, inventoryItem.id))
    .leftJoin(location, eq(location.id, inventoryLot.locationId))
    .all();

  const headers = [
    "id", "tcgplayer_product_id", "tcgplayer_sku_id", "name", "set_name", "set_code",
    "card_number", "printing", "condition", "market_price", "market_price_asof",
    "sell_price", "status", "location_code", "quantity",
  ];

  return toCsv(
    headers,
    rows.map((r) => [
      r.id, r.tcgplayerProductId, r.tcgplayerSkuId, r.name, r.setName, r.setCode,
      r.cardNumber, r.printing, r.condition,
      r.marketPriceCents != null ? centsToDollarsString(r.marketPriceCents).replace("$", "") : "",
      r.marketPriceAsof,
      r.sellPriceCents != null ? centsToDollarsString(r.sellPriceCents).replace("$", "") : "",
      r.status, r.locationCode, r.quantity,
    ])
  );
}

export type QuantitySemantics = "ADD_TO" | "TOTAL";

export interface TcgplayerExportSettings {
  skuHeader: string;
  priceHeader: string;
  quantityHeader: string;
  includeQuantity: boolean;
  quantitySemantics: QuantitySemantics;
}

const DEFAULT_TCG_EXPORT_SETTINGS: TcgplayerExportSettings = {
  // Placeholder headers — TCGplayer's real upload template wasn't provided
  // yet (see Phase 0). Adjust these in Settings once it is.
  skuHeader: "TCGplayer Sku",
  priceHeader: "Price",
  quantityHeader: "Add to Quantity",
  includeQuantity: false,
  quantitySemantics: "ADD_TO",
};

const SETTINGS_KEY = "tcgplayer_export";

export function getTcgplayerExportSettings(): TcgplayerExportSettings {
  const row = db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).get();
  if (!row) return DEFAULT_TCG_EXPORT_SETTINGS;
  return { ...DEFAULT_TCG_EXPORT_SETTINGS, ...(JSON.parse(row.value) as Partial<TcgplayerExportSettings>) };
}

export function saveTcgplayerExportSettings(partial: Partial<TcgplayerExportSettings>) {
  const merged = { ...getTcgplayerExportSettings(), ...partial };
  const existing = db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).get();
  if (existing) {
    db.update(settings).set({ value: JSON.stringify(merged), updatedAt: new Date().toISOString() }).where(eq(settings.key, SETTINGS_KEY)).run();
  } else {
    db.insert(settings).values({ key: SETTINGS_KEY, value: JSON.stringify(merged) }).run();
  }
}

/**
 * TCGplayer price/quantity upload export. Writes price only by default —
 * the quantity column stays blank unless the caller explicitly opts in
 * (Settings, behind a confirmation dialog), because getting the quantity
 * semantics wrong overwrites live listings.
 */
export function exportTcgplayerUploadCsv(opts: { includeQuantity: boolean }): string {
  const s = getTcgplayerExportSettings();
  const rows = db
    .select({
      sku: inventoryItem.tcgplayerSkuId,
      sellPriceCents: inventoryItem.sellPriceCents,
      quantity: inventoryLot.quantity,
    })
    .from(inventoryItem)
    .leftJoin(inventoryLot, eq(inventoryLot.inventoryItemId, inventoryItem.id))
    .where(eq(inventoryItem.status, "ACTIVE"))
    .all();

  const headers = opts.includeQuantity ? [s.skuHeader, s.priceHeader, s.quantityHeader] : [s.skuHeader, s.priceHeader];

  return toCsv(
    headers,
    rows
      .filter((r) => r.sku && r.sellPriceCents != null)
      .map((r) => {
        const base = [r.sku, centsToDollarsString(r.sellPriceCents).replace("$", "")];
        return opts.includeQuantity ? [...base, r.quantity ?? ""] : base;
      })
  );
}
