"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

export async function getAppSettingsAction() {
  return db.select().from(appSettings).get()!;
}

export async function updateLateThresholdAction(hours: number) {
  const settings = db.select().from(appSettings).get()!;
  db.update(appSettings)
    .set({ lateOrderThresholdHours: hours })
    .where(eq(appSettings.id, settings.id))
    .run();
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/orders");
}
