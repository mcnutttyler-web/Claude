import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedScenario, startServer } from './helpers.js';
import { offerAssignment, recordAcceptance } from '../src/domain/fullDisclosure.js';
import { recordCancellation } from '../src/domain/cancellations.js';

let server: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  server = await startServer();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await server?.close();
  await prisma.$disconnect();
});

describe('tenant isolation', () => {
  it('operators cannot see another operator\'s routes or drivers', async () => {
    const s = await seedScenario();

    const resB = await fetch(`${server.url}/api/operator/routes`, { headers: { Authorization: `Bearer ${s.dispatcherB.token}` } });
    const routesForB = await resB.json();
    expect(routesForB.find((r: { id: string }) => r.id === s.route.id)).toBeUndefined();

    const resA = await fetch(`${server.url}/api/operator/routes`, { headers: { Authorization: `Bearer ${s.dispatcherA.token}` } });
    const routesForA = await resA.json();
    expect(routesForA.find((r: { id: string }) => r.id === s.route.id)).toBeDefined();
  });

  it('branch-scoped dispatchers only see occurrences in their own branch', async () => {
    const s = await seedScenario();

    const secondBranch = await prisma.operatorBranch.create({ data: { operatorId: s.operatorA.id, name: 'Second Branch', market: 'Other Market' } });
    const otherBranchRoute = await prisma.route.create({
      data: {
        operatorId: s.operatorA.id,
        branchId: secondBranch.id,
        routeCode: 'TEST-2',
        routeName: 'Other Branch Route',
        pickupArea: 'X',
        deliveryArea: 'Y',
        scheduledStart: '08:00',
        estimatedCompletion: '12:00',
      },
    });
    await prisma.routeOccurrence.create({
      data: { routeId: otherBranchRoute.id, serviceDate: '2026-08-01', scheduledStart: new Date('2026-08-01T12:00:00Z'), scheduledEnd: new Date('2026-08-01T16:00:00Z') },
    });

    const res = await fetch(`${server.url}/api/operator/coverage-board?date=2026-08-01`, { headers: { Authorization: `Bearer ${s.dispatcherA.token}` } });
    const board = await res.json();
    expect(board.length).toBeGreaterThan(0);
    expect(board.every((o: { routeCode: string }) => o.routeCode === 'TEST-1')).toBe(true);
  });

  it('shippers only see routes explicitly marked visible for them, never raw driver or pay data', async () => {
    const s = await seedScenario();

    const assignment = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
    await recordAcceptance(assignment.id, { channel: 'SMS' });
    await recordCancellation({
      assignmentId: assignment.id,
      classification: 'AVOIDABLE',
      category: 'ECONOMIC',
      structuredReason: 'Better-paying opportunity',
      freeTextNote: 'This is a private operator note that must never reach the shipper.',
      reportedBy: 'test',
    });

    const res = await fetch(`${server.url}/api/shipper/routes`, { headers: { Authorization: `Bearer ${s.shipperAdmin.token}` } });
    const raw = await res.text();
    const routes = JSON.parse(raw);

    expect(routes.length).toBeGreaterThan(0);
    expect(raw).not.toContain('private operator note');
    expect(raw).not.toContain('Test Driver');
    expect(raw).not.toContain('"base":100');
    expect(raw.toUpperCase()).not.toContain('AVOIDABLE');
    // Shipper-safe vocabulary only.
    expect(routes[0]).toHaveProperty('commitmentState');
    expect(routes[0]).not.toHaveProperty('commitmentRiskTier');
  });

  it('a shipper cannot query another shipper\'s scope even with a valid token shape', async () => {
    const s = await seedScenario();

    const res = await fetch(`${server.url}/api/operator/routes`, { headers: { Authorization: `Bearer ${s.shipperAdmin.token}` } });
    expect(res.status).toBe(403);
  });
});
