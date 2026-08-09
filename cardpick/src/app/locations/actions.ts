"use server";

import { revalidatePath } from "next/cache";
import { createLocation, updateLocation, type CreateLocationInput } from "@/lib/locations";

export async function createLocationAction(input: CreateLocationInput) {
  const id = createLocation(input);
  revalidatePath("/locations");
  return { id };
}

export async function toggleLocationActiveAction(id: number, active: boolean) {
  updateLocation(id, { active });
  revalidatePath("/locations");
}
