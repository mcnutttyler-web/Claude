import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOperatorScope, requireRole } from '../auth/middleware.js';
import { toJson, fromJson } from '../domain/json.js';
import { ensureInitialRouteVersion, applyMaterialRouteChange, offerAssignment, recordDecline } from '../domain/fullDisclosure.js';
import { createRouteOwnership, addPlannedTimeOff, setTemporaryReplacement } from '../domain/ownership.js';
import { scheduleCheckpointsForAssignment, runCheckpointTick } from '../domain/checkpoints.js';
import { createBackupOffer, activateBackup } from '../domain/backups.js';
import { openRecoveryCase, addRecoveryCandidate, updateCandidateStatus, sourceReplacementFromCandidate, markRecoveryCaseUnresolved } from '../domain/recovery.js';
import { recordCancellation, recordRouteOutcome } from '../domain/cancellations.js';
import { computeReliabilityMetrics, generateShipperScorecard } from '../domain/metrics.js';
import { writeAudit } from '../domain/audit.js';

export const operatorRouter = Router();
operatorRouter.use(requireAuth, requireOperatorScope);

const ADMIN_ROLES = ['OPERATOR_ADMIN'];
const BRANCH_MGMT_ROLES = ['OPERATOR_ADMIN', 'BRANCH_MANAGER'];
const DISPATCH_ROLES = ['OPERATOR_ADMIN', 'BRANCH_MANAGER', 'DISPATCHER'];

function branchFilter(req: import('express').Request) {
  // Dispatchers/branch managers with a branch assignment are scoped to it; admins see the whole operator.
  if (req.auth!.branchId) return { branchId: req.auth!.branchId };
  return {};
}

// ---------------------------------------------------------------------------
// Operations Dashboard
// ---------------------------------------------------------------------------

operatorRouter.get('/dashboard', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const operatorId = req.auth!.operatorId!;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 24 * 3_600_000);

  const occurrences = await prisma.routeOccurrence.findMany({
    where: { scheduledStart: { gte: todayStart, lt: todayEnd }, route: { operatorId, ...branchFilter(req) } },
    include: { assignments: true, route: true },
  });

  const orangeOrRed = occurrences.filter((o) => o.assignments.some((a) => a.commitmentRiskTier === 'ORANGE' || a.commitmentRiskTier === 'RED'));
  const uncovered = occurrences.filter((o) => o.status === 'AT_RISK' || o.status === 'COVERAGE_FAILURE');
  const openRecoveryCases = await prisma.recoveryCase.count({
    where: { routeOccurrence: { route: { operatorId, ...branchFilter(req) } }, status: { notIn: ['RESOLVED', 'UNRESOLVED'] } },
  });

  res.json({
    routesToday: occurrences.length,
    orangeOrRedCount: orangeOrRed.length,
    uncoveredCount: uncovered.length,
    openRecoveryCases,
    exceptions: orangeOrRed.map((o) => ({
      routeOccurrenceId: o.id,
      routeCode: o.route.routeCode,
      routeName: o.route.routeName,
      serviceDate: o.serviceDate,
      status: o.status,
      tiers: o.assignments.map((a) => ({ assignmentId: a.id, tier: a.commitmentRiskTier, type: a.assignmentType })),
    })),
  });
});

// ---------------------------------------------------------------------------
// Coverage Board — exception-focused, not a wall of green routes.
// ---------------------------------------------------------------------------

