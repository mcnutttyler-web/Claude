import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem, inventoryLot, location } from "@/db/schema";

export interface InventorySearchParams {
  q?: string;
  status?: string;
  setName?: string;
  locationId?: number;
  page?: number;
  pageSize?: number;
}

export function searchInventory({ q, status, setName, locationId, page = 1, pageSize = 50 }: InventorySearchParams) {
  const clauses = [];
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    clauses.push(
      or(
        like(inventoryItem.name, term),
        like(inventoryItem.setName, term),
        like(inventoryItem.cardNumber, term),
        like(inventoryItem.tcgplayerSkuId, term),
      ),
    );
  }
  if (status) clauses.push(eq(inventoryItem.status, status as typeof inventoryItem.$inferSelect.status));
  if (setName) clauses.push(eq(inventoryItem.setName, setName));
  if (locationId != null) clauses.push(eq(inventoryLot.locationId, locationId));

  const where = clauses.length ? and(...clauses) : undefined;

  const rows = db
    .select({
      id: inventoryItem.id,
      name: inventoryItem.name,
      setName: inventoryItem.setName,
      cardNumber: inventoryItem.cardNumber,
      condition: inventoryItem.condition,
      printing: inventoryItem.printing,
      status: inventoryItem.status,
      marketPriceCents: inventoryItem.marketPriceCents,
      marketPriceAsof: inventoryItem.marketPriceAsof,
      sellPriceCents: inventoryItem.sellPriceCents,
      tcgplayerSkuId: inventoryItem.tcgplayerSkuId,
      quantity: inventoryLot.quantity,
      locationCode: location.code,
      locationId: location.id,
    })
    .from(inventoryItem)
    .leftJoin(inventoryLot, and(eq(inventoryLot.inventoryItemId, inventoryItem.id), eq(inventoryLot.isPrimary, true)))
    .leftJoin(location, eq(location.id, inventoryLot.locationId))
    .where(where)
    .orderBy(desc(inventoryItem.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const totalRow = db
    .select({ c: sql<number>`count(*)` })
    .from(inventoryItem)
    .leftJoin(inventoryLot, and(eq(inventoryLot.inventoryItemId, inventoryItem.id), eq(inventoryLot.isPrimary, true)))
    .where(where)
    .get();

  return { rows, total: totalRow?.c ?? 0, page, pageSize };
}

export function getInventoryItemSummaries(ids: number[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      id: inventoryItem.id,
      name: inventoryItem.name,
      setName: inventoryItem.setName,
      cardNumber: inventoryItem.cardNumber,
      condition: inventoryItem.condition,
      printing: inventoryItem.printing,
      tcgplayerSkuId: inventoryItem.tcgplayerSkuId,
    })
    .from(inventoryItem)
    .where(inArray(inventoryItem.id, ids))
    .all();
}

export function getInventoryItemDetail(id: number) {
  const item = db.select().from(inventoryItem).where(eq(inventoryItem.id, id)).get();
  if (!item) return null;
  const lot = db
    .select({ id: inventoryLot.id, quantity: inventoryLot.quantity, locationCode: location.code, locationId: location.id })
    .from(inventoryLot)
    .leftJoin(location, eq(location.id, inventoryLot.locationId))
    .where(and(eq(inventoryLot.inventoryItemId, id), eq(inventoryLot.isPrimary, true)))
    .get();
  return { item, lot };
}

export function getDistinctSetNames() {
  return db
    .selectDistinct({ setName: inventoryItem.setName })
    .from(inventoryItem)
    .orderBy(inventoryItem.setName)
    .all()
    .map((r) => r.setName);
}
