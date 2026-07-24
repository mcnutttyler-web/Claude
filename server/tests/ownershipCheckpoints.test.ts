import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedScenario } from './helpers.js';
import { createRouteOwnership, addPlannedTimeOff, updateStreakOnOccurrenceOutcome } from '../src/domain/ownership.js';
import { offerAssignment } from '../src/domain/fullDisclosure.js';
import { checkpointLevelForAssignment, scheduleCheckpointsForAssignment, escalateOverdueCheckpoints } from '../src/domain/checkpoints.js';
import { isWithinQuietHours } from '../src/messaging/consent.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('route ownership', () => {
  it('planned time off never removes route ownership status', async () => {
    const s = await seedScenario();
    const ownership = await createRouteOwnership({ routeId: s.route.id, driverId: s.driver.id, weekdays: [1, 2, 3, 4, 5], startDate: '2026-01-01', status: 'ACTIVE' });

    const updated = await addPlannedTimeOff(ownership.id, { start: '2026-09-01', end: '2026-09-07', reason: 'Vacation' });

    expect(updated.status).toBe('ACTIVE');
    const timeOff = JSON.parse(updated.plannedTimeOff);
    expect(timeOff).toHaveLength(1);
    expect(timeOff[0].reason).toBe('Vacation');
  });

  it('avoidable failures reset the streak; on-time completions grow it', async () => {
    const s = await seedScenario();
    await createRouteOwnership({ routeId: s.route.id, driverId: s.driver.id, weekdays: [1, 2, 3, 4, 5], startDate: '2026-01-01', status: 'ACTIVE' });

    for (let i = 0; i < 3; i++) {
      await updateStreakOnOccurrenceOutcome({ routeId: s.route.id, driverId: s.driver.id, outcome: 'ORIGINAL_STARTED_ON_TIME' });
    }
    let ownership = await prisma.routeOwnership.findFirstOrThrow({ where: { routeId: s.route.id, driverId: s.driver.id } });
    expect(ownership.routeStreak).toBe(3);

    await updateStreakOnOccurrenceOutcome({ routeId: s.route.id, driverId: s.driver.id, outcome: 'AVOIDABLE_FAILURE' });
    ownership = await prisma.routeOwnership.findFirstOrThrow({ where: { routeId: s.route.id, driverId: s.driver.id } });
    expect(ownership.routeStreak).toBe(0);
  });
});

describe('adaptive checkpoints', () => {
  it('earns down to a single T-24 reconfirmation after 8 consecutive completed weeks', async () => {
    const s = await seedScenario();
    const ownership = await createRouteOwnership({ routeId: s.route.id, driverId: s.driver.id, weekdays: [1, 2, 3, 4, 5], startDate: '2026-01-01', status: 'ACTIVE' });
    await prisma.routeOwnership.update({ where: { id: ownership.id }, data: { routeStreak: 8, checkpointLevel: 'EARNED_DOWN' } });

    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    const level = await checkpointLevelForAssignment(assignment.id);
    expect(level).toBe('EARNED_DOWN');

    const result = await scheduleCheckpointsForAssignment(assignment.id);
    expect(result.scheduled).toEqual(['T24_RECONFIRM']);
  });

  it('new driver-route pairings and critical routes always get the full checkpoint sequence', async () => {
    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    const level = await checkpointLevelForAssignment(assignment.id);
    expect(level).toBe('FULL');

    const result = await scheduleCheckpointsForAssignment(assignment.id);
    expect(result.scheduled).toEqual(['T24_RECONFIRM', 'EVENING_READINESS', 'PRE_DEPARTURE']);
  });

  it('escalates a checkpoint that was sent but never answered within its grace period', async () => {
    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    const cp = await prisma.checkpoint.create({
      data: { assignmentId: assignment.id, checkpointType: 'T24_RECONFIRM', scheduledAt: new Date(), sentAt: new Date(Date.now() - 4 * 3_600_000) },
    });

    const { escalated } = await escalateOverdueCheckpoints();
    expect(escalated).toBeGreaterThanOrEqual(1);

    const updated = await prisma.checkpoint.findUniqueOrThrow({ where: { id: cp.id } });
    expect(updated.escalationStatus).toBe('ESCALATED');
  });
});

describe('messaging compliance', () => {
  it('flags a driver as within quiet hours when their local time falls in the configured window', () => {
    const driver = { quietHours: JSON.stringify({ start: '21:00', end: '07:00' }), timezone: 'America/New_York' };
    const late = new Date('2026-01-15T04:00:00Z'); // 23:00 America/New_York the prior day, within quiet hours
    const midday = new Date('2026-01-15T17:00:00Z'); // 12:00 America/New_York, outside quiet hours
    expect(isWithinQuietHours(driver as never, late)).toBe(true);
    expect(isWithinQuietHours(driver as never, midday)).toBe(false);
  });
});