operatorRouter.get('/coverage-board', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const operatorId = req.auth!.operatorId!;
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const occurrences = await prisma.routeOccurrence.findMany({
    where: { serviceDate: date, route: { operatorId, ...branchFilter(req) } },
    include: { assignments: { include: { driver: true, checkpoints: true } }, route: true, backupArrangements: true, recoveryCases: true },
    orderBy: { scheduledStart: 'asc' },
  });

  res.json(
    occurrences.map((o) => ({
      routeOccurrenceId: o.id,
      routeCode: o.route.routeCode,
      routeName: o.route.routeName,
      criticality: o.route.criticality,
      scheduledStart: o.scheduledStart,
      status: o.status,
      assignments: o.assignments.map((a) => ({
        id: a.id,
        type: a.assignmentType,
        status: a.status,
        driverName: a.driver.name,
        tier: a.commitmentRiskTier,
        t24Status: a.t24Status,
      })),
      backupPrepared: o.backupArrangements.some((b) => b.status === 'ACCEPTED' || b.status === 'ACTIVATED'),
      recoveryOpen: o.recoveryCases.some((c) => !['RESOLVED', 'UNRESOLVED'].includes(c.status)),
    })),
  );
});

// ---------------------------------------------------------------------------
// Routes & Occurrences
// ---------------------------------------------------------------------------

const routeCreateSchema = z.object({
  shipperId: z.string().optional().nullable(),
  branchId: z.string(),
  routeCode: z.string(),
  routeName: z.string(),
  pickupArea: z.string(),
  deliveryArea: z.string(),
  scheduledStart: z.string(),
  estimatedCompletion: z.string(),
  estimatedMileage: z.number().optional(),
  estimatedStopCount: z.number().optional(),
  vehicleRequirements: z.array(z.string()).optional(),
  equipmentRequirements: z.array(z.string()).optional(),
  commodity: z.string().optional(),
  criticality: z.enum(['STANDARD', 'IMPORTANT', 'CRITICAL', 'STAT']).default('STANDARD'),
  recurringWeekdays: z.array(z.number()).optional(),
  compensation: z.record(z.any()).optional(),
  materialNotes: z.string().optional(),
  requiredCredentials: z.array(z.string()).optional(),
  shipperVisible: z.boolean().default(false),
});

operatorRouter.get('/routes', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const routes = await prisma.route.findMany({ where: { operatorId: req.auth!.operatorId!, ...branchFilter(req) }, orderBy: { routeCode: 'asc' } });
  res.json(routes);
});

operatorRouter.post('/routes', requireRole(...BRANCH_MGMT_ROLES), async (req, res) => {
  const parsed = routeCreateSchema.parse(req.body);
  const route = await prisma.route.create({
    data: {
      operatorId: req.auth!.operatorId!,
      shipperId: parsed.shipperId ?? null,
      branchId: parsed.branchId,
      routeCode: parsed.routeCode,
      routeName: parsed.routeName,
      pickupArea: parsed.pickupArea,
      deliveryArea: parsed.deliveryArea,
      scheduledStart: parsed.scheduledStart,
      estimatedCompletion: parsed.estimatedCompletion,
      estimatedMileage: parsed.estimatedMileage,
      estimatedStopCount: parsed.estimatedStopCount,
      vehicleRequirements: toJson(parsed.vehicleRequirements ?? []),
      equipmentRequirements: toJson(parsed.equipmentRequirements ?? []),
      commodity: parsed.commodity,
      criticality: parsed.criticality,
      recurringWeekdays: toJson(parsed.recurringWeekdays ?? []),
      compensation: toJson(parsed.compensation ?? {}),
      materialNotes: parsed.materialNotes,
      requiredCredentials: toJson(parsed.requiredCredentials ?? []),
      shipperVisibilitySettings: toJson({ visible: parsed.shipperVisible }),
    },
  });
  await ensureInitialRouteVersion(route.id, req.auth!.userId);
  res.status(201).json(route);
});

operatorRouter.get('/routes/:id', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const route = await prisma.route.findFirst({ where: { id: req.params.id, operatorId: req.auth!.operatorId! } });
  if (!route) return res.status(404).json({ error: 'Not found' });
  res.json(route);
});

operatorRouter.patch('/routes/:id', requireRole(...BRANCH_MGMT_ROLES), async (req, res) => {
  const route = await prisma.route.findFirst({ where: { id: req.params.id, operatorId: req.auth!.operatorId! } });
  if (!route) return res.status(404).json({ error: 'Not found' });
  const result = await applyMaterialRouteChange(route.id, req.body ?? {}, req.auth!.userId);
  res.json(result);
});

