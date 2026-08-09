"use server";

import { revalidatePath } from "next/cache";
import { applyBulkAssign, previewBulkAssign, type BulkAssignFilter } from "@/lib/bulkAssign";

export async function previewBulkAssignAction(filter: BulkAssignFilter) {
  return previewBulkAssign(filter);
}

export async function applyBulkAssignAction(filter: BulkAssignFilter, targetLocationId: number) {
  const result = applyBulkAssign(filter, targetLocationId);
  revalidatePath("/inventory");
  revalidatePath("/locations");
  return result;
}
