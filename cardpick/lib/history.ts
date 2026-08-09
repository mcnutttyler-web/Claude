import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { history } from "./db/schema";

export function newGroupId(): string {
  return randomUUID();
}

export function recordHistory(entry: {
  entityType: string;
  entityId: number;
  action: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  groupId?: string;
}): number {
  const result = db
    .insert(history)
    .values({
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      reason: entry.reason ?? null,
      beforeJson: entry.before !== undefined ? JSON.stringify(entry.before) : null,
      afterJson: entry.after !== undefined ? JSON.stringify(entry.after) : null,
      groupId: entry.groupId ?? null,
    })
    .run();
  return Number(result.lastInsertRowid);
}

export function markReversed(historyId: number) {
  db.update(history).set({ reversed: true }).where(eq(history.id, historyId)).run();
}
