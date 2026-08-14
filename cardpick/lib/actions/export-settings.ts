"use server";

import { revalidatePath } from "next/cache";
import { saveTcgplayerExportSettings } from "../export";

export async function saveTcgplayerExportHeadersAction(formData: FormData) {
  saveTcgplayerExportSettings({
    skuHeader: String(formData.get("skuHeader") ?? "TCGplayer Sku"),
    priceHeader: String(formData.get("priceHeader") ?? "Price"),
    quantityHeader: String(formData.get("quantityHeader") ?? "Add to Quantity"),
  });
  revalidatePath("/settings");
}
