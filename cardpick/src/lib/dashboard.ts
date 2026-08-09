import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { order, inventoryItem, appSettings } from "@/db/schema";

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function isOrderLate(importedAt: string, thresholdHours: number, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - new Date(importedAt).getTime();
  return ageMs > thresholdHours * 60 * 60 * 1000;
}

export function getLateThresholdHours(): number {
  return db.select({ v: appSettings.lateOrderThresholdHours }).from(appSettings).get()?.v ?? 24;
}

export function getOldestUnpickedOrder(now: Date = new Date()) {
  const row = db
    .select()
    .from(order)
    .where(inArray(order.status, ["PENDING", "NEEDS_ATTENTION"]))
    .orderBy(asc(order.importedAt))
    .limit(1)
    .get();
  if (!row) return null;
  return {
    order: row,
    ageMs: now.getTime() - new Date(row.importedAt).getTime(),
    ageLabel: formatDuration(now.getTime() - new Date(row.importedAt).getTime()),
  };
}

export function getDashboardStats() {
  const now = new Date();
  const oldestUnpicked = getOldestUnpickedOrder(now);

  const counts = db
    .select({ status: order.status, c: sql<number>`count(*)` })
    .from(order)
    .groupBy(order.status)
    .all();
  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c.c]));

  const activeItemCount =
    db
      .select({ c: sql<number>`count(*)` })
      .from(inventoryItem)
      .where(eq(inventoryItem.status, "ACTIVE"))
      .get()?.c ?? 0;

  return {
    oldestUnpicked,
    ordersPending: countByStatus.PENDING ?? 0,
    ordersNeedsAttention: countByStatus.NEEDS_ATTENTION ?? 0,
    ordersReadyToPack: countByStatus.READY_TO_PACK ?? 0,
    activeItemCount,
  };
}
