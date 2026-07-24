import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedScenario } from './helpers.js';
import { offerAssignment, recordAcceptance, applyMaterialRouteChange, FULL_DISCLOSURE_ACCEPT_LANGUAGE } from '../src/domain/fullDisclosure.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('full-disclosure acceptance', () => {
  it('uses the exact required accept language and records channel/timestamp/version', async () => {
    expect(FULL_DISCLOSURE_ACCEPT_LANGUAGE).toBe('I reviewed the route details and want this route.');

    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    const accepted = await recordAcceptance(assignment.id, { channel: 'SECURE_LINK' });

    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.acceptedAt).toBeTruthy();
    expect(accepted.acceptedDetailVersion).toBe(1);
    expect(accepted.acceptanceChannel).toBe('SECURE_LINK');

    const checkpoint = await prisma.checkpoint.findFirst({ where: { assignmentId: assignment.id, checkpointType: 'FULL_DISCLOSURE' } });
    expect(checkpoint?.response).toBe('YES');
  });

  it('requires renewed acknowledgment after a material change and preserves original acceptance history', async () => {
    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    const firstAcceptance = await recordAcceptance(assignment.id, { channel: 'SMS' });
    expect(firstAcceptance.acceptedDetailVersion).toBe(1);

    await applyMaterialRouteChange(s.route.id, { materialNotes: 'New hazmat handling requirement.' }, 'ops-admin');

    const flagged = await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(flagged.status).toBe('ACK_REQUIRED');
    // Original acceptance history is never overwritten.
    expect(flagged.acceptedAt).toEqual(firstAcceptance.acceptedAt);
    expect(flagged.acceptedDetailVersion).toBe(1);

    // Driver is notified.
    const reackMessage = await prisma.message.findFirst({ where: { assignmentId: assignment.id, template: 'MATERIAL_CHANGE_REACK' } });
    expect(reackMessage).toBeTruthy();

    const renewed = await recordAcceptance(assignment.id, { channel: 'SECURE_LINK' });
    expect(renewed.status).toBe('ACCEPTED');
    expect(renewed.acceptedDetailVersion).toBe(2);

    const route = await prisma.route.findUniqueOrThrow({ where: { id: s.route.id } });
    expect(route.activeVersionNumber).toBe(2);
    const versions = await prisma.routeDetailVersion.findMany({ where: { routeId: s.route.id } });
    expect(versions).toHaveLength(2);
  });
});
