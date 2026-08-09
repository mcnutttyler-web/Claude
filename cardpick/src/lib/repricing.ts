import { randomUUID } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem, pricingSettings } from "@/db/schema";
import { computeSellPriceCents, isStale, type PricingSettingsLike } from "./pricing";
import { logHistory } from "./history";
import { snapshot } from "@/db/backup";

export function getPricingSettings(): PricingSettingsLike & { id: number } {
  return db.select().from(pricingSettings).get()!;
}

export function updatePricingSettings(patch: Partial<PricingSettingsLike>) {
  const settings = getPricingSettings();
  db.update(pricingSettings)
    .set(patch)
    .where(eq(pricingSettings.id, settings.id))
    .run();
}

export interface RepriceRow {
  itemId: number;
  name: string;
  setName: string;
  currentSellPriceCents: number | null;
  proposedSellPriceCents: number;
  marketPriceCents: number;
  marketPriceAsof: string | null;
  isStale: boolean;
}

/** Refuses (flags as stale) items whose market price is too old without an explicit override. */
export function previewReprice(includeStale: boolean): RepriceRow[] {
  const settings = getPricingSettings();
  const items = db
    .select()
    .from(inventoryItem)
    .where(and(eq(inventoryItem.status, "ACTIVE"), isNotNull(inventoryItem.marketPriceCents)))
    .all();

  return items
    .map((item) => {
      const stale = isStale(item.marketPriceAsof, settings.stalenessDays);
      if (stale && !includeStale) return null;
      return {
        itemId: item.id,
        name: item.name,
        setName: item.setName,
        currentSellPriceCents: item.sellPriceCents,
        proposedSellPriceCents: computeSellPriceCents(item.marketPriceCents!, settings),
        marketPriceCents: item.marketPriceCents!,
        marketPriceAsof: item.marketPriceAsof,
        isStale: stale,
      };
    })
    .filter((r): r is RepriceRow => r !== null);
}

export function applyReprice(itemIds: number[]): { updatedCount: number; batchGroupId: string } {
  snapshot("reprice");
  const settings = getPricingSettings();
  const batchGroupId = randomUUID();
  let updatedCount = 0;

  for (const itemId of itemIds) {
    const item = db.select().from(inventoryItem).where(eq(inventoryItem.id, itemId)).get();
    if (!item || item.marketPriceCents == null) continue;
    const proposed = computeSellPriceCents(item.marketPriceCents, settings);
    if (proposed === item.sellPriceCents) continue;

    db.update(inventoryItem)
      .set({ sellPriceCents: proposed, updatedAt: new Date().toISOString() })
      .where(eq(inventoryItem.id, itemId))
      .run();
    logHistory({
      inventoryItemId: itemId,
      action: "PRICE_CHANGE",
      field: "sell_price_cents",
      oldValue: item.sellPriceCents,
      newValue: proposed,
      batchGroupId,
      notes: "Repricing apply",
    });
    updatedCount++;
  }

  return { updatedCount, batchGroupId };
}
