import { Router } from 'express';
import { prisma } from '../db.js';
import { verifySecureLink } from '../auth/jwt.js';
import { fromJson } from '../domain/json.js';
import { recordAcceptance, recordDecline } from '../domain/fullDisclosure.js';
import { recordT24Response } from '../domain/checkpoints.js';
import { respondToBackupOffer, markBackupViewed } from '../domain/backups.js';
import { resolveRecoveryCaseIfReplacementAccepted } from '../domain/recovery.js';
import { prisma as db } from '../db.js';

export const driverRouter = Router();

const OFFER_TEMPLATES = new Set(['FULL_DISCLOSURE_OFFER', 'MATERIAL_CHANGE_REACK']);
const CHECKPOINT_TEMPLATES = new Set(['T24_RECONFIRM', 'EVENING_READINESS', 'PRE_DEPARTURE']);

async function resolveLink(token: string) {
  const payload = verifySecureLink(token);
  const message = await prisma.message.findUnique({ where: { id: payload.messageId } });
  if (!message) throw new Error('Link not found');
  if (message.secureTokenExpiresAt && message.secureTokenExpiresAt < new Date()) {
    return { expired: true as const, message, driverId: payload.driverId };
  }
  return { expired: false as const, message, driverId: payload.driverId };
}

driverRouter.get('/link/:token', async (req, res) => {
  try {
    const { expired, message, driverId } = await resolveLink(req.params.token);
    const driver = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    if (expired) return res.status(410).json({ error: 'This link has expired. Contact your dispatcher for an updated link.' });

    // Driver-facing vocabulary only: never expose risk tier, cancellation probability,
    // internal score, negative classification, or operator-private notes.
    const base = {
      driverName: driver.name,
      routeStreakStanding: 'Standard check-ins',
    };

    if (message.assignmentId && (OFFER_TEMPLATES.has(message.template) || message.template === 'BACKUP_ACTIVATED_NOTICE')) {
      const assignment = await prisma.assignment.findUniqueOrThrow({
        where: { id: message.assignmentId },
        include: { routeOccurrence: { include: { route: true } } },
      });
      const route = assignment.routeOccurrence.route;
      const versionRow = await prisma.routeDetailVersion.findFirst({
        where: { routeId: route.id, version: route.activeVersionNumber },
      });
      const snapshot = fromJson<Record<string, unknown>>(versionRow?.snapshot ?? null, {});
      const ownership = await prisma.routeOwnership.findFirst({ where: { routeId: route.id, driverId } });

      return res.json({
        ...base,
        kind: 'ROUTE_OFFER',
        assignmentId: assignment.id,
        assignmentType: assignment.assignmentType,
        assignmentStatus: assignment.status,
        acceptLanguage: 'I reviewed the route details and want this route.',
        routeStreak: ownership?.routeStreak ?? 0,
        offer: {
          operatorName: (await prisma.operatorOrganization.findUnique({ where: { id: route.operatorId } }))?.name,
          routeCode: route.routeCode,
          serviceDate: assignment.routeOccurrence.serviceDate,
          startTime: route.scheduledStart,
          estimatedEndTime: route.estimatedCompletion,
          pickupArea: route.pickupArea,
          estimatedMileage: route.estimatedMileage,
          stopCount: route.estimatedStopCount,
          vehicleRequirement: fromJson(route.vehicleRequirements, []),
          equipmentRequirement: fromJson(route.equipmentRequirements, []),
          commodity: route.commodity,
          compensation: fromJson(route.compensation, {}),
          materialNotes: route.materialNotes,
          isBackupOrPrimary: assignment.assignmentType,
          dispatcherContact: 'Reply to this message or use the link provided by your operator.',
          detailVersion: route.activeVersionNumber,
          snapshot,
        },
      });
    }

    if (message.assignmentId && CHECKPOINT_TEMPLATES.has(message.template)) {
      const checkpoint = await prisma.checkpoint.findFirst({
        where: { assignmentId: message.assignmentId, checkpointType: message.template, response: null },
        orderBy: { scheduledAt: 'desc' },
      });
      return res.json({ ...base, kind: 'CHECKPOINT', checkpointId: checkpoint?.id, checkpointType: message.template });
    }

    if (message.template === 'BACKUP_OFFER') {
      const backup = await prisma.backupArrangement.findFirst({ where: { driverId, status: { in: ['OFFERED', 'VIEWED'] } }, orderBy: { createdAt: 'desc' } });
      if (backup) await markBackupViewed(backup.id);
      const occurrence = backup ? await prisma.routeOccurrence.findUnique({ where: { id: backup.routeOccurrenceId }, include: { route: true } }) : null;
      return res.json({
        ...base,
        kind: 'BACKUP_OFFER',
        backupArrangementId: backup?.id,
        offer: backup && occurrence
          ? {
              routeCode: occurrence.route.routeCode,
              serviceDate: occurrence.serviceDate,
              availabilityWindow: fromJson(backup.availabilityWindow, {}),
              activationDeadline: backup.activationDeadline,
              incentive: fromJson(backup.incentive, {}),
            }
          : null,
      });
    }

    res.json({ ...base, kind: 'INFO', message: 'No action needed.' });
  } catch {
    res.status(400).json({ error: 'Invalid or expired link' });
  }
});

