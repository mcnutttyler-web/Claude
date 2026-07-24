import { prisma } from '../db.js';
import { fromJson, toJson } from './json.js';
import { sendDriverMessage } from './messagingService.js';
import { writeAudit } from './audit.js';
import { evaluateAssignmentRisk } from './riskEngine.js';
import { recomputeShipperState } from './shipperState.js';

interface RouteSnapshot {
  routeCode: string;
  routeName: string;
  pickupArea: string;
  scheduledStart: string;
  estimatedCompletion: string;
  estimatedMileage: number | null;
  estimatedStopCount: number | null;
  vehicleRequirements: unknown;
  equipmentRequirements: unknown;
  commodity: string | null;
  compensation: unknown;
  materialNotes: string | null;
  criticality: string;
}

function snapshotFromRoute(route: {
  routeCode: string;
  routeName: string;
  pickupArea: string;
  scheduledStart: string;
  estimatedCompletion: string;
  estimatedMileage: number | null;
  estimatedStopCount: number | null;
  vehicleRequirements: string;
  equipmentRequirements: string;
  commodity: string | null;
  compensation: string;
  materialNotes: string | null;
  criticality: string;
}): RouteSnapshot {
  return {
    routeCode: route.routeCode,
    routeName: route.routeName,
    pickupArea: route.pickupArea,
    scheduledStart: route.scheduledStart,
    estimatedCompletion: route.estimatedCompletion,
    estimatedMileage: route.estimatedMileage,
    estimatedStopCount: route.estimatedStopCount,
    vehicleRequirements: fromJson(route.vehicleRequirements, []),
    equipmentRequirements: fromJson(route.equipmentRequirements, []),
    commodity: route.commodity,
    compensation: fromJson(route.compensation, {}),
    materialNotes: route.materialNotes,
    criticality: route.criticality,
  };
}

/** Creates version 1 of a route's full-disclosure detail snapshot at route creation time. */
export async function ensureInitialRouteVersion(routeId: string, createdBy?: string) {
  const route = await prisma.route.findUniqueOrThrow({ where: { id: routeId } });
  const existing = await prisma.routeDetailVersion.findFirst({ where: { routeId } });
  if (existing) return existing;
  return prisma.routeDetailVersion.create({
    data: { routeId, version: 1, snapshot: toJson(snapshotFromRoute(route)), createdBy },
  });
}

/**
 * Applies a material change to a route: bumps the version, snapshots it, and
 * flags every future-dated, not-yet-started assignment accepted on an older
 * version as requiring renewed acknowledgment. Original acceptance history
 * is preserved (never overwritten) via the Message/AuditEvent trail.
 */
export async function applyMaterialRouteChange(routeId: string, patch: Partial<RouteSnapshot>, createdBy?: string) {
  const route = await prisma.route.findUniqueOrThrow({ where: { id: routeId } });
  const nextVersion = route.activeVersionNumber + 1;
  const currentSnapshot = snapshotFromRoute(route);
  const newSnapshot = { ...currentSnapshot, ...patch };

  await prisma.$transaction(async (tx) => {
    await tx.route.update({ where: { id: routeId }, data: { activeVersionNumber: nextVersion } });
    await tx.routeDetailVersion.create({ data: { routeId, version: nextVersion, snapshot: toJson(newSnapshot), createdBy } });
  });

  await writeAudit({ actorId: createdBy, operatorId: route.operatorId, entityType: 'Route', entityId: routeId, action: 'MATERIAL_CHANGE', before: currentSnapshot, after: newSnapshot });

  const affected = await prisma.assignment.findMany({
    where: {
      routeOccurrence: { routeId, scheduledStart: { gt: new Date() } },
      status: { in: ['ACCEPTED', 'CONFIRMED_T24'] },
    },
    include: { driver: true, routeOccurrence: true },
  });

  for (const assignment of affected) {
    if ((assignment.acceptedDetailVersion ?? 0) >= nextVersion) continue;
    await prisma.assignment.update({ where: { id: assignment.id }, data: { status: 'ACK_REQUIRED' } });
    await sendDriverMessage({
      driverId: assignment.driverId,
      assignmentId: assignment.id,
      template: 'MATERIAL_CHANGE_REACK',
      bodyBuilder: (url) =>
        `RoutePilot: Route ${route.routeCode} details changed. Please review and re-confirm: ${url}`,
      // A pending route-detail change needs prompt attention; unlike routine
      // check-ins, it is not deferred to the driver's quiet hours.
      respectQuietHours: false,
    });
    await evaluateAssignmentRisk(assignment.id);
    await recomputeShipperState(assignment.routeOccurrenceId);
  }

  return { nextVersion, affectedCount: affected.length };
}

