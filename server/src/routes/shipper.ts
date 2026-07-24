import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireShipperScope } from '../auth/middleware.js';
import { fromJson } from '../domain/json.js';
import { computeReliabilityMetrics } from '../domain/metrics.js';

export const shipperRouter = Router();
shipperRouter.use(requireAuth, requireShipperScope);

// Only routes explicitly marked shipper-visible by the operator are ever returned.
function visibleRouteWhere(shipperId: string) {
  return { shipperId, shipperVisibilitySettings: { contains: '"visible":true' } };
}

shipperRouter.get('/routes', async (req, res) => {
  const shipperId = req.auth!.shipperId!;
  const { operatorId, start, end, criticality, state } = req.query as Record<string, string>;

  const occurrences = await prisma.routeOccurrence.findMany({
    where: {
      route: { ...visibleRouteWhere(shipperId), ...(operatorId ? { operatorId } : {}), ...(criticality ? { criticality } : {}) },
      ...(start || end
        ? { scheduledStart: { gte: start ? new Date(start) : undefined, lte: end ? new Date(end) : undefined } }
        : {}),
    },
    include: { route: true, shipperCommitmentStatus: true },
    orderBy: { scheduledStart: 'asc' },
    take: 300,
  });

  const filtered = state ? occurrences.filter((o) => o.shipperCommitmentStatus?.visibleState === state) : occurrences;

  res.json(
    filtered.map((o) => ({
      routeOccurrenceId: o.id,
      routeCode: o.route.routeCode,
      routeName: o.route.routeName,
      pickupArea: o.route.pickupArea,
      deliveryArea: o.route.deliveryArea,
      criticality: o.route.criticality,
      serviceDate: o.serviceDate,
      scheduledStart: o.scheduledStart,
      // Shipper-safe vocabulary only — no risk tier, no driver identity/pay, no raw reason codes.
      commitmentState: o.shipperCommitmentStatus?.visibleState ?? 'OFFER_PENDING',
      stateReason: o.shipperCommitmentStatus?.stateReason,
      lastUpdated: o.shipperCommitmentStatus?.lastUpdated,
      nextMilestone: o.shipperCommitmentStatus?.nextMilestone,
      shipperActionRequired: o.shipperCommitmentStatus?.shipperActionRequired ?? false,
    })),
  );
});

shipperRouter.get('/dashboard', async (req, res) => {
  const shipperId = req.auth!.shipperId!;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 24 * 3_600_000);

  const todayOccurrences = await prisma.routeOccurrence.findMany({
    where: { route: visibleRouteWhere(shipperId), scheduledStart: { gte: todayStart, lt: todayEnd } },
    include: { shipperCommitmentStatus: true, route: true },
  });

  const counts: Record<string, number> = {};
  for (const o of todayOccurrences) {
    const state = o.shipperCommitmentStatus?.visibleState ?? 'OFFER_PENDING';
    counts[state] = (counts[state] ?? 0) + 1;
  }

  const links = await prisma.operatorShipperRelationship.findMany({ where: { shipperId, active: true }, include: { operator: true } });
  const metricsByOperator = await Promise.all(
    links.map(async (link) => ({
      operatorId: link.operatorId,
      operatorName: link.operator.name,
      metrics: await computeReliabilityMetrics({
        operatorId: link.operatorId,
        shipperId,
        startDate: new Date(Date.now() - 30 * 86400000),
        endDate: new Date(),
      }),
    })),
  );

  res.json({ routesToday: todayOccurrences.length, stateCounts: counts, operators: metricsByOperator });
});

shipperRouter.get('/exceptions', async (req, res) => {
  const shipperId = req.auth!.shipperId!;
  const occurrences = await prisma.routeOccurrence.findMany({
    where: {
      route: visibleRouteWhere(shipperId),
      shipperCommitmentStatus: { visibleState: { in: ['INTERVENTION_UNDERWAY', 'OFFER_PENDING'] } },
    },
    include: { route: true, shipperCommitmentStatus: true },
    orderBy: { scheduledStart: 'asc' },
  });
  res.json(
    occurrences.map((o) => ({
      routeOccurrenceId: o.id,
      routeCode: o.route.routeCode,
      routeName: o.route.routeName,
      serviceDate: o.serviceDate,
      commitmentState: o.shipperCommitmentStatus?.visibleState,
      stateReason: o.shipperCommitmentStatus?.stateReason,
    })),
  );
});

shipperRouter.get('/providers', async (req, res) => {
  const shipperId = req.auth!.shipperId!;
  const links = await prisma.operatorShipperRelationship.findMany({ where: { shipperId, active: true }, include: { operator: true } });
  const scorecards = await Promise.all(
    links.map(async (link) => {
      const metrics = await computeReliabilityMetrics({
        operatorId: link.operatorId,
        shipperId,
        startDate: new Date(Date.now() - 90 * 86400000),
        endDate: new Date(),
      });
      return { operatorId: link.operatorId, operatorName: link.operator.name, metrics };
    }),
  );
  res.json(scorecards);
});

shipperRouter.get('/scorecards', async (req, res) => {
  const shipperId = req.auth!.shipperId!;
  const scorecards = await prisma.shipperScorecard.findMany({ where: { shipperId }, orderBy: { generatedAt: 'desc' } });
  res.json(scorecards.map((s) => ({ ...s, metricsSnapshot: fromJson(s.metricsSnapshot, {}) })));
});
