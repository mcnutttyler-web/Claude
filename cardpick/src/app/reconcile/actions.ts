"use server";

import { revalidatePath } from "next/cache";
import { analyzeReconcile, applyReconcile, type ReconcileAcceptance } from "@/lib/reconcile";
import type { ColumnMap } from "@/lib/mapping";

export async function analyzeReconcileAction(fileContent: string, columnMap: ColumnMap) {
  return analyzeReconcile(fileContent, columnMap);
}

export async function applyReconcileAction(acceptances: ReconcileAcceptance[]) {
  const result = applyReconcile(acceptances);
  revalidatePath("/inventory");
  return result;
}
