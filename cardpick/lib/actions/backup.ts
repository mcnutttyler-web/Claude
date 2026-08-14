"use server";

import { revalidatePath } from "next/cache";
import { snapshotDatabase, listSnapshots, restoreFromSnapshot } from "../backup";
import { getLateThresholdHours, setLateThresholdHours } from "../pick";

export async function manualBackupAction() {
  const path = snapshotDatabase("manual");
  revalidatePath("/settings");
  return path;
}

export async function listSnapshotsAction() {
  return listSnapshots();
}

export async function restoreAction(formData: FormData) {
  const confirmation = String(formData.get("confirmation") ?? "");
  const snapshotPath = String(formData.get("snapshotPath") ?? "");
  if (confirmation !== "RESTORE") {
    return { error: 'Type "RESTORE" to confirm.' };
  }
  restoreFromSnapshot(snapshotPath);
  revalidatePath("/", "layout");
  return { error: null };
}

export async function getLateThresholdAction() {
  return getLateThresholdHours();
}

export async function setLateThresholdAction(formData: FormData) {
  const hours = Number(formData.get("hours") ?? 24);
  setLateThresholdHours(hours);
  revalidatePath("/settings");
  revalidatePath("/pick");
}
