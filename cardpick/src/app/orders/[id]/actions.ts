"use server";

import { revalidatePath } from "next/cache";
import {
  confirmFulfillment,
  markLinePulled,
  markLineShort,
  resolveShortLine,
  reverseFulfillment,
  type ShortResolution,
} from "@/lib/pickMode";

export async function markLinePulledAction(orderId: number, lineId: number) {
  markLinePulled(lineId);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/");
}

export async function markLineShortAction(
  orderId: number,
  lineId: number,
  reason: string,
  correctQuantityTo?: number,
) {
  markLineShort({ lineId, reason, correctQuantityTo });
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
}

export async function resolveShortLineAction(
  orderId: number,
  lineId: number,
  resolution: ShortResolution,
  newQuantity?: number,
) {
  resolveShortLine(lineId, resolution, { newQuantity });
  revalidatePath(`/orders/${orderId}`);
}

export async function confirmFulfillmentAction(orderId: number) {
  const result = confirmFulfillment(orderId);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
  return result;
}

export async function reverseFulfillmentAction(orderId: number, batchGroupId: string) {
  reverseFulfillment(batchGroupId);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inventory");
}
