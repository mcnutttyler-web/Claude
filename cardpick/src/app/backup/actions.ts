"use server";

import { revalidatePath } from "next/cache";
import { listBackups, snapshot, restoreFromBackup } from "@/db/backup";

export async function listBackupsAction() {
  return listBackups();
}

export async function createManualBackupAction() {
  const path = snapshot("manual");
  revalidatePath("/backup");
  return { path };
}

export async function restoreBackupAction(name: string, confirmation: string) {
  if (confirmation !== "RESTORE") {
    throw new Error('Type "RESTORE" to confirm.');
  }
  const result = restoreFromBackup(name);
  revalidatePath("/");
  return result;
}
