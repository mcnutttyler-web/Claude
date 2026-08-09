import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { location, inventoryLot } from "@/db/schema";
import { UNASSIGNED_LOCATION_CODE } from "./constants";

export interface CreateLocationInput {
  code: string;
  kind: "GRANULAR" | "LEGACY";
  maxSkus?: number | null;
  maxQuantity?: number | null;
  notes?: string | null;
}

export function createLocation(input: CreateLocationInput) {
  const defaults =
    input.kind === "GRANULAR"
      ? { maxSkus: input.maxSkus ?? 60, maxQuantity: input.maxQuantity ?? 300 }
      : { maxSkus: null, maxQuantity: null };
  const inserted = db
    .insert(location)
    .values({
      code: input.code.trim(),
      kind: input.kind,
      maxSkus: defaults.maxSkus,
      maxQuantity: defaults.maxQuantity,
      notes: input.notes ?? null,
    })
    .run();
  return Number(inserted.lastInsertRowid);
}

export function updateLocation(
  id: number,
  patch: Partial<{ active: boolean; maxSkus: number | null; maxQuantity: number | null; notes: string | null }>,
) {
  db.update(location)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(location.id, id))
    .run();
}

export function getLocationByCode(code: string) {
  return db.select().from(location).where(eq(location.code, code)).get() ?? null;
}

export function getUnassignedLocationId(): number {
  const row = db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.code, UNASSIGNED_LOCATION_CODE))
    .get();
  if (!row) {
    throw new Error("UNASSIGNED sentinel location is missing — run migrations.");
  }
  return row.id;
}

export interface LocationCapacity {
  id: number;
  code: string;
  kind: "GRANULAR" | "LEGACY";
  active: boolean;
  maxSkus: number | null;
  maxQuantity: number | null;
  skuCount: number;
  totalQuantity: number;
  skusRemaining: number | null;
  quantityRemaining: number | null;
}

export function getLocationCapacities(): LocationCapacity[] {
  const rows = db
    .select({
      id: location.id,
      code: location.code,
      kind: location.kind,
      active: location.active,
      maxSkus: location.maxSkus,
      maxQuantity: location.maxQuantity,
      skuCount: sql<number>`count(distinct ${inventoryLot.inventoryItemId})`,
      totalQuantity: sql<number>`coalesce(sum(${inventoryLot.quantity}), 0)`,
    })
    .from(location)
    .leftJoin(inventoryLot, eq(inventoryLot.locationId, location.id))
    .groupBy(location.id)
    .all();

  return rows.map((r) => ({
    ...r,
    skusRemaining: r.maxSkus != null ? r.maxSkus - r.skuCount : null,
    quantityRemaining: r.maxQuantity != null ? r.maxQuantity - r.totalQuantity : null,
  }));
}

/**
 * Ranks GRANULAR, active, non-full locations by remaining SKU capacity.
 * Legacy locations (OLD-*, BOX-*) have no limits and are intentionally
 * excluded — they're a migration destination, not a suggestion target.
 */
export function suggestLocations(limit = 5): LocationCapacity[] {
  return getLocationCapacities()
    .filter((l) => l.kind === "GRANULAR" && l.active)
    .filter((l) => l.skusRemaining === null || l.skusRemaining > 0)
    .filter((l) => l.quantityRemaining === null || l.quantityRemaining > 0)
    .sort((a, b) => (b.skusRemaining ?? Infinity) - (a.skusRemaining ?? Infinity))
    .slice(0, limit);
}
