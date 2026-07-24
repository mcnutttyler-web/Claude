import { prisma } from '../db.js';

export interface MetricsFilter {
  operatorId: string;
  branchId?: string;
  shipperId?: string;
  routeId?: string;
  startDate: Date;
  endDate: Date;
}

function occurrenceWhere(filter: MetricsFilter) {
  return {
    scheduledStart: { gte: filter.startDate, lte: filter.endDate },
    route: {
      operatorId: filter.operatorId,
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.shipperId ? { shipperId: filter.shipperId } : {}),
      ...(filter.routeId ? { id: filter.routeId } : {}),
    },
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal place
}

export interface ReliabilityMetrics {
  committedDriverRetentionRate: number | null;
  originalDriverStartRate: number | null;
  avoidableCancellationRate: number | null;
  unavoidableCancellationRate: number | null;
  namedBackupCoverageRate: number | null;
  backupActivationRate: number | null;
  medianRecoveryTimeSeconds: number | null;
  routesRequiringEmergencyReplacement: number;
  onTimePickupRate: number | null;
  routeCompletionRate: number | null;
  recurringDriverRetentionRate: number | null;
  fullDisclosureAcceptanceRate: number | null;
  sampleSize: { occurrences: number; primaryAssignments: number };
}

export async function computeReliabilityMetrics(filter: MetricsFilter): Promise<ReliabilityMetrics> {
  const where = occurrenceWhere(filter);
  const occurrences = await prisma.routeOccurrence.findMany({
    where,
    include: { assignments: true, backupArrangements: true, recoveryCases: true },
  });

  const primaryAssignments = occurrences.flatMap((o) => o.assignments.filter((a) => a.assignmentType === 'PRIMARY'));
  const allOfferedAssignments = occurrences.flatMap((o) => o.assignments.filter((a) => a.status !== 'EXPIRED'));

  const committedT24 = primaryAssignments.filter((a) => a.t24Status === 'CONFIRMED');
  const committedAndStarted = committedT24.filter((a) => a.startedAt || a.status === 'IN_PROGRESS' || a.status === 'COMPLETED');

  const startedOccurrences = occurrences.filter((o) => o.assignments.some((a) => a.status === 'IN_PROGRESS' || a.status === 'COMPLETED'));
  const startedByOriginalPrimary = startedOccurrences.filter((o) =>
    o.assignments.some((a) => a.assignmentType === 'PRIMARY' && (a.status === 'IN_PROGRESS' || a.status === 'COMPLETED')),
  );

  const cancellations = await prisma.cancellationEvent.findMany({
    where: { assignment: { routeOccurrence: where } },
  });
  const avoidable = cancellations.filter((c) => c.classification === 'AVOIDABLE');
  const unavoidable = cancellations.filter((c) => c.classification === 'UNAVOIDABLE');

  const occurrencesNeedingBackup = occurrences.filter((o) => o.backupArrangements.length > 0);
  const occurrencesWithAcceptedBackup = occurrencesNeedingBackup.filter((o) => o.backupArrangements.some((b) => b.status === 'ACCEPTED' || b.status === 'ACTIVATED'));

  const allBackups = occurrences.flatMap((o) => o.backupArrangements);
  const activatedBackups = allBackups.filter((b) => b.status === 'ACTIVATED');

  const resolvedCases = occurrences.flatMap((o) => o.recoveryCases.filter((c) => c.status === 'RESOLVED' && c.recoveryDurationSeconds != null));
  const emergencyReplacements = occurrences.flatMap((o) => o.recoveryCases.filter((c) => c.recoveryMethod === 'SOURCED_REPLACEMENT' || c.recoveryMethod === 'NAMED_BACKUP'));

  const startedAssignments = occurrences.flatMap((o) => o.assignments.filter((a) => a.startedAt));
  const onTimeCount = startedAssignments.filter((a) => {
    const occ = occurrences.find((o) => o.assignments.some((x) => x.id === a.id));
    if (!occ) return false;
    return a.startedAt! <= new Date(occ.scheduledStart.getTime() + 15 * 60_000);
  }).length;

  const completedOccurrences = occurrences.filter((o) => o.status === 'COMPLETED' || o.assignments.some((a) => a.status === 'COMPLETED'));

  const ownerships = await prisma.routeOwnership.findMany({
    where: { route: { operatorId: filter.operatorId, ...(filter.branchId ? { branchId: filter.branchId } : {}) } },
  });
  const retainedOwnerships = ownerships.filter((o) => o.status !== 'ENDED');

  const fullDisclosureAccepted = allOfferedAssignments.filter((a) => a.acceptedDetailVersion != null);

  return {
    committedDriverRetentionRate: pct(committedAndStarted.length, committedT24.length),
    originalDriverStartRate: pct(startedByOriginalPrimary.length, startedOccurrences.length),
    avoidableCancellationRate: pct(avoidable.length, primaryAssignments.length || cancellations.length),
    unavoidableCancellationRate: pct(unavoidable.length, primaryAssignments.length || cancellations.length),
    namedBackupCoverageRate: pct(occurrencesWithAcceptedBackup.length, occurrencesNeedingBackup.length),
    backupActivationRate: pct(activatedBackups.length, allBackups.length),
    medianRecoveryTimeSeconds: median(resolvedCases.map((c) => c.recoveryDurationSeconds!)),
    routesRequiringEmergencyReplacement: emergencyReplacements.length,
    onTimePickupRate: pct(onTimeCount, startedAssignments.length),
    routeCompletionRate: pct(completedOccurrences.length, occurrences.length),
    recurringDriverRetentionRate: pct(retainedOwnerships.length, ownerships.length),
    fullDisclosureAcceptanceRate: pct(fullDisclosureAccepted.length, allOfferedAssignments.length),
    sampleSize: { occurrences: occurrences.length, primaryAssignments: primaryAssignments.length },
  };
}

export async function generateShipperScorecard(input: { shipperId: string; operatorId: string; periodStart: Date; periodEnd: Date }) {
  const metrics = await computeReliabilityMetrics({
    operatorId: input.operatorId,
    shipperId: input.shipperId,
    startDate: input.periodStart,
    endDate: input.periodEnd,
  });
  const { toJson } = await import('./json.js');
  return prisma.shipperScorecard.create({
    data: {
      shipperId: input.shipperId,
      operatorId: input.operatorId,
      reportingPeriodStart: input.periodStart.toISOString().slice(0, 10),
      reportingPeriodEnd: input.periodEnd.toISOString().slice(0, 10),
      metricsSnapshot: toJson(metrics),
    },
  });
}
