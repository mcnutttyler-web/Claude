import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem } from "@/db/schema";

export type MatchStatus = "MATCHED" | "AMBIGUOUS" | "NEW";

export interface MatchResult {
  status: MatchStatus;
  itemId: number | null;
  candidateIds: number[];
}

export interface MatchQuery {
  skuId?: string | null;
  productId?: string | null;
  condition?: string | null;
  printing?: string | null;
  matchKey: string;
}

/**
 * Matching strategy, first hit wins:
 *   1. tcgplayer_sku_id exact
 *   2. tcgplayer_product_id + condition + printing
 *   3. match_key exact
 * More than one row matching a step is ambiguous and must never be
 * auto-resolved.
 */
export function findMatch(query: MatchQuery): MatchResult {
  if (query.skuId) {
    const rows = db
      .select({ id: inventoryItem.id })
      .from(inventoryItem)
      .where(eq(inventoryItem.tcgplayerSkuId, query.skuId))
      .all();
    const resolved = resolve(rows.map((r) => r.id));
    if (resolved) return resolved;
  }

  if (query.productId && query.condition && query.printing) {
    const rows = db
      .select({ id: inventoryItem.id })
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.tcgplayerProductId, query.productId),
          eq(inventoryItem.condition, query.condition),
          eq(inventoryItem.printing, query.printing),
        ),
      )
      .all();
    const resolved = resolve(rows.map((r) => r.id));
    if (resolved) return resolved;
  }

  const rows = db
    .select({ id: inventoryItem.id })
    .from(inventoryItem)
    .where(eq(inventoryItem.matchKey, query.matchKey))
    .all();
  const resolved = resolve(rows.map((r) => r.id));
  if (resolved) return resolved;

  return { status: "NEW", itemId: null, candidateIds: [] };
}

function resolve(ids: number[]): MatchResult | null {
  if (ids.length === 0) return null;
  if (ids.length === 1) return { status: "MATCHED", itemId: ids[0], candidateIds: ids };
  return { status: "AMBIGUOUS", itemId: null, candidateIds: ids };
}
