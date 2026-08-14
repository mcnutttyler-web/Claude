import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { inventoryItem, settings } from "./db/schema";
import { snapshotDatabase } from "./backup";
import { newGroupId, recordHistory } from "./history";

export type RoundingMode = "none" | "nearest_cent" | "up_to_x9";

export interface PricingSettings {
  /** Below this, the flat floor applies regardless of percentage bands. */
  flatFloorCents: number;
  p1: number; // $0.49 <= market < $2.00
  p2: number; // $2.00 <= market < $10.00
  p3: number; // market >= $10.00
  roundingMode: RoundingMode;
  /** Applied after banding + rounding, as a final safety net. */
  hardFloorCents: number;
  /** Refuse to reprice items whose market_price_asof is older than this many days, absent an override. */
  stalenessDays: number;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  flatFloorCents: 49,
  p1: 0,
  p2: 0,
  p3: 0,
  roundingMode: "up_to_x9",
  hardFloorCents: 49,
  stalenessDays: 30,
};

const SETTINGS_KEY = "pricing";

export function getPricingSettings(): PricingSettings {
  const row = db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).get();
  if (!row) return DEFAULT_PRICING_SETTINGS;
  return { ...DEFAULT_PRICING_SETTINGS, ...(JSON.parse(row.value) as Partial<PricingSettings>) };
}

export function savePricingSettings(partial: Partial<PricingSettings>) {
  const merged = { ...getPricingSettings(), ...partial };
  const existing = db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).get();
  if (existing) {
    db.update(settings).set({ value: JSON.stringify(merged), updatedAt: new Date().toISOString() }).where(eq(settings.key, SETTINGS_KEY)).run();
  } else {
    db.insert(settings).values({ key: SETTINGS_KEY, value: JSON.stringify(merged) }).run();
  }
}

function roundCents(raw: number, mode: RoundingMode): number {
  if (mode === "none") return Math.floor(raw);
  if (mode === "nearest_cent") return Math.round(raw);
  // up_to_x9: ceiling to the next price whose cents end in 9 (e.g. $0.X9),
  // charm pricing — $12.01 -> $12.09, $12.10 -> $12.19.
  const rounded = Math.round(raw);
  const tensFloor = Math.floor(rounded / 10) * 10;
  const candidate = tensFloor + 9;
  return candidate >= rounded ? candidate : candidate + 10;
}

/** Bands evaluated top to bottom, first match wins. */
export function computeSellPriceCents(marketCents: number, s: PricingSettings = getPricingSettings()): number {
  if (marketCents < 49) {
    return Math.max(s.flatFloorCents, s.hardFloorCents);
  }
  let raw: number;
  if (marketCents < 200) {
    raw = marketCents * (1 + s.p1);
  } else if (marketCents < 1000) {
    raw = marketCents * (1 + s.p2);
  } else {
    raw = marketCents * (1 + s.p3);
  }
  const rounded = roundCents(raw, s.roundingMode);
  return Math.max(rounded, s.hardFloorCents);
}

export function isStale(asof: string | null, s: PricingSettings = getPricingSettings()): boolean {
  if (!asof) return true;
  const asofDate = new Date(asof).getTime();
  const cutoff = Date.now() - s.stalenessDays * 24 * 60 * 60 * 1000;
  return asofDate < cutoff;
}

export interface RepriceRow {
  itemId: number;
  name: string;
  setName: string;
  marketPriceCents: number | null;
  marketPriceAsof: string | null;
  currentSellPriceCents: number | null;
  proposedSellPriceCents: number | null;
  deltaCents: number | null;
  stale: boolean;
}

/** Never applies anything — always returns a preview for the user to approve. */
export function previewReprice(itemIds?: number[]): RepriceRow[] {
  const s = getPricingSettings();
  const items = itemIds
    ? itemIds.map((id) => db.select().from(inventoryItem).where(eq(inventoryItem.id, id)).get()).filter(Boolean)
    : db.select().from(inventoryItem).where(eq(inventoryItem.status, "ACTIVE")).all();

  return items
    .filter((i): i is NonNullable<typeof i> => i != null)
    .map((item) => {
      const stale = isStale(item.marketPriceAsof, s);
      const proposed = !stale && item.marketPriceCents != null ? computeSellPriceCents(item.marketPriceCents, s) : null;
      return {
        itemId: item.id,
        name: item.name,
        setName: item.setName,
        marketPriceCents: item.marketPriceCents,
        marketPriceAsof: item.marketPriceAsof,
        currentSellPriceCents: item.sellPriceCents,
        proposedSellPriceCents: proposed,
        deltaCents: proposed != null && item.sellPriceCents != null ? proposed - item.sellPriceCents : null,
        stale,
      };
    });
}

export interface ApplyRepriceOptions {
  /** Apply to stale items anyway (explicit per-row/bulk override). */
  overrideStaleness?: boolean;
}

/** Apply only the rows the caller explicitly approved (itemIds). Stale items
 * are skipped unless overrideStaleness is set. Always snapshots first. */
export function applyReprice(itemIds: number[], options: ApplyRepriceOptions = {}): { applied: number; skippedStale: number } {
  const s = getPricingSettings();
  snapshotDatabase("reprice");
  const groupId = newGroupId();
  let applied = 0;
  let skippedStale = 0;

  for (const id of itemIds) {
    const item = db.select().from(inventoryItem).where(eq(inventoryItem.id, id)).get();
    if (!item || item.marketPriceCents == null) continue;
    const stale = isStale(item.marketPriceAsof, s);
    if (stale && !options.overrideStaleness) {
      skippedStale++;
      continue;
    }
    const proposed = computeSellPriceCents(item.marketPriceCents, s);
    const before = { sellPriceCents: item.sellPriceCents };
    db.update(inventoryItem).set({ sellPriceCents: proposed, updatedAt: new Date().toISOString() }).where(eq(inventoryItem.id, id)).run();
    recordHistory({
      entityType: "inventory_item",
      entityId: id,
      action: "PRICE_CHANGE",
      reason: "reprice",
      before,
      after: { sellPriceCents: proposed },
      groupId,
    });
    applied++;
  }

  return { applied, skippedStale };
}
