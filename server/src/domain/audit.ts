import { prisma } from '../db.js';
import { toJson } from './json.js';

export async function writeAudit(input: {
  actorId?: string | null;
  operatorId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      operatorId: input.operatorId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeState: input.before !== undefined ? toJson(input.before) : null,
      afterState: input.after !== undefined ? toJson(input.after) : null,
    },
  });
}
