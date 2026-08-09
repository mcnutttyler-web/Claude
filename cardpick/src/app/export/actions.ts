"use server";

import { buildInventoryExportCsv } from "@/lib/exportInventory";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getAppSettingsAction() {
  return db.select().from(appSettings).get()!;
}

export async function setExportSettingsAction(includeQuantity: boolean, quantityMode: "ADD_TO" | "TOTAL") {
  const settings = db.select().from(appSettings).get()!;
  db.update(appSettings)
    .set({ exportIncludeQuantity: includeQuantity, exportQuantityMode: quantityMode })
    .where(eq(appSettings.id, settings.id))
    .run();
}

export async function generateExportAction(includeQuantity: boolean) {
  return buildInventoryExportCsv({ includeQuantity });
}
