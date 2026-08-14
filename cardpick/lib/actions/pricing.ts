"use server";

import { revalidatePath } from "next/cache";
import {
  getPricingSettings,
  savePricingSettings,
  previewReprice,
  applyReprice,
  type PricingSettings,
} from "../pricing";

export async function getPricingSettingsAction(): Promise<PricingSettings> {
  return getPricingSettings();
}

export async function savePricingSettingsAction(formData: FormData) {
  const pct = (name: string) => Number(formData.get(name) ?? 0) / 100;
  savePricingSettings({
    flatFloorCents: Math.round(Number(formData.get("flatFloor") ?? 0.49) * 100),
    p1: pct("p1"),
    p2: pct("p2"),
    p3: pct("p3"),
    roundingMode: String(formData.get("roundingMode") ?? "up_to_x9") as PricingSettings["roundingMode"],
    hardFloorCents: Math.round(Number(formData.get("hardFloor") ?? 0.49) * 100),
    stalenessDays: Number(formData.get("stalenessDays") ?? 30),
  });
  revalidatePath("/pricing");
}

export async function previewRepriceAction(itemIds?: number[]) {
  return previewReprice(itemIds);
}

export async function applyRepriceAction(itemIds: number[], overrideStaleness: boolean) {
  const result = applyReprice(itemIds, { overrideStaleness });
  revalidatePath("/inventory");
  revalidatePath("/pricing");
  return result;
}
