import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { inventoryItem, inventoryLot, appSettings } from "@/db/schema";
import { stringifyCsv } from "./csv";
import { formatCents } from "./money";

export interface ExportOptions {
  includeQuantity: boolean;
}

/**
 * Export writes price only by default. Quantity is included only when the
 * caller has already confirmed the semantics via the Settings dialog —
 * getting this wrong overwrites live TCGplayer listings.
 */
export function buildInventoryExportCsv({ includeQuantity }: ExportOptions): string {
  const items = db
    .select({
      sku: inventoryItem.tcgplayerSkuId,
      productId: inventoryItem.tcgplayerProductId,
      sellPriceCents: inventoryItem.sellPriceCents,
      quantity: inventoryLot.quantity,
    })
    .from(inventoryItem)
    .leftJoin(inventoryLot, and(eq(inventoryLot.inventoryItemId, inventoryItem.id), eq(inventoryLot.isPrimary, true)))
    .where(eq(inventoryItem.status, "ACTIVE"))
    .all()
    .filter((i) => i.sku && i.sellPriceCents != null);

  const rows = items.map((item) => {
    const row: Record<string, string> = {
      "TCGplayer SKU ID": item.sku ?? "",
      "TCGplayer Product ID": item.productId ?? "",
      Price: formatCents(item.sellPriceCents).replace("$", ""),
    };
    if (includeQuantity) row.Quantity = String(item.quantity ?? 0);
    return row;
  });

  const headerLabels = includeQuantity
    ? ["TCGplayer SKU ID", "TCGplayer Product ID", "Price", "Quantity"]
    : ["TCGplayer SKU ID", "TCGplayer Product ID", "Price"];

  return stringifyCsv(headerLabels, rows);
}

export function getExportSettings() {
  return db.select().from(appSettings).get()!;
}
