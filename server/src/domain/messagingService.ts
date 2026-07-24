import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { getSmsProvider } from '../messaging/index.js';
import { canSendAutomatedMessage, classifyInbound, isWithinQuietHours } from '../messaging/consent.js';
import { signSecureLink } from '../auth/jwt.js';
import { writeAudit } from './audit.js';
import { evaluateAssignmentRisk } from './riskEngine.js';
import { recomputeShipperState } from './shipperState.js';

const SECURE_LINK_TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days

export type SendOutcome =
  | { sent: true; messageId: string }
  | { sent: false; reason: 'OPTED_OUT' | 'QUIET_HOURS' | 'NO_CONSENT' };

/**
 * Sends an automated, driver-facing checkpoint/offer message, enforcing
 * consent, opt-out, and quiet-hour rules. A secure, expiring link is always
 * embedded so the driver can respond without a native app.
 */
export async function sendDriverMessage(input: {
  driverId: string;
  assignmentId?: string | null;
  template: string;
  bodyBuilder: (secureUrl: string) => string;
  respectQuietHours?: boolean;
}): Promise<SendOutcome> {
  const driver = await prisma.driver.findUniqueOrThrow({ where: { id: input.driverId } });

  if (driver.smsConsentStatus === 'OPTED_OUT' || driver.optOutAt) {
    return { sent: false, reason: 'OPTED_OUT' };
  }
  if (driver.smsConsentStatus !== 'OPTED_IN') {
    return { sent: false, reason: 'NO_CONSENT' };
  }
  if (input.respectQuietHours !== false && isWithinQuietHours(driver, new Date())) {
    return { sent: false, reason: 'QUIET_HOURS' };
  }

  const message = await prisma.message.create({
    data: {
      driverId: input.driverId,
      assignmentId: input.assignmentId ?? null,
      template: input.template,
      channel: 'SMS',
    },
  });

  const secureToken = signSecureLink({ purpose: 'DRIVER_LINK', driverId: input.driverId, messageId: message.id }, SECURE_LINK_TTL_SECONDS);
  const secureUrl = `${process.env.WEB_BASE_URL || 'http://localhost:5173'}/r/${secureToken}`;
  const body = input.bodyBuilder(secureUrl);

  const provider = getSmsProvider();
  const result = await provider.send({ to: driver.phone, body, idempotencyKey: message.id });

  await prisma.message.update({
    where: { id: message.id },
    data: {
      sentAt: new Date(),
      deliveredAt: result.status === 'SENT' ? new Date() : null,
      secureToken,
      secureTokenExpiresAt: new Date(Date.now() + SECURE_LINK_TTL_SECONDS * 1000),
    },
  });

  return { sent: true, messageId: message.id };
}

/** Handles STOP/START/HELP and checkpoint-reply keywords from an inbound SMS webhook. */
export async function handleInboundSms(input: { fromPhone: string; body: string }) {
  const driver = await prisma.driver.findFirst({ where: { phone: input.fromPhone } });
  if (!driver) return { handled: false as const };

  const intent = classifyInbound(input.body);

  if (intent === 'OPT_OUT') {
    await prisma.driver.update({
      where: { id: driver.id },
      data: { smsConsentStatus: 'OPTED_OUT', optOutAt: new Date() },
    });
    await prisma.message.create({
      data: { driverId: driver.id, template: 'OPT_OUT_INBOUND', channel: 'SMS', response: input.body, isOptOutEvent: true, sentAt: new Date() },
    });
    const activeAssignments = await prisma.assignment.findMany({
      where: { driverId: driver.id, status: { in: ['OFFERED', 'ACCEPTED', 'ACK_REQUIRED', 'CONFIRMED_T24', 'IN_PROGRESS'] } },
    });
    for (const a of activeAssignments) {
      await evaluateAssignmentRisk(a.id);
      await recomputeShipperState(a.routeOccurrenceId);
    }
    await writeAudit({ entityType: 'Driver', entityId: driver.id, action: 'SMS_OPT_OUT' });
    return { handled: true as const, intent };
  }

  if (intent === 'OPT_IN') {
    await prisma.driver.update({
      where: { id: driver.id },
      data: { smsConsentStatus: 'OPTED_IN', optOutAt: null, smsConsentAt: new Date(), smsConsentSource: 'INBOUND_START' },
    });
    await writeAudit({ entityType: 'Driver', entityId: driver.id, action: 'SMS_OPT_IN' });
    return { handled: true as const, intent };
  }

  if (intent === 'HELP') {
    return { handled: true as const, intent };
  }

  // CHECKPOINT_RESPONSE: applies to the driver's most recent outstanding checkpoint.
  const checkpoint = await prisma.checkpoint.findFirst({
    where: { assignment: { driverId: driver.id }, response: null },
    orderBy: { scheduledAt: 'desc' },
  });
  if (checkpoint) {
    const responseMap: Record<string, string> = { '1': 'YES', '2': 'LATE', '3': 'PROBLEM', '4': 'CANNOT_COMPLETE' };
    const response = responseMap[input.body.trim()] || 'NO_RESPONSE';
    await prisma.checkpoint.update({
      where: { id: checkpoint.id },
      data: { response, respondedAt: new Date() },
    });
    await evaluateAssignmentRisk(checkpoint.assignmentId);
    const assignment = await prisma.assignment.findUniqueOrThrow({ where: { id: checkpoint.assignmentId } });
    await recomputeShipperState(assignment.routeOccurrenceId);
  }
  return { handled: true as const, intent, checkpointId: checkpoint?.id };
}

export function newIdempotencyKey() {
  return randomUUID();
}
