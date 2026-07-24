import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';
import { createApp } from '../src/app.js';
import { toJson } from '../src/domain/json.js';
import { signToken } from '../src/auth/jwt.js';
import { ensureInitialRouteVersion } from '../src/domain/fullDisclosure.js';

export async function resetDb() {
  const deleteOrder = [
    'auditEvent',
    'incentiveLedgerEntry',
    'incentiveProgram',
    'message',
    'shipperScorecard',
    'shipperCommitmentStatus',
    'cancellationEvent',
    'recoveryCandidate',
    'recoveryCase',
    'backupArrangement',
    'riskTierEvent',
    'checkpoint',
    'assignment',
    'routeOwnership',
    'routeOccurrence',
    'routeDetailVersion',
    'route',
    'driverCredential',
    'driverPoolMembership',
    'driverPool',
    'driver',
    'riskRuleVersion',
    'user',
    'operatorShipperRelationship',
    'operatorBranch',
    'operatorOrganization',
    'shipperOrganization',
    'platformOrganization',
  ] as const;
  for (const model of deleteOrder) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[model].deleteMany();
  }
}

export function startServer() {
  const app = createApp();
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://localhost:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

export async function seedScenario() {
  const operatorA = await prisma.operatorOrganization.create({ data: { name: 'Operator A' } });
  const operatorB = await prisma.operatorOrganization.create({ data: { name: 'Operator B' } });
  const branchA = await prisma.operatorBranch.create({ data: { operatorId: operatorA.id, name: 'Branch A', market: 'Market A' } });
  const branchB = await prisma.operatorBranch.create({ data: { operatorId: operatorB.id, name: 'Branch B', market: 'Market B' } });
  const shipper = await prisma.shipperOrganization.create({ data: { name: 'Shipper One' } });
  await prisma.operatorShipperRelationship.create({ data: { operatorId: operatorA.id, shipperId: shipper.id } });

  const dispatcherA = await createUser({ email: 'dispatcher.a@test.dev', role: 'DISPATCHER', organizationType: 'OPERATOR', operatorId: operatorA.id, branchId: branchA.id });
  const adminA = await createUser({ email: 'admin.a@test.dev', role: 'OPERATOR_ADMIN', organizationType: 'OPERATOR', operatorId: operatorA.id });
  const dispatcherB = await createUser({ email: 'dispatcher.b@test.dev', role: 'DISPATCHER', organizationType: 'OPERATOR', operatorId: operatorB.id, branchId: branchB.id });
  const shipperAdmin = await createUser({ email: 'shipper.admin@test.dev', role: 'SHIPPER_ADMIN', organizationType: 'SHIPPER', shipperId: shipper.id });

  const driver = await prisma.driver.create({
    data: {
      operatorId: operatorA.id,
      name: 'Test Driver',
      phone: '+15551230001',
      smsConsentStatus: 'OPTED_IN',
      smsConsentAt: new Date(),
      smsConsentSource: 'TEST',
    },
  });

  const route = await prisma.route.create({
    data: {
      operatorId: operatorA.id,
      branchId: branchA.id,
      shipperId: shipper.id,
      routeCode: 'TEST-1',
      routeName: 'Test Route',
      pickupArea: 'Pickup',
      deliveryArea: 'Delivery',
      scheduledStart: '08:00',
      estimatedCompletion: '12:00',
      compensation: toJson({ base: 100 }),
      shipperVisibilitySettings: toJson({ visible: true }),
    },
  });
  await ensureInitialRouteVersion(route.id, 'test');

  const occurrence = await prisma.routeOccurrence.create({
    data: {
      routeId: route.id,
      serviceDate: '2026-08-01',
      scheduledStart: new Date('2026-08-01T12:00:00Z'),
      scheduledEnd: new Date('2026-08-01T16:00:00Z'),
    },
  });

  return { operatorA, operatorB, branchA, branchB, shipper, dispatcherA, adminA, dispatcherB, shipperAdmin, driver, route, occurrence };
}

async function createUser(input: { email: string; role: string; organizationType: 'OPERATOR' | 'SHIPPER'; operatorId?: string; shipperId?: string; branchId?: string }) {
  const passwordHash = await bcrypt.hash('password123', 4);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.email,
      role: input.role,
      organizationType: input.organizationType,
      operatorId: input.operatorId ?? null,
      shipperId: input.shipperId ?? null,
      branchId: input.branchId ?? null,
      passwordHash,
    },
  });
  const token = signToken({
    userId: user.id,
    organizationType: input.organizationType,
    operatorId: user.operatorId,
    shipperId: user.shipperId,
    branchId: user.branchId,
    role: user.role,
  });
  return { user, token };
}
