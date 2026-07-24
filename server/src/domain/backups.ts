import { prisma } from '../db.js';
import { toJson } from './json.js';
import { sendDriverMessage } from './messagingService.js';
import { writeAudit } from './audit.js';
import { offerAssignment, recordAcceptance } from './fullDisclosure.js';
import { recomputeShipperState } from './shipperState.js';
import { evaluateAssignmentRisk } from './riskEngine.js';

export async function createBackupOffer(input: {
  routeOccurrenceId: string;
  driverId: string;
  arrangementType: string;
  availabilityWindow: unknown;
  activationDeadline: Date;
  incentive: unknown;
}) {
  const arrangement = await prisma.backupArrangement.create({
    data: {
      routeOccurrenceId: input.routeOccurrenceId,
      driverId: input.driverId,
      arrangementType: input.arrangementType,
      availabilityWindow: toJson(input.availabilityWindow),
      activationDeadline: input.activationDeadline,
      incentive: toJson(input.incentive),
    },
  });

  const occurrence = await prisma.routeOccurrence.findUniqueOrThrow({ where: { id: input.routeOccurrenceId }, include: { route: true } });
  const outcome = await sendDriverMessage({
    driverId: input.driverId,
    template: 'BACKUP_OFFER',
    bodyBuilder: (url) =>
      `RoutePilot: Backup opportunity for ${occurrence.route.routeName} (${occurrence.route.routeCode}) on ${occurrence.serviceDate}. Review and respond: ${url}`,
    respectQuietHours: false,
  });
  await prisma.backupArrangement.update({ where: { id: arrangement.id }, data: { sentAt: outcome.sent ? new Date() : null } });
  await recomputeShipperState(input.routeOccurrenceId);
  return arrangement;
}

export async function markBackupViewed(backupArrangementId: string) {
  const b = await prisma.backupArrangement.findUniqueOrThrow({ where: { id: backupArrangementId } });
  if (b.status === 'OFFERED') {
    await prisma.backupArrangement.update({ where: { id: backupArrangementId }, data: { status: 'VIEWED', openedAt: new Date() } });
  }
}

export async function respondToBackupOffer(
  backupArrangementId: string,
  response: 'ACCEPTED' | 'DECLINED' | 'INTERESTED_FUTURE' | 'UNAVAILABLE_TODAY',
) {
  const arrangement = await prisma.backupArrangement.update({
    where: { id: backupArrangementId },
    data: { status: response, respondedAt: new Date() },
  });
  await recomputeShipperState(arrangement.routeOccurrenceId);
  return arrangement;
}

/**
 * One-action backup activation. Steps 1-2 (validate + lock) run inside a
 * transaction so two dispatchers racing to activate the same occurrence
 * cannot both succeed. The original assignment is never deleted or
 * overwritten; a new REPLACEMENT assignment is created and carries its own
 * full-disclosure acceptance flow.
 */
export async function activateBackup(input: { routeOccurrenceId: string; backupArrangementId: string; dispatcherId?: string; reason: string }) {
  const { occurrence, backup, recoveryCase, originalAssignmentId } = await prisma.$transaction(async (tx) => {
    const occ = await tx.routeOccurrence.findUniqueOrThrow({
      where: { id: input.routeOccurrenceId },
      include: { assignments: true },
    });
    if (occ.recoveryLocked) {
      throw new Error('Recovery already locked for this occurrence; activation refused to prevent duplicates.');
    }
    const primary = occ.assignments.find((a) => a.assignmentType === 'PRIMARY');
    if (primary && ['IN_PROGRESS', 'COMPLETED'].includes(primary.status)) {
      throw new Error('Route no longer requires recovery: original driver is already underway or completed.');
    }
    const b = await tx.backupArrangement.findUniqueOrThrow({ where: { id: input.backupArrangementId } });
    if (b.status === 'ACTIVATED') {
      throw new Error('This backup arrangement has already been activated.');
    }

    await tx.routeOccurrence.update({ where: { id: input.routeOccurrenceId }, data: { recoveryLocked: true, status: 'AT_RISK' } });
    const updatedBackup = await tx.backupArrangement.update({ where: { id: input.backupArrangementId }, data: { status: 'ACTIVATED' } });

    let recCase = await tx.recoveryCase.findFirst({
      where: { routeOccurrenceId: input.routeOccurrenceId, status: { notIn: ['RESOLVED', 'UNRESOLVED'] } },
    });
    if (!recCase) {
      recCase = await tx.recoveryCase.create({
        data: {
          routeOccurrenceId: input.routeOccurrenceId,
          originalAssignmentId: primary?.id ?? '',
          trigger: 'BACKUP_ACTIVATION',
          status: 'BACKUP_ACTIVATED',
          dispatcherOwnerId: input.dispatcherId,
          backupArrangementId: input.backupArrangementId,
        },
      });
    } else {
      recCase = await tx.recoveryCase.update({
        where: { id: recCase.id },
        data: { status: 'BACKUP_ACTIVATED', backupArrangementId: input.backupArrangementId, dispatcherOwnerId: input.dispatcherId },
      });
    }

    return { occurrence: occ, backup: updatedBackup, recoveryCase: recCase, originalAssignmentId: primary?.id };
  });

  // Post-commit side effects: create the replacement assignment (sends SMS), preserve the
  // original assignment untouched, and notify the original driver.
  const offered = await offerAssignment({
    routeOccurrenceId: input.routeOccurrenceId,
    driverId: backup.driverId,
    assignmentType: 'REPLACEMENT',
  });
  const replacement = await prisma.assignment.update({ where: { id: offered.id }, data: { originalAssignmentId } });

  await prisma.recoveryCase.update({ where: { id: recoveryCase.id }, data: { replacementAssignmentId: replacement.id } });

  if (originalAssignmentId) {
    const original = await prisma.assignment.findUnique({ where: { id: originalAssignmentId } });
    if (original) {
      await sendDriverMessage({
        driverId: original.driverId,
        assignmentId: original.id,
        template: 'BACKUP_ACTIVATED_NOTICE',
        bodyBuilder: () => `RoutePilot: Your backup has been activated to cover route ${occurrence.id}. Reason: ${input.reason}.`,
        respectQuietHours: false,
      });
    }
  }

  await writeAudit({
    actorId: input.dispatcherId,
    entityType: 'RouteOccurrence',
    entityId: input.routeOccurrenceId,
    action: 'BACKUP_ACTIVATED',
    after: { backupArrangementId: input.backupArrangementId, replacementAssignmentId: replacement.id, reason: input.reason },
  });

  await evaluateAssignmentRisk(replacement.id);
  await recomputeShipperState(input.routeOccurrenceId);

  return { replacementAssignment: replacement, recoveryCase };
}

// Re-exported for API routes that let a replacement driver accept their offer.
export { recordAcceptance as recordReplacementAcceptance };