operatorRouter.get('/routes/:id/occurrences', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const occurrences = await prisma.routeOccurrence.findMany({
    where: { routeId: req.params.id, route: { operatorId: req.auth!.operatorId! } },
    include: { assignments: true },
    orderBy: { scheduledStart: 'asc' },
  });
  res.json(occurrences);
});

operatorRouter.post('/routes/:id/occurrences', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const route = await prisma.route.findFirst({ where: { id: req.params.id, operatorId: req.auth!.operatorId! } });
  if (!route) return res.status(404).json({ error: 'Not found' });
  const { serviceDate, scheduledStart, scheduledEnd } = req.body as { serviceDate: string; scheduledStart: string; scheduledEnd: string };
  const occurrence = await prisma.routeOccurrence.create({
    data: { routeId: route.id, serviceDate, scheduledStart: new Date(scheduledStart), scheduledEnd: new Date(scheduledEnd) },
  });
  res.status(201).json(occurrence);
});

// Route ownership
operatorRouter.post('/route-ownerships', requireRole(...BRANCH_MGMT_ROLES), async (req, res) => {
  const { routeId, driverId, weekdays, startDate, status } = req.body as { routeId: string; driverId: string; weekdays: number[]; startDate: string; status?: string };
  const ownership = await createRouteOwnership({ routeId, driverId, weekdays, startDate, status });
  res.status(201).json(ownership);
});

operatorRouter.post('/route-ownerships/:id/time-off', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { start, end, reason } = req.body as { start: string; end: string; reason: string };
  const ownership = await addPlannedTimeOff(req.params.id, { start, end, reason });
  res.json(ownership);
});

operatorRouter.post('/route-ownerships/:id/temporary-replacement', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { driverId, reason, expectedReturnDate } = req.body as { driverId: string; reason: string; expectedReturnDate: string };
  const ownership = await setTemporaryReplacement(req.params.id, { driverId, reason, expectedReturnDate });
  res.json(ownership);
});

// ---------------------------------------------------------------------------
// Drivers & Pools
// ---------------------------------------------------------------------------

operatorRouter.get('/drivers', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const drivers = await prisma.driver.findMany({ where: { operatorId: req.auth!.operatorId! }, orderBy: { name: 'asc' } });
  res.json(drivers.map((d) => ({ ...d, preferences: fromJson(d.preferences, {}), vehicleTypes: fromJson(d.vehicleTypes, []) })));
});

operatorRouter.post('/drivers', requireRole(...ADMIN_ROLES), async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const driver = await prisma.driver.create({
    data: {
      operatorId: req.auth!.operatorId!,
      name: b.name as string,
      phone: b.phone as string,
      timezone: (b.timezone as string) || 'America/New_York',
      vehicleTypes: toJson(b.vehicleTypes ?? []),
      equipment: toJson(b.equipment ?? []),
      serviceAreas: toJson(b.serviceAreas ?? []),
      preferences: toJson(b.preferences ?? {}),
      credentialSummary: toJson(b.credentialSummary ?? {}),
    },
  });
  res.status(201).json(driver);
});

operatorRouter.patch('/drivers/:id/consent', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { status, source, languageVersion } = req.body as { status: 'OPTED_IN' | 'OPTED_OUT'; source: string; languageVersion: string };
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: {
      smsConsentStatus: status,
      smsConsentAt: new Date(),
      smsConsentSource: source,
      smsConsentLanguageVersion: languageVersion,
      optOutAt: status === 'OPTED_OUT' ? new Date() : null,
    },
  });
  await writeAudit({ actorId: req.auth!.userId, operatorId: req.auth!.operatorId, entityType: 'Driver', entityId: driver.id, action: `CONSENT_${status}` });
  res.json(driver);
});

