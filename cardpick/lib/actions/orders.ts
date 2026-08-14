"use server";

import { revalidatePath } from "next/cache";
import { startImport, previewImport, type StartImportResult, type PreviewResult } from "../import/inventory-import";
import { commitOrderImport } from "../import/order-import";
import type { FieldMapping } from "../import/mapping";
import * as pick from "../pick";
import { searchInventoryAction } from "./inventory";

export async function startOrderImportAction(formData: FormData): Promise<StartImportResult | { error: string }> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };
  const contents = await file.text();
  return startImport("ORDER", file.name, contents);
}

export async function previewOrderImportAction(batchId: number, mapping: FieldMapping): Promise<PreviewResult> {
  return previewImport(batchId, "ORDER", mapping);
}

export async function commitOrderImportAction(batchId: number): Promise<Record<string, number>> {
  const result = commitOrderImport(batchId);
  revalidatePath("/orders");
  revalidatePath("/pick");
  revalidatePath("/");
  return { ...result };
}

export async function markPulledAction(lineId: number, quantityPicked?: number) {
  pick.markPulled(lineId, quantityPicked);
  revalidatePath("/pick");
  revalidatePath("/orders");
}

export async function markShortAction(lineId: number, reason: string, correctedQuantity?: number) {
  pick.markShort(lineId, { reason, correctedQuantity });
  revalidatePath("/pick");
  revalidatePath("/orders");
}

export async function resolveShortAction(lineId: number, resolution: pick.ShortResolution, reducedQuantity?: number) {
  pick.resolveShort(lineId, resolution, reducedQuantity);
  revalidatePath("/pick");
  revalidatePath("/orders");
}

export async function resolveOrderLineMatchAction(lineId: number, inventoryItemId: number) {
  pick.resolveOrderLineMatch(lineId, inventoryItemId);
  revalidatePath("/pick");
  revalidatePath("/orders");
}

export async function confirmFulfillmentAction(orderId: number) {
  const result = pick.confirmFulfillment(orderId);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  revalidatePath("/");
  return result;
}

export async function reverseFulfillmentAction(historyGroupId: string) {
  const count = pick.reverseFulfillment(historyGroupId);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  return count;
}

export async function searchInventoryForMatchAction(term: string) {
  return searchInventoryAction(term);
}
