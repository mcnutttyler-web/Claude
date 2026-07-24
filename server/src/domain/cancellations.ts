import { prisma } from '../db.js';
import { evaluateAssignmentRisk } from './riskEngine.js';
import { recomputeShipperState } from './shipperState.js';
import { updateStreakOnOccurrenceOutcome } from './ownership.js';
import { openRecoveryCase } from './recovery.js';
import { writeAudit } from './audit.js';

export async function recordCancellation(input: {
  assignmentId: string;
  classification: 'AVOIDABLE' | 'UNAVOIDABLE';
  category: 'ECONOMIC' | 'INFORMATIONAL' | 'LOGISTICAL' | 'BEHAVIORAL' | 'UNAVOIDABLE_EVENT';
  structuredReason: string;
  freeTextNote?: string;
  reportedBy?: string;
  selfReported?: boolean;
}) {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: input.assignmentId },
    include: { routeOccurrence: { include: { route: true, backupArrangements: true } } },
  });

  const minutesBeforeStart = Math.round((assignment.routeOccurrence.scheduledStart.getTime() - Date.now()) / 60_000);
  const backupAvailable = assignment.routeOccurrence.backupArrangements.some((b) => b.status === 'ACCEPTED');

  const event = await prisma.cancellationEvent.create({
    data: {
      assignmentId: input.assignmentId,
      classification: input.classification,
      category: input.category,
      structuredReason: input.structuredReason,
      freeTextNote: input.freeTextNote,
      minutesBeforeStart,
      reportedBy: input.reportedBy,
      selfReported: input.selfReported ?? false,
      backupAvailable,
      replacementNeeded: assignment.assignmentType !== 'BACKUP',
    },
  });

  await prisma.assignment.update({ where: { id: input.assignmentId }, data: { status: 'CANCELED' } });
  await evaluateAssignmentRisk(input.assignmentId);

  if (assignment.assignmentType === 'PRIMARY') {
    await updateStreakOnOccurrenceOutcome({
      routeId: assignment.routeOccurrence.routeId,
      driverId: assignment.driverId,
      outcome: input.classification === 'AVOIDABLE' ? 'AVOIDABLE_FAILURE' : 'UNAVOIDABLE_FAILURE',
    });
    await openRecoveryCase({
      routeOccurrenceId: assignment.routeOccurrenceId,
      originalAssignmentId: assignment.id,
      trigger: 'CANCELLATION',
    });
  }

  await recomputeShipperState(assignment.routeOccurrenceId);
  await writeAudit({
    actorId: input.reportedBy,
    entityType: 'Assignment',
    entityId: input.assignmentId,
    action: 'CANCELLATION_RECORDED',
    after: { classification: input.classification, category: input.category, structuredReason: input.structuredReason },
  });

  return event;
}

/** Finalizes an occurrence's outcome for reporting: on-time start, late, failed, or reassigned. */
export async function recordRouteOutcome(assignmentId: string, outcome: 'ON_TIME' | 'LATE' | 'FAILED' | 'REASSIGNED', shipperImpact?: string, customerVisibleExplanation?: string) {
  await prisma.cancellationEvent.updateMany({
    where: { assignmentId },
    data: { finalRouteOutcome: outcome, shipperImpact, customerVisibleExplanation },
  });
}
