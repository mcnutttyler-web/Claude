import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedScenario } from './helpers.js';
import { offerAssignment, recordAcceptance, recordDecline } from '../src/domain/fullDisclosure.js';
import { evaluateAssignmentRisk } from '../src/domain/riskEngine.js';
import { recordT24Response } from '../src/domain/checkpoints.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('commitment-risk tier engine', () => {
  it('is yellow for a brand-new, unaccepted driver-route pairing', async () => {
    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    const result = await evaluateAssignmentRisk(assignment.id);
    expect(result.tier).toBe('YELLOW');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.ruleVersion).toBeTruthy();
  });

  it('turns green once accepted and T-24 confirmed on an established route', async () => {
    const s = await seedScenario();
    await prisma.routeOwnership.create({ data: { routeId: s.route.id, driverId: s.driver.id, weekdays: '[1,2,3,4,5]', startDate: '2026-01-01', status: 'ACTIVE' } });
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    await recordAcceptance(assignment.id, { channel: 'SMS' });
    const cp = await prisma.checkpoint.create({ data: { assignmentId: assignment.id, checkpointType: 'T24_RECONFIRM', scheduledAt: new Date() } });
    await recordT24Response(cp.id, 'YES');

    const finalAssignment = await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(finalAssignment.commitmentRiskTier).toBe('GREEN');
  });

  it('turns red on decline and never exposes a numeric score', async () => {
    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    await recordDecline(assignment.id, 'Requested compensation change');
    const result = await evaluateAssignmentRisk(assignment.id);
    expect(result.tier).toBe('RED');
    expect(JSON.stringify(result)).not.toMatch(/\d+\.\d+%|score/i);
  });

  it('records a versioned, auditable RiskTierEvent whenever the tier changes', async () => {
    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    await recordDecline(assignment.id);
    const events = await prisma.riskTierEvent.findMany({ where: { assignmentId: assignment.id } });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].ruleVersion).toBe('v1');
  });
});

describe('shipper-safe state mapping', () => {
  it('maps an unaccepted offer to OFFER_PENDING', async () => {
    const s = await seedScenario();
    await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    const status = await prisma.shipperCommitmentStatus.findUniqueOrThrow({ where: { routeOccurrenceId: s.occurrence.id } });
    expect(status.visibleState).toBe('OFFER_PENDING');
  });

  it('maps T-24 confirmation to COMMITTED_T24', async () => {
    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    await recordAcceptance(assignment.id, { channel: 'SMS' });
    const cp = await prisma.checkpoint.create({ data: { assignmentId: assignment.id, checkpointType: 'T24_RECONFIRM', scheduledAt: new Date() } });
    await recordT24Response(cp.id, 'YES');

    const status = await prisma.shipperCommitmentStatus.findUniqueOrThrow({ where: { routeOccurrenceId: s.occurrence.id } });
    expect(status.visibleState).toBe('COMMITTED_T24');
  });
});
