"use server";

import { revalidatePath } from "next/cache";
import { applyReprice, getPricingSettings, previewReprice, updatePricingSettings } from "@/lib/repricing";
import type { PricingSettingsLike } from "@/lib/pricing";

export async function getPricingSettingsAction() {
  return getPricingSettings();
}

export async function updatePricingSettingsAction(patch: Partial<PricingSettingsLike>) {
  updatePricingSettings(patch);
  revalidatePath("/pricing");
}

export async function previewRepriceAction(includeStale: boolean) {
  return previewReprice(includeStale);
}

export async function applyRepriceAction(itemIds: number[]) {
  const result = applyReprice(itemIds);
  revalidatePath("/inventory");
  revalidatePath("/pricing");
  return result;
}
