"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { location } from "../db/schema";
import { previewBulkAssign, applyBulkAssign, reverseBulkAssign, type BulkAssignFilter } from "../bulk-assign";

export async function previewBulkAssignAction(filter: BulkAssignFilter) {
  return previewBulkAssign(filter);
}

export async function applyBulkAssignAction(filter: BulkAssignFilter, targetLocationId: number) {
  const result = applyBulkAssign(filter, targetLocationId);
  revalidatePath("/inventory");
  revalidatePath("/locations");
  return result;
}

export async function reverseBulkAssignAction(groupId: string) {
  const count = reverseBulkAssign(groupId);
  revalidatePath("/inventory");
  revalidatePath("/locations");
  return count;
}

export async function createLocationAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  const kind = String(formData.get("kind") ?? "GRANULAR") as "GRANULAR" | "LEGACY";
  if (!code) return;

  const existing = db.select().from(location).where(eq(location.code, code)).get();
  if (existing) {
    // Idempotent: re-submitting the same code (double click, retried
    // submission) is a no-op rather than a crash.
    revalidatePath("/locations");
    return;
  }

  const isLegacyByCode = /^(OLD-|BOX-)/i.test(code);
  db.insert(location)
    .values({
      code,
      kind: isLegacyByCode ? "LEGACY" : kind,
      active: true,
      maxSkus: kind === "GRANULAR" && !isLegacyByCode ? 60 : null,
      maxQuantity: kind === "GRANULAR" && !isLegacyByCode ? 300 : null,
    })
    .run();
  revalidatePath("/locations");
}

export async function deactivateLocationAction(id: number) {
  db.update(location).set({ active: false }).where(eq(location.id, id)).run();
  revalidatePath("/locations");
}
