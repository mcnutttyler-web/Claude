import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedScenario } from './helpers.js';
import { computeReliabilityMetrics } from '../src/domain/metrics.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('reliability metrics', () => {
  it('computes committed-driver retention as started / T-24-confirmed, not offered / total', async () => {
    const s = await seedScenario();

    // Occurrence 1: confirmed T-24 and started (counts as retained).
    const occ1 = await prisma.routeOccurrence.create({
      data: { routeId: s.route.id, serviceDate: '2026-08-02', scheduledStart: new Date('2026-08-02T12:00:00Z'), scheduledEnd: new Date('2026-08-02T16:00:00Z') },
    });
    await prisma.assignment.create({
      data: { routeOccurrenceId: occ1.id, driverId: s.driver.id, assignmentType: 'PRIMARY', status: 'IN_PROGRESS', t24Status: 'CONFIRMED', startedAt: new Date('2026-08-02T12:05:00Z') },
    });

    // Occurrence 2: confirmed T-24 but never started (a coverage failure after confirmation).
    const occ2 = await prisma.routeOccurrence.create({
      data: { routeId: s.route.id, serviceDate: '2026-08-03', scheduledStart: new Date('2026-08-03T12:00:00Z'), scheduledEnd: new Date('2026-08-03T16:00:00Z') },
    });
    await prisma.assignment.create({
      data: { routeOccurrenceId: occ2.id, driverId: s.driver.id, assignmentType: 'PRIMARY', status: 'CANCELED', t24Status: 'CONFIRMED' },
    });

    // Occurrence 3: never confirmed T-24 (should not count in the denominator at all).
    const occ3 = await prisma.routeOccurrence.create({
      data: { routeId: s.route.id, serviceDate: '2026-08-04', scheduledStart: new Date('2026-08-04T12:00:00Z'), scheduledEnd: new Date('2026-08-04T16:00:00Z') },
    });
    await prisma.assignment.create({
      data: { routeOccurrenceId: occ3.id, driverId: s.driver.id, assignmentType: 'PRIMARY', status: 'OFFERED', t24Status: 'PENDING' },
    });

    const metrics = await computeReliabilityMetrics({
      operatorId: s.operatorA.id,
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-08-05T00:00:00Z'),
    });

    // 1 of 2 T-24-confirmed assignments actually started.
    expect(metrics.committedDriverRetentionRate).toBe(50);
  });

  it('computes median recovery time across resolved recovery cases', async () => {
    const s = await seedScenario();
    const occ = await prisma.routeOccurrence.create({
      data: { routeId: s.route.id, serviceDate: '2026-08-06', scheduledStart: new Date('2026-08-06T12:00:00Z'), scheduledEnd: new Date('2026-08-06T16:00:00Z') },
    });
    const openedAt = new Date('2026-08-06T08:00:00Z');
    await prisma.recoveryCase.create({
      data: { routeOccurrenceId: occ.id, originalAssignmentId: 'n/a', trigger: 'CANCELLATION', status: 'RESOLVED', openedAt, resolvedAt: new Date(openedAt.getTime() + 600_000), recoveryDurationSeconds: 600, recoveryMethod: 'NAMED_BACKUP' },
    });
    const occ2 = await prisma.routeOccurrence.create({
      data: { routeId: s.route.id, serviceDate: '2026-08-07', scheduledStart: new Date('2026-08-07T12:00:00Z'), scheduledEnd: new Date('2026-08-07T16:00:00Z') },
    });
    await prisma.recoveryCase.create({
      data: { routeOccurrenceId: occ2.id, originalAssignmentId: 'n/a', trigger: 'CANCELLATION', status: 'RESOLVED', openedAt, resolvedAt: new Date(openedAt.getTime() + 1_800_000), recoveryDurationSeconds: 1800, recoveryMethod: 'SOURCED_REPLACEMENT' },
    });

    const metrics = await computeReliabilityMetrics({
      operatorId: s.operatorA.id,
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-08-10T00:00:00Z'),
    });

    expect(metrics.medianRecoveryTimeSeconds).toBe(1200);
    expect(metrics.routesRequiringEmergencyReplacement).toBe(2);
  });
});
