"use server";

import { revalidatePath } from "next/cache";
import { startImport, previewImport, type StartImportResult } from "../import/inventory-import";
import type { FieldMapping } from "../import/mapping";
import { getReconcileDiff, applyReconcileDecisions, type ReconcileDecision } from "../reconcile";

export async function startReconcileImportAction(formData: FormData): Promise<StartImportResult | { error: string }> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a CSV file first." };
  const contents = await file.text();
  return startImport("RECONCILE", file.name, contents);
}

export async function previewReconcileAction(batchId: number, mapping: FieldMapping) {
  previewImport(batchId, "RECONCILE", mapping);
  return getReconcileDiff(batchId);
}

export async function applyReconcileAction(batchId: number, decisions: ReconcileDecision[]) {
  const result = applyReconcileDecisions(batchId, decisions);
  revalidatePath("/inventory");
  revalidatePath("/reconcile");
  return result;
}
