import { prisma } from '../db.js';
import type { ShipperVisibleStateT } from './enums.js';

const NEXT_MILESTONE: Record<ShipperVisibleStateT, string> = {
  OFFER_PENDING: 'Awaiting driver acceptance',
  DRIVER_ACCEPTED: 'T-24 reconfirmation',
  COMMITTED_T24: 'Ready for pickup',
  BACKUP_PREPARED: 'Ready for pickup',
  INTERVENTION_UNDERWAY: 'Coverage confirmation',
  REPLACEMENT_SECURED: 'Ready for pickup',
  READY_FOR_PICKUP: 'Pickup',
};

/**
 * Maps internal operator state (assignments, checkpoints, recovery cases) to
 * the shipper-safe commitment-state vocabulary. Never derives from, or
 * exposes, the internal commitment-risk tier or raw driver data.
 */
export async function recomputeShipperState(routeOccurrenceId: string): Promise<void> {
  const occurrence = await prisma.routeOccurrence.findUniqueOrThrow({
    where: { id: routeOccurrenceId },
    include: {
      assignments: { orderBy: { createdAt: 'desc' } },
      backupArrangements: true,
      recoveryCases: { orderBy: { openedAt: 'desc' } },
    },
  });

  const primary = occurrence.assignments.find((a) => a.assignmentType === 'PRIMARY' && a.status !== 'CANCELED' && a.status !== 'DECLINED')
    ?? occurrence.assignments.find((a) => a.assignmentType === 'PRIMARY');
  const replacement = occurrence.assignments.find((a) => a.assignmentType === 'REPLACEMENT');
  const openCase = occurrence.recoveryCases.find((c) => !['RESOLVED', 'UNRESOLVED'].includes(c.status));
  const backupAccepted = occurrence.backupArrangements.find((b) => b.status === 'ACCEPTED');

  let state: ShipperVisibleStateT = 'OFFER_PENDING';
  let stateReason = 'Driver has not yet responded to the route offer.';
  let shipperActionRequired = false;

  if (openCase) {
    if (openCase.status === 'REPLACEMENT_SECURED' && replacement) {
      state = 'REPLACEMENT_SECURED';
      stateReason = 'A replacement driver has accepted this route.';
    } else {
      state = 'INTERVENTION_UNDERWAY';
      stateReason = 'The operator is actively resolving a coverage concern for this route.';
    }
  } else if (replacement && (replacement.status === 'IN_PROGRESS' || replacement.status === 'COMPLETED')) {
    state = 'READY_FOR_PICKUP';
    stateReason = 'Coverage is secured and the route is proceeding.';
  } else if (primary && (primary.status === 'IN_PROGRESS' || primary.status === 'COMPLETED')) {
    state = 'READY_FOR_PICKUP';
    stateReason = 'The driver is underway or has completed the route.';
  } else if (backupAccepted && primary?.t24Status === 'CONFIRMED') {
    state = 'BACKUP_PREPARED';
    stateReason = 'A qualified backup has accepted the defined backup arrangement.';
  } else if (primary?.t24Status === 'CONFIRMED') {
    state = 'COMMITTED_T24';
    stateReason = 'The driver reconfirmed within the required window.';
  } else if (primary && ['ACCEPTED', 'ACK_REQUIRED', 'CONFIRMED_T24'].includes(primary.status)) {
    state = 'DRIVER_ACCEPTED';
    stateReason = 'The driver reviewed and accepted the current route details.';
  } else {
    state = 'OFFER_PENDING';
    stateReason = 'Driver has not yet responded to the route offer.';
  }

  await prisma.shipperCommitmentStatus.upsert({
    where: { routeOccurrenceId },
    create: {
      routeOccurrenceId,
      visibleState: state,
      stateReason,
      nextMilestone: NEXT_MILESTONE[state],
      shipperActionRequired,
    },
    update: {
      visibleState: state,
      stateReason,
      lastUpdated: new Date(),
      nextMilestone: NEXT_MILESTONE[state],
      shipperActionRequired,
    },
  });
}
