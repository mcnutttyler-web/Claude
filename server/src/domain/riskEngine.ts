import { prisma } from '../db.js';
import { fromJson, toJson } from './json.js';
import type { RiskTierT } from './enums.js';

interface RiskRules {
  version: string;
  earnedDownStreakWeeks: number;
  cancellationLookbackDays: number;
  redOnMissedPreDepartureEscalation: boolean;
}

export const DEFAULT_RISK_RULES: RiskRules = {
  version: 'v1',
  earnedDownStreakWeeks: 8,
  cancellationLookbackDays: 90,
  redOnMissedPreDepartureEscalation: true,
};

interface TierResult {
  tier: RiskTierT;
  reasons: string[];
  recommendedAction: string;
  ruleVersion: string;
}

async function getActiveRules(operatorId: string): Promise<RiskRules> {
  const active = await prisma.riskRuleVersion.findFirst({
    where: { operatorId, active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!active) return DEFAULT_RISK_RULES;
  return fromJson<RiskRules>(active.rules, DEFAULT_RISK_RULES);
}

/**
 * Explainable, versioned, non-numeric commitment-risk tier engine. Every
 * output ships plain-language reasons and a recommended dispatcher action.
 * This is deterministic rule evaluation, not predictive scoring, and the
 * tier itself is never shown to a driver or shipper directly.
 */
export async function evaluateAssignmentRisk(assignmentId: string): Promise<TierResult> {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      driver: true,
      routeOccurrence: { include: { route: true } },
      checkpoints: true,
    },
  });

  const route = assignment.routeOccurrence.route;
  const rules = await getActiveRules(route.operatorId);
  const reasons: string[] = [];
  let tier: RiskTierT = 'GREEN';
  let recommendedAction = 'No action needed.';

  // Terminal / failure states -> RED
  if (assignment.status === 'CANCELED') {
    tier = 'RED';
    reasons.push('Driver canceled this assignment.');
    recommendedAction = 'Activate backup or begin replacement sourcing immediately.';
  } else if (assignment.status === 'DECLINED') {
    tier = 'RED';
    reasons.push('Driver declined the route offer.');
    recommendedAction = 'Source a replacement driver.';
  }

  const missedPreDeparture = assignment.checkpoints.find(
    (c) => c.checkpointType === 'PRE_DEPARTURE' && c.escalationStatus === 'ESCALATED' && !c.response,
  );
  if (tier !== 'RED' && missedPreDeparture && rules.redOnMissedPreDepartureEscalation) {
    tier = 'RED';
    reasons.push('Driver missed the pre-departure check-in and escalation window has passed.');
    recommendedAction = 'Contact driver immediately; prepare to activate backup.';
  }

  const problemResponse = assignment.checkpoints.find((c) => c.response === 'PROBLEM' || c.response === 'CANNOT_COMPLETE');
  if (tier !== 'RED' && problemResponse) {
    tier = 'RED';
    reasons.push('Driver reported a problem or inability to complete the route.');
    recommendedAction = 'Open a recovery case and evaluate backup activation.';
  }

  // Orange conditions
  if (isTier(tier, 'GREEN', 'YELLOW')) {
    const missedCheckpoint = assignment.checkpoints.find(
      (c) => c.escalationStatus === 'ESCALATED' && !c.response && c.checkpointType !== 'PRE_DEPARTURE',
    );
    if (missedCheckpoint) {
      tier = 'ORANGE';
      reasons.push(`Missed requested ${missedCheckpoint.checkpointType.replace('_', ' ').toLowerCase()} checkpoint.`);
      recommendedAction = 'Reach out to the driver before the next milestone.';
    }
    if (assignment.status === 'ACK_REQUIRED') {
      tier = 'ORANGE';
      reasons.push('Route details changed and the driver has not re-acknowledged.');
      recommendedAction = 'Confirm the driver has seen the updated route details.';
    }
    if ((route.criticality === 'CRITICAL' || route.criticality === 'STAT') && assignment.status === 'OFFERED') {
      tier = 'ORANGE';
      reasons.push('Critical/STAT route still has an unaccepted offer.');
      recommendedAction = 'Prepare a qualified backup while awaiting acceptance.';
    }
  }

  // Yellow conditions
  if (isTier(tier, 'GREEN')) {
    const ownership = await prisma.routeOwnership.findFirst({
      where: { routeId: route.id, driverId: assignment.driverId, status: { in: ['ACTIVE', 'TRIAL'] } },
    });
    if (!ownership) {
      tier = 'YELLOW';
      reasons.push('Driver has no established ownership on this route yet.');
      recommendedAction = 'Monitor T-24 confirmation closely for this new pairing.';
    } else if (ownership.status === 'TRIAL') {
      tier = 'YELLOW';
      reasons.push('Route ownership is still in trial status.');
      recommendedAction = 'Monitor for the first few completed occurrences.';
    }
    if (assignment.status === 'OFFERED') {
      tier = 'YELLOW';
      reasons.push('Driver has not yet accepted the route offer.');
      recommendedAction = 'Follow up if acceptance is not received soon.';
    }
    if (assignment.t24Status === 'PENDING' && isWithin24Hours(assignment.routeOccurrence.scheduledStart)) {
      tier = 'YELLOW';
      reasons.push('T-24 reconfirmation window is open and not yet confirmed.');
      recommendedAction = 'Send T-24 reconfirmation reminder.';
    }
  }

  const recentAvoidable = await prisma.cancellationEvent.count({
    where: {
      assignment: { driverId: assignment.driverId },
      classification: 'AVOIDABLE',
      eventTimestamp: { gte: new Date(Date.now() - rules.cancellationLookbackDays * 86400000) },
    },
  });
  if (recentAvoidable > 0 && tier !== 'RED') {
    tier = tier === 'GREEN' ? 'YELLOW' : tier;
    if (tier === 'YELLOW') reasons.push('Driver has a recent avoidable cancellation on record.');
  }

  if (reasons.length === 0) {
    reasons.push('Driver is confirmed, on an established route, with no open concerns.');
  }

  const result: TierResult = { tier, reasons, recommendedAction, ruleVersion: rules.version };

  if (assignment.commitmentRiskTier !== tier) {
    await prisma.riskTierEvent.create({
      data: {
        assignmentId,
        previousTier: assignment.commitmentRiskTier,
        newTier: tier,
        reasons: toJson(reasons),
        recommendedAction,
        ruleVersion: rules.version,
      },
    });
  }

  await prisma.assignment.update({ where: { id: assignmentId }, data: { commitmentRiskTier: tier } });

  return result;
}

function isTier(t: RiskTierT, ...options: RiskTierT[]): boolean {
  return (options as string[]).includes(t);
}

function isWithin24Hours(scheduledStart: Date): boolean {
  const hoursUntil = (scheduledStart.getTime() - Date.now()) / 3_600_000;
  return hoursUntil <= 24;
}