/** Sends the full-disclosure offer for a new primary/backup/replacement assignment. */
export async function offerAssignment(input: {
  routeOccurrenceId: string;
  driverId: string;
  assignmentType: 'PRIMARY' | 'BACKUP' | 'REPLACEMENT';
}) {
  await prisma.assignment.updateMany({
    where: { routeOccurrenceId: input.routeOccurrenceId, driverId: input.driverId, assignmentType: input.assignmentType, status: { notIn: ['CANCELED', 'DECLINED', 'EXPIRED'] } },
    data: { status: 'EXPIRED' },
  });

  const occurrence = await prisma.routeOccurrence.findUniqueOrThrow({ where: { id: input.routeOccurrenceId }, include: { route: true } });
  await ensureInitialRouteVersion(occurrence.routeId);

  const assignment = await prisma.assignment.create({
    data: {
      routeOccurrenceId: input.routeOccurrenceId,
      driverId: input.driverId,
      assignmentType: input.assignmentType,
      status: 'OFFERED',
    },
  });

  const checkpoint = await prisma.checkpoint.create({
    data: { assignmentId: assignment.id, checkpointType: 'FULL_DISCLOSURE', scheduledAt: new Date() },
  });

  const route = occurrence.route;
  const outcome = await sendDriverMessage({
    driverId: input.driverId,
    assignmentId: assignment.id,
    template: 'FULL_DISCLOSURE_OFFER',
    bodyBuilder: (url) =>
      `RoutePilot: New ${input.assignmentType.toLowerCase()} route offer from ${route.routeName} (${route.routeCode}), ${occurrence.serviceDate} ${route.scheduledStart}. Review full details and respond: ${url}`,
    // The route offer itself is not a routine check-in nudge, so it is not
    // deferred to quiet hours the way T-24/evening/pre-departure prompts are.
    respectQuietHours: false,
  });

  await prisma.checkpoint.update({ where: { id: checkpoint.id }, data: { sentAt: outcome.sent ? new Date() : undefined } });
  await evaluateAssignmentRisk(assignment.id);
  await recomputeShipperState(input.routeOccurrenceId);

  return assignment;
}

export const FULL_DISCLOSURE_ACCEPT_LANGUAGE = 'I reviewed the route details and want this route.';

/** Records driver acceptance of the currently offered/ack-required route details. */
export async function recordAcceptance(assignmentId: string, input: { channel: string }) {
  const assignment = await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { routeOccurrence: { include: { route: true } }, checkpoints: true } });
  const route = assignment.routeOccurrence.route;
  const offerCheckpoint = assignment.checkpoints.find((c) => c.checkpointType === 'FULL_DISCLOSURE');
  const responseTimeSeconds = offerCheckpoint?.sentAt ? Math.round((Date.now() - offerCheckpoint.sentAt.getTime()) / 1000) : null;

  const updated = await prisma.assignment.update({
    where: { id: assignmentId },
    data: {
      status: 'ACCEPTED',
      acceptedAt: new Date(),
      acceptedDetailVersion: route.activeVersionNumber,
      acceptanceChannel: input.channel,
      responseTimeSeconds,
    },
  });

  if (offerCheckpoint) {
    await prisma.checkpoint.update({ where: { id: offerCheckpoint.id }, data: { response: 'YES', respondedAt: new Date() } });
  }

  await writeAudit({ operatorId: route.operatorId, entityType: 'Assignment', entityId: assignmentId, action: 'ACCEPTED', after: { detailVersion: route.activeVersionNumber, channel: input.channel } });
  await evaluateAssignmentRisk(assignmentId);
  await recomputeShipperState(assignment.routeOccurrenceId);
  return updated;
}

export async function recordDecline(assignmentId: string, reason?: string) {
  const assignment = await prisma.assignment.update({ where: { id: assignmentId }, data: { status: 'DECLINED' } });
  await writeAudit({ entityType: 'Assignment', entityId: assignmentId, action: 'DECLINED', after: { reason } });
  await evaluateAssignmentRisk(assignmentId);
  await recomputeShipperState(assignment.routeOccurrenceId);
  return assignment;
}
