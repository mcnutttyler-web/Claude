import { prisma } from '../db.js';
import { toJson } from './json.js';
import { offerAssignment } from './fullDisclosure.js';
import { recomputeShipperState } from './shipperState.js';
import { writeAudit } from './audit.js';

export async function openRecoveryCase(input: { routeOccurrenceId: string; originalAssignmentId: string; trigger: string; dispatcherOwnerId?: string }) {
  const existing = await prisma.recoveryCase.findFirst({
    where: { routeOccurrenceId: input.routeOccurrenceId, status: { notIn: ['RESOLVED', 'UNRESOLVED'] } },
  });
  if (existing) return existing;

  const recoveryCase = await prisma.recoveryCase.create({
    data: {
      routeOccurrenceId: input.routeOccurrenceId,
      originalAssignmentId: input.originalAssignmentId,
      trigger: input.trigger,
      status: 'OPEN',
      dispatcherOwnerId: input.dispatcherOwnerId,
    },
  });
  await prisma.routeOccurrence.update({ where: { id: input.routeOccurrenceId }, data: { status: 'AT_RISK' } });
  await recomputeShipperState(input.routeOccurrenceId);
  return recoveryCase;
}

export async function addRecoveryCandidate(recoveryCaseId: string, driverId: string, matchFactors: unknown) {
  return prisma.recoveryCandidate.create({
    data: { recoveryCaseId, driverId, matchFactors: toJson(matchFactors) },
  });
}

export async function updateCandidateStatus(candidateId: string, status: string) {
  return prisma.recoveryCandidate.update({
    where: { id: candidateId },
    data: { status, respondedAt: ['ACCEPTED', 'DECLINED', 'INTERESTED_FUTURE', 'UNAVAILABLE_TODAY', 'REQUESTED_DIFFERENT_COMP', 'UNREACHABLE'].includes(status) ? new Date() : undefined },
  });
}

/** Sources a replacement from an accepted recovery candidate; sends full disclosure and requires acceptance. */
export async function sourceReplacementFromCandidate(recoveryCaseId: string, candidateId: string) {
  const [recoveryCase, candidate] = await Promise.all([
    prisma.recoveryCase.findUniqueOrThrow({ where: { id: recoveryCaseId } }),
    prisma.recoveryCandidate.findUniqueOrThrow({ where: { id: candidateId } }),
  ]);

  const occurrence = await prisma.routeOccurrence.findUniqueOrThrow({ where: { id: recoveryCase.routeOccurrenceId } });
  if (occurrence.recoveryLocked) {
    throw new Error('Recovery already locked for this occurrence.');
  }
  await prisma.routeOccurrence.update({ where: { id: occurrence.id }, data: { recoveryLocked: true } });

  const offered = await offerAssignment({
    routeOccurrenceId: recoveryCase.routeOccurrenceId,
    driverId: candidate.driverId,
    assignmentType: 'REPLACEMENT',
  });
  const replacement = await prisma.assignment.update({ where: { id: offered.id }, data: { originalAssignmentId: recoveryCase.originalAssignmentId } });
  await prisma.recoveryCandidate.update({ where: { id: candidateId }, data: { status: 'ACCEPTED' } });
  await prisma.recoveryCase.update({ where: { id: recoveryCaseId }, data: { status: 'SOURCING', replacementAssignmentId: replacement.id } });

  await writeAudit({ entityType: 'RecoveryCase', entityId: recoveryCaseId, action: 'REPLACEMENT_SOURCED', after: { candidateId, replacementAssignmentId: replacement.id } });

  return replacement;
}

/** Called after a REPLACEMENT assignment's acceptance to close out its recovery case. */
export async function resolveRecoveryCaseIfReplacementAccepted(assignmentId: string) {
  const recoveryCase = await prisma.recoveryCase.findFirst({ where: { replacementAssignmentId: assignmentId } });
  if (!recoveryCase) return null;

  const resolvedAt = new Date();
  const recoveryDurationSeconds = Math.round((resolvedAt.getTime() - recoveryCase.openedAt.getTime()) / 1000);
  const updated = await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: {
      status: 'RESOLVED',
      resolvedAt,
      recoveryDurationSeconds,
      recoveryMethod: recoveryCase.backupArrangementId ? 'NAMED_BACKUP' : 'SOURCED_REPLACEMENT',
    },
  });
  await recomputeShipperState(recoveryCase.routeOccurrenceId);
  return updated;
}

export async function markRecoveryCaseUnresolved(recoveryCaseId: string) {
  const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({ where: { id: recoveryCaseId } });
  const resolvedAt = new Date();
  return prisma.recoveryCase.update({
    where: { id: recoveryCaseId },
    data: {
      status: 'UNRESOLVED',
      resolvedAt,
      recoveryDurationSeconds: Math.round((resolvedAt.getTime() - recoveryCase.openedAt.getTime()) / 1000),
    },
  });
}
