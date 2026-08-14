"use server";

import { revalidatePath } from "next/cache";
import { startScan, commitScan, type StartScanResult, type CommitScanInput, type CommitScanResult } from "../recognition/scan";
import { VisionConfigError, VisionApiError } from "../recognition/vision";

export async function startScanAction(formData: FormData): Promise<StartScanResult | { error: string }> {
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return { error: "Take or choose a photo first." };

  const mediaType = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    return await startScan(bytes, mediaType);
  } catch (err) {
    if (err instanceof VisionConfigError) return { error: err.message };
    if (err instanceof VisionApiError) return { error: `Card recognition failed: ${err.message}` };
    return { error: err instanceof Error ? err.message : "Card recognition failed." };
  }
}

export async function commitScanAction(input: CommitScanInput): Promise<CommitScanResult | { error: string }> {
  try {
    const result = commitScan(input);
    revalidatePath("/inventory");
    revalidatePath("/");
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save this scan." };
  }
}