operatorRouter.get('/driver-pools', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const pools = await prisma.driverPool.findMany({ where: { operatorId: req.auth!.operatorId! }, include: { memberships: true } });
  res.json(pools);
});

operatorRouter.post('/driver-pools', requireRole(...ADMIN_ROLES), async (req, res) => {
  const { name, branchScope, shipperScope, routeTypeScope } = req.body as { name: string; branchScope?: string[]; shipperScope?: string[]; routeTypeScope?: string[] };
  const pool = await prisma.driverPool.create({
    data: { operatorId: req.auth!.operatorId!, name, branchScope: toJson(branchScope ?? []), shipperScope: toJson(shipperScope ?? []), routeTypeScope: toJson(routeTypeScope ?? []) },
  });
  res.status(201).json(pool);
});

operatorRouter.post('/driver-pools/:id/members', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { driverId } = req.body as { driverId: string };
  const membership = await prisma.driverPoolMembership.upsert({
    where: { poolId_driverId: { poolId: req.params.id, driverId } },
    create: { poolId: req.params.id, driverId, addedBy: req.auth!.userId },
    update: { status: 'ACTIVE' },
  });
  res.status(201).json(membership);
});

operatorRouter.delete('/driver-pools/:id/members/:driverId', requireRole(...DISPATCH_ROLES), async (req, res) => {
  await prisma.driverPoolMembership.update({
    where: { poolId_driverId: { poolId: req.params.id, driverId: req.params.driverId } },
    data: { status: 'REMOVED' },
  });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Assignments & Checkpoints
// ---------------------------------------------------------------------------

operatorRouter.post('/assignments/offer', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { routeOccurrenceId, driverId, assignmentType } = req.body as { routeOccurrenceId: string; driverId: string; assignmentType: 'PRIMARY' | 'BACKUP' | 'REPLACEMENT' };
  const assignment = await offerAssignment({ routeOccurrenceId, driverId, assignmentType });
  await scheduleCheckpointsForAssignment(assignment.id);
  res.status(201).json(assignment);
});

operatorRouter.post('/assignments/:id/decline', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const assignment = await recordDecline(req.params.id, req.body?.reason);
  res.json(assignment);
});

operatorRouter.get('/assignments/:id', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const assignment = await prisma.assignment.findUnique({
    where: { id: req.params.id },
    include: { driver: true, checkpoints: true, riskTierEvents: { orderBy: { timestamp: 'desc' }, take: 5 } },
  });
  if (!assignment) return res.status(404).json({ error: 'Not found' });
  res.json({ ...assignment, riskTierEvents: assignment.riskTierEvents.map((e) => ({ ...e, reasons: fromJson(e.reasons, []) })) });
});

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

operatorRouter.post('/backups', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const b = req.body as { routeOccurrenceId: string; driverId: string; arrangementType: string; availabilityWindow?: unknown; activationDeadline: string; incentive?: unknown };
  const arrangement = await createBackupOffer({
    routeOccurrenceId: b.routeOccurrenceId,
    driverId: b.driverId,
    arrangementType: b.arrangementType,
    availabilityWindow: b.availabilityWindow ?? {},
    activationDeadline: new Date(b.activationDeadline),
    incentive: b.incentive ?? {},
  });
  res.status(201).json(arrangement);
});

operatorRouter.post('/backups/:id/activate', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const arrangement = await prisma.backupArrangement.findUniqueOrThrow({ where: { id: req.params.id } });
  const result = await activateBackup({
    routeOccurrenceId: arrangement.routeOccurrenceId,
    backupArrangementId: arrangement.id,
    dispatcherId: req.auth!.userId,
    reason: (req.body?.reason as string) || 'Dispatcher-initiated activation',
  });
  res.json(result);
});

// ---------------------------------------------------------------------------
// Recovery Queue
// ---------------------------------------------------------------------------

