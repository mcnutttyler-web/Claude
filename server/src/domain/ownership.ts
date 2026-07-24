import { prisma } from '../db.js';
import { fromJson, toJson } from './json.js';
import { DEFAULT_RISK_RULES } from './riskEngine.js';

interface TimeOffEntry {
  start: string;
  end: string;
  reason: string;
}

export async function createRouteOwnership(input: {
  routeId: string;
  driverId: string;
  weekdays: number[];
  startDate: string;
  status?: string;
}) {
  return prisma.routeOwnership.create({
    data: {
      routeId: input.routeId,
      driverId: input.driverId,
      weekdays: toJson(input.weekdays),
      startDate: input.startDate,
      status: input.status ?? 'PROPOSED',
    },
  });
}

/** Planned time off never removes route ownership; it only marks the window and, optionally, who covers it. */
export async function addPlannedTimeOff(ownershipId: string, entry: TimeOffEntry) {
  const ownership = await prisma.routeOwnership.findUniqueOrThrow({ where: { id: ownershipId } });
  const existing = fromJson<TimeOffEntry[]>(ownership.plannedTimeOff, []);
  existing.push(entry);
  return prisma.routeOwnership.update({
    where: { id: ownershipId },
    data: { plannedTimeOff: toJson(existing) },
  });
}

export async function setTemporaryReplacement(ownershipId: string, input: { driverId: string; reason: string; expectedReturnDate: string }) {
  return prisma.routeOwnership.update({
    where: { id: ownershipId },
    data: {
      status: 'TEMP_COVERED',
      temporaryReplacementDriverId: input.driverId,
      temporaryReplacementReason: input.reason,
      temporaryReplacementReturnDate: input.expectedReturnDate,
    },
  });
}

export async function clearTemporaryReplacement(ownershipId: string) {
  return prisma.routeOwnership.update({
    where: { id: ownershipId },
    data: {
      status: 'ACTIVE',
      temporaryReplacementDriverId: null,
      temporaryReplacementReason: null,
      temporaryReplacementReturnDate: null,
    },
  });
}

/**
 * Updates a route owner's streak when an occurrence resolves. Avoidable
 * failures reset the streak (and drop the driver back to the full
 * checkpoint sequence); unavoidable events and completions do not erode it,
 * so a flu season never masks a real execution problem — but it also
 * doesn't get counted as proof of reliability.
 */
export async function updateStreakOnOccurrenceOutcome(input: {
  routeId: string;
  driverId: string;
  outcome: 'ORIGINAL_STARTED_ON_TIME' | 'AVOIDABLE_FAILURE' | 'UNAVOIDABLE_FAILURE';
}) {
  const ownership = await prisma.routeOwnership.findFirst({
    where: { routeId: input.routeId, driverId: input.driverId, status: { in: ['ACTIVE', 'TRIAL', 'TEMP_COVERED'] } },
  });
  if (!ownership) return null;

  let routeStreak = ownership.routeStreak;
  if (input.outcome === 'ORIGINAL_STARTED_ON_TIME') routeStreak += 1;
  if (input.outcome === 'AVOIDABLE_FAILURE') routeStreak = 0;

  const checkpointLevel = routeStreak >= DEFAULT_RISK_RULES.earnedDownStreakWeeks ? 'EARNED_DOWN' : 'FULL';

  return prisma.routeOwnership.update({
    where: { id: ownership.id },
    data: { routeStreak, checkpointLevel },
  });
}