driverRouter.post('/link/:token/respond', async (req, res) => {
  try {
    const { expired, message, driverId } = await resolveLink(req.params.token);
    if (expired) return res.status(410).json({ error: 'This link has expired.' });
    const { action } = req.body as { action: string };

    if (message.assignmentId && (OFFER_TEMPLATES.has(message.template) || message.template === 'BACKUP_ACTIVATED_NOTICE')) {
      if (action === 'ACCEPT') {
        const assignment = await recordAcceptance(message.assignmentId, { channel: 'SECURE_LINK' });
        if (assignment.assignmentType === 'REPLACEMENT') {
          await resolveRecoveryCaseIfReplacementAccepted(assignment.id);
        }
        return res.json({ ok: true, status: assignment.status });
      }
      if (action === 'DECLINE') {
        const assignment = await recordDecline(message.assignmentId, req.body?.reason);
        return res.json({ ok: true, status: assignment.status });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    if (message.assignmentId && CHECKPOINT_TEMPLATES.has(message.template)) {
      const checkpoint = await db.checkpoint.findFirst({
        where: { assignmentId: message.assignmentId, checkpointType: message.template, response: null },
        orderBy: { scheduledAt: 'desc' },
      });
      if (!checkpoint) return res.status(404).json({ error: 'No open checkpoint' });
      const responseMap: Record<string, 'YES' | 'LATE' | 'PROBLEM' | 'CANNOT_COMPLETE'> = { ON_MY_WAY: 'YES', RUNNING_LATE: 'LATE', PROBLEM: 'PROBLEM', CANNOT_COMPLETE: 'CANNOT_COMPLETE' };
      const response = responseMap[action];
      if (!response) return res.status(400).json({ error: 'Unknown action' });
      await recordT24Response(checkpoint.id, response);
      return res.json({ ok: true });
    }

    if (message.template === 'BACKUP_OFFER') {
      const backup = await prisma.backupArrangement.findFirst({ where: { driverId, status: { in: ['OFFERED', 'VIEWED'] } }, orderBy: { createdAt: 'desc' } });
      if (!backup) return res.status(404).json({ error: 'No open backup offer' });
      const map: Record<string, 'ACCEPTED' | 'DECLINED' | 'INTERESTED_FUTURE' | 'UNAVAILABLE_TODAY'> = {
        ACCEPT: 'ACCEPTED',
        DECLINE: 'DECLINED',
        INTERESTED_FUTURE: 'INTERESTED_FUTURE',
        UNAVAILABLE_TODAY: 'UNAVAILABLE_TODAY',
      };
      const response = map[action];
      if (!response) return res.status(400).json({ error: 'Unknown action' });
      const arrangement = await respondToBackupOffer(backup.id, response);
      return res.json({ ok: true, status: arrangement.status });
    }

    res.status(400).json({ error: 'No action available for this link' });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request' });
  }
});
