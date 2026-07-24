import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedScenario, startServer } from './helpers.js';
import { offerAssignment } from '../src/domain/fullDisclosure.js';
import { signSecureLink } from '../src/auth/jwt.js';

let server: Awaited<ReturnType<typeof startServer>>;

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await server?.close();
  await prisma.$disconnect();
});

describe('driver secure links', () => {
  it('expires and returns 410 once past its TTL', async () => {
    server = await startServer();
    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    const message = await prisma.message.findFirstOrThrow({ where: { assignmentId: assignment.id } });

    // Force the stored expiry into the past, simulating an old link.
    await prisma.message.update({ where: { id: message.id }, data: { secureTokenExpiresAt: new Date(Date.now() - 1000) } });
    const token = signSecureLink({ purpose: 'DRIVER_LINK', driverId: s.driver.id, messageId: message.id }, 60 * 60);

    const res = await fetch(`${server.url}/api/driver/link/${token}`);
    expect(res.status).toBe(410);
  });

  it('serves full-disclosure route details for a valid, unexpired link', async () => {
    server = await startServer();
    const s = await seedScenario();
    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    const message = await prisma.message.findFirstOrThrow({ where: { assignmentId: assignment.id } });

    const res = await fetch(`${server.url}/api/driver/link/${message.secureToken}`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.kind).toBe('ROUTE_OFFER');
    expect(body.acceptLanguage).toBe('I reviewed the route details and want this route.');
    expect(body.offer.routeCode).toBe('TEST-1');
  });
});

describe('incentive ledger', () => {
  it('records earned incentives without ever executing a payment', async () => {
    const s = await seedScenario();
    const program = await prisma.incentiveProgram.create({
      data: { operatorId: s.operatorA.id, name: 'Standby Bonus', type: 'ACTIVATION_BONUS', amount: 25 },
    });
    const entry = await prisma.incentiveLedgerEntry.create({
      data: { driverId: s.driver.id, programId: program.id, status: 'EARNED', amount: 25 },
    });

    expect(entry.status).toBe('EARNED');
    expect(entry.settlementExportStatus).toBe('NOT_EXPORTED');
    expect(entry.operatorSettlementReference).toBeNull();
    // RoutePilot tracks the incentive; it never moves money itself, so there is
    // no "paid" status or transfer API — only export-to-settlement tracking.
    expect(Object.keys(entry)).not.toContain('paidAt');
  });
});