operatorRouter.get('/recovery-queue', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const cases = await prisma.recoveryCase.findMany({
    where: { routeOccurrence: { route: { operatorId: req.auth!.operatorId!, ...branchFilter(req) } }, status: { notIn: ['RESOLVED', 'UNRESOLVED'] } },
    include: { routeOccurrence: { include: { route: true } }, candidates: true },
    orderBy: { openedAt: 'asc' },
  });
  res.json(
    cases.map((c) => ({
      id: c.id,
      routeCode: c.routeOccurrence.route.routeCode,
      routeName: c.routeOccurrence.route.routeName,
      criticality: c.routeOccurrence.route.criticality,
      serviceDate: c.routeOccurrence.serviceDate,
      scheduledStart: c.routeOccurrence.scheduledStart,
      status: c.status,
      trigger: c.trigger,
      dispatcherOwnerId: c.dispatcherOwnerId,
      candidates: c.candidates,
      elapsedSeconds: Math.round((Date.now() - c.openedAt.getTime()) / 1000),
    })),
  );
});

operatorRouter.post('/recovery-cases', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { routeOccurrenceId, originalAssignmentId, trigger } = req.body as { routeOccurrenceId: string; originalAssignmentId: string; trigger: string };
  const recoveryCase = await openRecoveryCase({ routeOccurrenceId, originalAssignmentId, trigger, dispatcherOwnerId: req.auth!.userId });
  res.status(201).json(recoveryCase);
});

operatorRouter.post('/recovery-cases/:id/candidates', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { driverId, matchFactors } = req.body as { driverId: string; matchFactors?: unknown };
  const candidate = await addRecoveryCandidate(req.params.id, driverId, matchFactors ?? {});
  res.status(201).json(candidate);
});

operatorRouter.patch('/recovery-candidates/:id', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { status } = req.body as { status: string };
  const candidate = await updateCandidateStatus(req.params.id, status);
  res.json(candidate);
});

operatorRouter.post('/recovery-cases/:id/source/:candidateId', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const replacement = await sourceReplacementFromCandidate(req.params.id, req.params.candidateId);
  res.status(201).json(replacement);
});

operatorRouter.post('/recovery-cases/:id/unresolved', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const recoveryCase = await markRecoveryCaseUnresolved(req.params.id);
  res.json(recoveryCase);
});

// ---------------------------------------------------------------------------
// Cancellations
// ---------------------------------------------------------------------------

const cancellationSchema = z.object({
  assignmentId: z.string(),
  classification: z.enum(['AVOIDABLE', 'UNAVOIDABLE']),
  category: z.enum(['ECONOMIC', 'INFORMATIONAL', 'LOGISTICAL', 'BEHAVIORAL', 'UNAVOIDABLE_EVENT']),
  structuredReason: z.string(),
  freeTextNote: z.string().optional(),
  selfReported: z.boolean().optional(),
});

operatorRouter.post('/cancellations', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const parsed = cancellationSchema.parse(req.body);
  const event = await recordCancellation({ ...parsed, reportedBy: req.auth!.userId });
  res.status(201).json(event);
});

operatorRouter.post('/cancellations/:assignmentId/outcome', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { outcome, shipperImpact, customerVisibleExplanation } = req.body as { outcome: 'ON_TIME' | 'LATE' | 'FAILED' | 'REASSIGNED'; shipperImpact?: string; customerVisibleExplanation?: string };
  await recordRouteOutcome(req.params.assignmentId, outcome, shipperImpact, customerVisibleExplanation);
  res.status(204).end();
});

operatorRouter.get('/cancellations', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const events = await prisma.cancellationEvent.findMany({
    where: { assignment: { routeOccurrence: { route: { operatorId: req.auth!.operatorId!, ...branchFilter(req) } } } },
    include: { assignment: { include: { driver: true, routeOccurrence: { include: { route: true } } } } },
    orderBy: { eventTimestamp: 'desc' },
    take: 200,
  });
  res.json(events);
});

// ---------------------------------------------------------------------------
// Shippers
// ---------------------------------------------------------------------------

