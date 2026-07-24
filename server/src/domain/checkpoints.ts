import { prisma } from '../db.js';
import { sendDriverMessage } from './messagingService.js';
import { evaluateAssignmentRisk } from './riskEngine.js';
import { recomputeShipperState } from './shipperState.js';
import { DEFAULT_RISK_RULES } from './riskEngine.js';

const GRACE_PERIOD_MINUTES: Record<string, number> = {
  T24_RECONFIRM: 180,
  EVENING_READINESS: 240,
  PRE_DEPARTURE: 45,
};

/**
 * Adaptive checkpoint intensity: a proven driver-route relationship (an
 * established, non-trial ownership with a long streak, no recent material
 * change, and standard/important criticality) earns down to a single T-24
 * reconfirmation. Everything else gets the full sequence.
 */
export async function checkpointLevelForAssignment(assignmentId: string): Promise<'FULL' | 'EARNED_DOWN'> {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { routeOccurrence: { include: { route: true } } },
  });
  const route = assignment.routeOccurrence.route;

  if (route.criticality === 'CRITICAL' || route.criticality === 'STAT') return 'FULL';

  const ownership = await prisma.routeOwnership.findFirst({
    where: { routeId: route.id, driverId: assignment.driverId, status: 'ACTIVE' },
  });
  if (!ownership) return 'FULL';
  if (ownership.routeStreak < DEFAULT_RISK_RULES.earnedDownStreakWeeks) return 'FULL';
  if (ownership.checkpointLevel === 'FULL') return 'FULL';
  return 'EARNED_DOWN';
}

/** Schedules the T-24 / evening / pre-departure checkpoints for an accepted assignment. */
export async function scheduleCheckpointsForAssignment(assignmentId: string) {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { routeOccurrence: true },
  });
  const level = await checkpointLevelForAssignment(assignmentId);
  const start = assignment.routeOccurrence.scheduledStart;

  const toCreate: { type: string; at: Date }[] = [{ type: 'T24_RECONFIRM', at: new Date(start.getTime() - 24 * 3_600_000) }];
  if (level === 'FULL') {
    toCreate.push({ type: 'EVENING_READINESS', at: eveningBefore(start) });
    toCreate.push({ type: 'PRE_DEPARTURE', at: new Date(start.getTime() - 40 * 60_000) });
  }

  for (const cp of toCreate) {
    const existing = await prisma.checkpoint.findFirst({ where: { assignmentId, checkpointType: cp.type } });
    if (!existing) {
      await prisma.checkpoint.create({ data: { assignmentId, checkpointType: cp.type, scheduledAt: cp.at } });
    }
  }
  return { level, scheduled: toCreate.map((c) => c.type) };
}

function eveningBefore(start: Date): Date {
  const d = new Date(start);
  d.setDate(d.getDate() - 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

const CHECKPOINT_COPY: Record<string, string> = {
  T24_RECONFIRM: 'RoutePilot: Confirming your route tomorrow. Reply 1 to confirm, or use this link if plans changed:',
  EVENING_READINESS: 'RoutePilot: Quick readiness check for tomorrow’s route. Reply 1 if you’re all set:',
  PRE_DEPARTURE: 'RoutePilot: Are you on your way to your route? Reply 1 for yes, 2 running late, 3 problem, 4 cannot complete, or use this link:',
};

/** Sends any checkpoint whose scheduled time has arrived and hasn't been sent yet. */
export async function sendDueCheckpoints(now = new Date()) {
  const due = await prisma.checkpoint.findMany({
    where: { sentAt: null, scheduledAt: { lte: now } },
    include: { assignment: true },
  });
  let sent = 0;
  for (const cp of due) {
    if (['CANCELED', 'DECLINED', 'COMPLETED', 'EXPIRED'].includes(cp.assignment.status)) continue;
    const outcome = await sendDriverMessage({
      driverId: cp.assignment.driverId,
      assignmentId: cp.assignmentId,
      template: cp.checkpointType,
      bodyBuilder: (url) => `${CHECKPOINT_COPY[cp.checkpointType] ?? 'RoutePilot check-in:'} ${url}`,
    });
    if (outcome.sent) {
      await prisma.checkpoint.update({ where: { id: cp.id }, data: { sentAt: now } });
      if (cp.checkpointType === 'T24_RECONFIRM') {
        // T-24 status flips to CONFIRMED only on a YES response (handled in inbound), but
        // sending it starts the clock represented by t24Status remaining PENDING until then.
      }
      sent += 1;
    }
  }
  return { sent, evaluated: due.length };
}

/** Escalates checkpoints sent but not answered within their grace period. */
export async function escalateOverdueCheckpoints(now = new Date()) {
  const outstanding = await prisma.checkpoint.findMany({
    where: { sentAt: { not: null }, response: null, escalationStatus: 'NONE' },
    include: { assignment: true },
  });
  let escalated = 0;
  for (const cp of outstanding) {
    const grace = GRACE_PERIOD_MINUTES[cp.checkpointType] ?? 120;
    if (cp.sentAt && now.getTime() - cp.sentAt.getTime() >= grace * 60_000) {
      await prisma.checkpoint.update({ where: { id: cp.id }, data: { escalationStatus: 'ESCALATED' } });
      await evaluateAssignmentRisk(cp.assignmentId);
      await recomputeShipperState(cp.assignment.routeOccurrenceId);
      escalated += 1;
    }
  }
  return { escalated };
}

/** Applies a driver's T-24 confirmation response to the assignment's t24Status. */
export async function recordT24Response(checkpointId: string, response: 'YES' | 'LATE' | 'PROBLEM' | 'CANNOT_COMPLETE') {
  const cp = await prisma.checkpoint.findUniqueOrThrow({ where: { id: checkpointId } });
  await prisma.checkpoint.update({ where: { id: checkpointId }, data: { response, respondedAt: new Date() } });
  if (cp.checkpointType === 'T24_RECONFIRM' && response === 'YES') {
    await prisma.assignment.update({ where: { id: cp.assignmentId }, data: { t24Status: 'CONFIRMED', status: 'CONFIRMED_T24' } });
  }
  await evaluateAssignmentRisk(cp.assignmentId);
  const assignment = await prisma.assignment.findUniqueOrThrow({ where: { id: cp.assignmentId } });
  await recomputeShipperState(assignment.routeOccurrenceId);
}

/** Runs the full scheduling tick: send due checkpoints, then escalate overdue ones. Call on an interval. */
export async function runCheckpointTick() {
  const sendResult = await sendDueCheckpoints();
  const escalateResult = await escalateOverdueCheckpoints();
  return { ...sendResult, ...escalateResult };
}
