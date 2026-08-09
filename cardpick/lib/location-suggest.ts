import { eq, sql } from "drizzle-orm";
import { db } from "./db/client";
import { inventoryLot, location } from "./db/schema";

export interface SuggestedLocation {
  id: number;
  code: string;
}

/** Suggests the first active GRANULAR location with room under its capacity
 * limits. LEGACY locations (OLD-*, BOX-*) are never suggested — they exist
 * only as an explicit bulk-assignment target for the pre-migration backlog. */
export function suggestLocation(): SuggestedLocation | null {
  const candidates = db
    .select({
      id: location.id,
      code: location.code,
      maxSkus: location.maxSkus,
      maxQuantity: location.maxQuantity,
      skuCount: sql<number>`(select count(*) from ${inventoryLot} where ${inventoryLot.locationId} = ${location.id})`,
      totalQty: sql<number>`(select coalesce(sum(${inventoryLot.quantity}), 0) from ${inventoryLot} where ${inventoryLot.locationId} = ${location.id})`,
    })
    .from(location)
    .where(eq(location.kind, "GRANULAR"))
    .orderBy(location.code)
    .all();

  const fit = candidates.find(
    (c) => c.maxSkus == null || c.skuCount < c.maxSkus,
  );
  return fit ? { id: fit.id, code: fit.code } : null;
}