operatorRouter.get('/shippers', requireRole(...BRANCH_MGMT_ROLES), async (req, res) => {
  const links = await prisma.operatorShipperRelationship.findMany({ where: { operatorId: req.auth!.operatorId! }, include: { shipper: true } });
  res.json(links);
});

// ---------------------------------------------------------------------------
// Reports / Metrics
// ---------------------------------------------------------------------------

operatorRouter.get('/metrics', requireRole(...DISPATCH_ROLES), async (req, res) => {
  const { branchId, shipperId, routeId, start, end } = req.query as Record<string, string>;
  const metrics = await computeReliabilityMetrics({
    operatorId: req.auth!.operatorId!,
    branchId: branchId || req.auth!.branchId || undefined,
    shipperId,
    routeId,
    startDate: start ? new Date(start) : new Date(Date.now() - 30 * 86400000),
    endDate: end ? new Date(end) : new Date(),
  });
  res.json(metrics);
});

operatorRouter.post('/scorecards/generate', requireRole(...BRANCH_MGMT_ROLES), async (req, res) => {
  const { shipperId, periodStart, periodEnd } = req.body as { shipperId: string; periodStart: string; periodEnd: string };
  const scorecard = await generateShipperScorecard({
    shipperId,
    operatorId: req.auth!.operatorId!,
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
  });
  res.status(201).json({ ...scorecard, metricsSnapshot: fromJson(scorecard.metricsSnapshot, {}) });
});

// ---------------------------------------------------------------------------
// Incentives
// ---------------------------------------------------------------------------

operatorRouter.get('/incentive-programs', requireRole(...BRANCH_MGMT_ROLES), async (req, res) => {
  const programs = await prisma.incentiveProgram.findMany({ where: { operatorId: req.auth!.operatorId! } });
  res.json(programs);
});

operatorRouter.post('/incentive-programs', requireRole(...ADMIN_ROLES), async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const program = await prisma.incentiveProgram.create({
    data: {
      operatorId: req.auth!.operatorId!,
      name: b.name as string,
      type: b.type as string,
      rules: toJson(b.rules ?? {}),
      amount: b.amount as number | undefined,
      nonCashBenefit: b.nonCashBenefit as string | undefined,
    },
  });
  res.status(201).json(program);
});

operatorRouter.get('/incentive-ledger', requireRole(...BRANCH_MGMT_ROLES), async (req, res) => {
  const entries = await prisma.incentiveLedgerEntry.findMany({
    where: { program: { operatorId: req.auth!.operatorId! } },
    include: { driver: true, program: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(entries);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

operatorRouter.get('/settings/risk-rules', requireRole(...ADMIN_ROLES), async (req, res) => {
  const versions = await prisma.riskRuleVersion.findMany({ where: { operatorId: req.auth!.operatorId! }, orderBy: { createdAt: 'desc' } });
  res.json(versions.map((v) => ({ ...v, rules: fromJson(v.rules, {}) })));
});

operatorRouter.post('/settings/risk-rules', requireRole(...ADMIN_ROLES), async (req, res) => {
  await prisma.riskRuleVersion.updateMany({ where: { operatorId: req.auth!.operatorId!, active: true }, data: { active: false } });
  const version = await prisma.riskRuleVersion.create({
    data: { operatorId: req.auth!.operatorId!, version: req.body.version, rules: toJson(req.body.rules ?? {}), createdBy: req.auth!.userId },
  });
  await writeAudit({ actorId: req.auth!.userId, operatorId: req.auth!.operatorId, entityType: 'RiskRuleVersion', entityId: version.id, action: 'RISK_RULES_UPDATED' });
  res.status(201).json(version);
});

// Dev/demo convenience: manually trigger the checkpoint scheduling/escalation tick.
operatorRouter.post('/tick', requireRole(...ADMIN_ROLES), async (_req, res) => {
  const result = await runCheckpointTick();
  res.json(result);
});
