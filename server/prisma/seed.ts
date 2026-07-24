/* eslint-disable no-console */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';
import { toJson } from '../src/domain/json.js';
import { createRouteOwnership, addPlannedTimeOff, setTemporaryReplacement, updateStreakOnOccurrenceOutcome } from '../src/domain/ownership.js';
import { offerAssignment, recordAcceptance, recordDecline, ensureInitialRouteVersion } from '../src/domain/fullDisclosure.js';
import { scheduleCheckpointsForAssignment, recordT24Response } from '../src/domain/checkpoints.js';
import { createBackupOffer, respondToBackupOffer, activateBackup } from '../src/domain/backups.js';
import { recordCancellation } from '../src/domain/cancellations.js';
import { openRecoveryCase, addRecoveryCandidate, sourceReplacementFromCandidate } from '../src/domain/recovery.js';
import { generateShipperScorecard } from '../src/domain/metrics.js';
import { evaluateAssignmentRisk } from '../src/domain/riskEngine.js';

const PASSWORD_HASH = bcrypt.hashSync('password123', 8);
const DAY = 86_400_000;

function daysFromNow(offset: number): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const FIRST_NAMES = ['Marcus', 'Elena', 'Dwayne', 'Priya', 'Sam', 'Yuki', 'Carlos', 'Fatima', 'Owen', 'Renee', 'Tobias', 'Nadia', 'Jesse', 'Ling', 'Andre', 'Kayla', 'Mateo', 'Sasha', 'Derek', 'Bianca', 'Rashid', 'Wendy', 'Cole', 'Ines', 'Trevor', 'Amara', 'Nico', 'Gwen', 'Leon', 'Tamsin', 'Victor', 'Paula'];
const LAST_NAMES = ['Hall', 'Rivera', 'Boone', 'Chandra', 'Osei', 'Tanaka', 'Reyes', 'Haddad', 'Brennan', 'Okafor', 'Weiss', 'Farouk', 'Lund', 'Zhou', 'Park', 'Meyer', 'Silva', 'Novak', 'Grant', 'Cruz', 'Malik', 'Foster', 'Ibarra', 'Doyle', 'Kessler', 'Adeyemi', 'Ferro', 'Locke', 'Marsh', 'Blythe', 'Cabrera', 'Whitfield'];

async function main() {
  console.log('Seeding RoutePilot...');

  await prisma.platformOrganization.deleteMany();
  await prisma.platformOrganization.create({ data: { name: 'RoutePilot Platform' } });

  // ---------------------------------------------------------------------
  // Operators, branches, shippers
  // ---------------------------------------------------------------------
  const metro = await prisma.operatorOrganization.create({
    data: { name: 'Metro Express Logistics', timezone: 'America/New_York' },
  });
  const summit = await prisma.operatorOrganization.create({
    data: { name: 'Summit Regional Courier', timezone: 'America/Denver' },
  });

  const metroNorth = await prisma.operatorBranch.create({ data: { operatorId: metro.id, name: 'Northgate Branch', market: 'Boston Metro', timezone: 'America/New_York' } });
  const metroRiver = await prisma.operatorBranch.create({ data: { operatorId: metro.id, name: 'Riverside Branch', market: 'Providence', timezone: 'America/New_York' } });
  const summitHighland = await prisma.operatorBranch.create({ data: { operatorId: summit.id, name: 'Highland Branch', market: 'Denver Metro', timezone: 'America/Denver' } });

  const cascade = await prisma.shipperOrganization.create({ data: { name: 'Cascade Medical Labs', industry: 'Clinical Diagnostics', timezone: 'America/New_York', pilotStatus: 'intervention' } });
  const brightpath = await prisma.shipperOrganization.create({ data: { name: 'BrightPath Pharmacy Supply', industry: 'Pharmaceutical Distribution', timezone: 'America/Denver', pilotStatus: 'baseline' } });

  await prisma.operatorShipperRelationship.create({ data: { operatorId: metro.id, shipperId: cascade.id, contractReference: 'MEL-CML-2025', visibilitySettings: toJson({ scorecards: true }) } });
  await prisma.operatorShipperRelationship.create({ data: { operatorId: metro.id, shipperId: brightpath.id, contractReference: 'MEL-BPS-2025' } });
  await prisma.operatorShipperRelationship.create({ data: { operatorId: summit.id, shipperId: cascade.id, contractReference: 'SRC-CML-2025' } });

  // ---------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------
  const users = [
    { email: 'platform.admin@routepilot.dev', name: 'Priya Nair', organizationType: 'PLATFORM', role: 'PLATFORM_ADMIN', operatorId: null, shipperId: null, branchId: null },
    { email: 'admin@metroexpress.dev', name: 'Diane Ostrowski', organizationType: 'OPERATOR', role: 'OPERATOR_ADMIN', operatorId: metro.id, shipperId: null, branchId: null },
    { email: 'branchmgr.north@metroexpress.dev', name: 'Harold Jimenez', organizationType: 'OPERATOR', role: 'BRANCH_MANAGER', operatorId: metro.id, shipperId: null, branchId: metroNorth.id },
    { email: 'dispatch.north@metroexpress.dev', name: 'Selena Marks', organizationType: 'OPERATOR', role: 'DISPATCHER', operatorId: metro.id, shipperId: null, branchId: metroNorth.id },
    { email: 'dispatch.river@metroexpress.dev', name: 'Todd Ellison', organizationType: 'OPERATOR', role: 'DISPATCHER', operatorId: metro.id, shipperId: null, branchId: metroRiver.id },
    { email: 'admin@summitregional.dev', name: 'Anh Pham', organizationType: 'OPERATOR', role: 'OPERATOR_ADMIN', operatorId: summit.id, shipperId: null, branchId: null },
    { email: 'dispatch.highland@summitregional.dev', name: 'Marcus Delgado', organizationType: 'OPERATOR', role: 'DISPATCHER', operatorId: summit.id, shipperId: null, branchId: summitHighland.id },
    { email: 'admin@cascademedical.dev', name: 'Jordan Blake', organizationType: 'SHIPPER', role: 'SHIPPER_ADMIN', operatorId: null, shipperId: cascade.id, branchId: null },
    { email: 'viewer@cascademedical.dev', name: 'Alicia Woo', organizationType: 'SHIPPER', role: 'SHIPPER_VIEWER', operatorId: null, shipperId: cascade.id, branchId: null },
    { email: 'admin@brightpathpharma.dev', name: 'Grace Sullivan', organizationType: 'SHIPPER', role: 'SHIPPER_ADMIN', operatorId: null, shipperId: brightpath.id, branchId: null },
  ];
  for (const u of users) {
    await prisma.user.create({ data: { ...u, passwordHash: PASSWORD_HASH } });
  }

  // ---------------------------------------------------------------------
  // Drivers (32 total)
  // ---------------------------------------------------------------------
  const timezones = ['America/New_York', 'America/Chicago', 'America/Denver'];
  const vehicleOptions = [['CARGO_VAN'], ['BOX_TRUCK'], ['SPRINTER_VAN'], ['CARGO_VAN', 'SPRINTER_VAN']];
  const driverRecords: { id: string; operatorId: string; name: string }[] = [];

  for (let i = 0; i < 32; i++) {
    const operator = i < 18 ? metro : summit;
    const name = `${FIRST_NAMES[i]} ${LAST_NAMES[i]}`;
    const consentRoll = i % 10;
    const smsConsentStatus = consentRoll === 9 ? 'OPTED_OUT' : consentRoll === 8 ? 'PENDING' : 'OPTED_IN';
    const driver = await prisma.driver.create({
      data: {
        operatorId: operator.id,
        name,
        phone: `+1555${String(1000000 + i).slice(-7)}`,
        timezone: timezones[i % timezones.length],
        vehicleTypes: toJson(vehicleOptions[i % vehicleOptions.length]),
        equipment: toJson(i % 3 === 0 ? ['LIFTGATE'] : []),
        serviceAreas: toJson([operator.id === metro.id ? 'Boston Metro' : 'Denver Metro']),
        preferences: toJson({
          preferredWeekdays: [1, 2, 3, 4, 5],
          maxMileage: 120 + (i % 5) * 20,
          minCompensation: 90 + (i % 6) * 10,
          backupWorkPreference: i % 4 === 0,
          requiredLeadTimeHours: 12,
        }),
        credentialSummary: toJson({ backgroundCheck: 'CLEAR' }),
        smsConsentStatus,
        smsConsentAt: smsConsentStatus !== 'PENDING' ? new Date() : null,
        smsConsentSource: smsConsentStatus !== 'PENDING' ? 'ONBOARDING_FORM' : null,
        smsConsentLanguageVersion: 'v1',
        optOutAt: smsConsentStatus === 'OPTED_OUT' ? new Date() : null,
      },
    });
    driverRecords.push({ id: driver.id, operatorId: operator.id, name });

    if (i % 5 === 0) {
      await prisma.driverCredential.create({ data: { driverId: driver.id, type: 'Medical Courier Certification', status: 'VERIFIED', verificationSource: 'Operator upload', verifiedBy: 'ops-admin' } });
    }
  }

  const metroDrivers = driverRecords.filter((d) => d.operatorId === metro.id);
  const summitDrivers = driverRecords.filter((d) => d.operatorId === summit.id);

  // ---------------------------------------------------------------------
  // Driver pools
  // ---------------------------------------------------------------------
  async function makePool(operatorId: string, name: string, members: string[]) {
    const pool = await prisma.driverPool.create({ data: { operatorId, name } });
    for (const driverId of members) {
      await prisma.driverPoolMembership.create({ data: { poolId: pool.id, driverId } });
    }
    return pool;
  }
  await makePool(metro.id, 'Preferred Drivers', metroDrivers.slice(0, 6).map((d) => d.id));
  await makePool(metro.id, 'Medical-Qualified Drivers', metroDrivers.filter((_, i) => i % 5 === 0).map((d) => d.id));
  await makePool(metro.id, 'Backup Drivers', metroDrivers.slice(10, 16).map((d) => d.id));
  await makePool(metro.id, 'Trial Drivers', metroDrivers.slice(16).map((d) => d.id));
  await makePool(summit.id, 'Preferred Drivers', summitDrivers.slice(0, 5).map((d) => d.id));
  await makePool(summit.id, 'Backup Drivers', summitDrivers.slice(8, 12).map((d) => d.id));
  await makePool(summit.id, 'Do Not Offer', summitDrivers.slice(-1).map((d) => d.id));

  // ---------------------------------------------------------------------
  // Routes (22 total)
  // ---------------------------------------------------------------------
  const criticalities = ['STANDARD', 'STANDARD', 'IMPORTANT', 'IMPORTANT', 'CRITICAL', 'STAT'];
  const areas = ['Downtown', 'Harborview', 'Westside', 'Uptown', 'Airport District', 'Industrial Park', 'Suburban Loop'];

  interface RouteSeed { id: string; operatorId: string; branchId: string; ownerDriverId: string; weekdays: number[] }
  const routeSeeds: RouteSeed[] = [];

  const routePlans = [
    ...Array.from({ length: 14 }, (_, i) => ({ operator: metro, branch: i % 2 === 0 ? metroNorth : metroRiver, shipperId: i % 3 === 0 ? cascade.id : i % 3 === 1 ? brightpath.id : null, idx: i })),
    ...Array.from({ length: 8 }, (_, i) => ({ operator: summit, branch: summitHighland, shipperId: i % 2 === 0 ? cascade.id : null, idx: i })),
  ];

  let driverCursor = 0;
  for (let r = 0; r < routePlans.length; r++) {
    const plan = routePlans[r];
    const pool = plan.operator.id === metro.id ? metroDrivers : summitDrivers;
    const owner = pool[driverCursor % pool.length];
    driverCursor++;
    const criticality = criticalities[r % criticalities.length];
    const weekdays = criticality === 'STAT' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];

    const route = await prisma.route.create({
      data: {
        operatorId: plan.operator.id,
        branchId: plan.branch.id,
        shipperId: plan.shipperId,
        routeCode: `${plan.operator.id === metro.id ? 'MEL' : 'SRC'}-${100 + r}`,
        routeName: `${areas[r % areas.length]} Route ${100 + r}`,
        pickupArea: `${plan.branch.market} Distribution Center`,
        deliveryArea: areas[r % areas.length],
        scheduledStart: criticality === 'STAT' ? '05:30' : '07:30',
        estimatedCompletion: criticality === 'STAT' ? '09:00' : '13:00',
        estimatedMileage: 40 + r * 3,
        estimatedStopCount: 8 + (r % 6),
        vehicleRequirements: toJson(['CARGO_VAN']),
        equipmentRequirements: toJson(criticality === 'CRITICAL' || criticality === 'STAT' ? ['LIFTGATE'] : []),
        commodity: plan.shipperId === cascade.id ? 'Clinical specimens' : plan.shipperId === brightpath.id ? 'Pharmaceuticals' : 'General freight',
        criticality,
        recurringWeekdays: toJson(weekdays),
        compensation: toJson({ base: 110 + r * 4, unit: 'per_route', paymentTiming: 'weekly_settlement' }),
        materialNotes: criticality === 'STAT' ? 'Time-critical specimen chain-of-custody route.' : null,
        requiredCredentials: toJson(plan.shipperId === cascade.id ? ['Medical Courier Certification'] : []),
        shipperVisibilitySettings: toJson({ visible: !!plan.shipperId }),
      },
    });
    await ensureInitialRouteVersion(route.id, 'seed');

    const ownership = await createRouteOwnership({ routeId: route.id, driverId: owner.id, weekdays, startDate: isoDate(daysFromNow(-120)), status: r % 6 === 0 ? 'TRIAL' : 'ACTIVE' });
    // Give a handful of routes a long earned-down streak.
    if (r % 4 === 0) {
      await prisma.routeOwnership.update({ where: { id: ownership.id }, data: { routeStreak: 9, checkpointLevel: 'EARNED_DOWN' } });
    }
    if (r === 2) {
      await addPlannedTimeOff(ownership.id, { start: isoDate(daysFromNow(10)), end: isoDate(daysFromNow(14)), reason: 'Planned vacation' });
    }
    if (r === 3) {
      const replacementDriver = pool[(driverCursor + 3) % pool.length];
      await setTemporaryReplacement(ownership.id, { driverId: replacementDriver.id, reason: 'Medical leave', expectedReturnDate: isoDate(daysFromNow(21)) });
    }

    routeSeeds.push({ id: route.id, operatorId: plan.operator.id, branchId: plan.branch.id, ownerDriverId: owner.id, weekdays });
  }

  console.log(`Created ${routeSeeds.length} routes.`);

  // ---------------------------------------------------------------------
  // Route occurrences over a 14-day window, with a subset fully simulated
  // ---------------------------------------------------------------------
  let simulatedCount = 0;
  let bareCount = 0;
  const scenarioCycle = ['CLEAN_ACCEPT_CONFIRMED', 'CLEAN_ACCEPT_CONFIRMED', 'ORANGE_MISSED_CHECKPOINT', 'OFFER_PENDING_YELLOW', 'DECLINED_RED', 'AVOIDABLE_CANCELLATION', 'UNAVOIDABLE_CANCELLATION', 'STILL_OPEN_RECOVERY'];
  let scenarioIndex = 0;
  let avoidableCancellationCounter = 0;

  for (const routeSeed of routeSeeds) {
    const pool = routeSeed.operatorId === metro.id ? metroDrivers : summitDrivers;
    let simulatedForRoute = 0;

    for (let dayOffset = -7; dayOffset <= 6; dayOffset++) {
      const date = daysFromNow(dayOffset);
      if (!routeSeed.weekdays.includes(date.getDay())) continue;

      const route = await prisma.route.findUniqueOrThrow({ where: { id: routeSeed.id } });
      const [h, m] = route.scheduledStart.split(':').map(Number);
      const scheduledStart = new Date(date);
      scheduledStart.setHours(h, m, 0, 0);
      const scheduledEnd = new Date(scheduledStart.getTime() + 5 * 3_600_000);

      const occurrence = await prisma.routeOccurrence.create({
        data: { routeId: routeSeed.id, serviceDate: isoDate(date), scheduledStart, scheduledEnd },
      });

      const shouldSimulate = dayOffset <= 3 && simulatedForRoute < 3;
      if (!shouldSimulate) {
        bareCount++;
        continue;
      }
      simulatedForRoute++;
      simulatedCount++;

      const scenario = scenarioCycle[scenarioIndex % scenarioCycle.length];
      scenarioIndex++;

      const assignment = await offerAssignment({ routeOccurrenceId: occurrence.id, driverId: routeSeed.ownerDriverId, assignmentType: 'PRIMARY' });
      await scheduleCheckpointsForAssignment(assignment.id);

      if (scenario === 'DECLINED_RED') {
        await recordDecline(assignment.id, 'Requested compensation change');
        continue;
      }

      if (scenario === 'OFFER_PENDING_YELLOW') {
        continue; // leave OFFERED — yellow tier
      }

      await recordAcceptance(assignment.id, { channel: dayOffset % 2 === 0 ? 'SMS' : 'SECURE_LINK' });

      if (scenario === 'CLEAN_ACCEPT_CONFIRMED') {
        const t24 = await prisma.checkpoint.findFirst({ where: { assignmentId: assignment.id, checkpointType: 'T24_RECONFIRM' } });
        if (t24) await recordT24Response(t24.id, 'YES');
        if (dayOffset < 0) {
          await prisma.assignment.update({ where: { id: assignment.id }, data: { status: 'COMPLETED', startedAt: scheduledStart, completedAt: scheduledEnd } });
          await prisma.routeOccurrence.update({ where: { id: occurrence.id }, data: { status: 'COMPLETED' } });
          await updateStreakOnOccurrenceOutcome({ routeId: routeSeed.id, driverId: routeSeed.ownerDriverId, outcome: 'ORIGINAL_STARTED_ON_TIME' });
          await evaluateAssignmentRisk(assignment.id);
        }
        continue;
      }

      if (scenario === 'ORANGE_MISSED_CHECKPOINT') {
        const cp = await prisma.checkpoint.findFirst({ where: { assignmentId: assignment.id, checkpointType: 'T24_RECONFIRM' } });
        if (cp) {
          await prisma.checkpoint.update({ where: { id: cp.id }, data: { sentAt: new Date(Date.now() - 4 * 3_600_000), escalationStatus: 'ESCALATED' } });
          await evaluateAssignmentRisk(assignment.id);
        }
        continue;
      }

      if (scenario === 'AVOIDABLE_CANCELLATION' || scenario === 'UNAVOIDABLE_CANCELLATION') {
        const isAvoidable = scenario === 'AVOIDABLE_CANCELLATION';
        const categories: Array<'ECONOMIC' | 'INFORMATIONAL' | 'LOGISTICAL' | 'BEHAVIORAL'> = ['ECONOMIC', 'INFORMATIONAL', 'LOGISTICAL', 'BEHAVIORAL'];
        const category = isAvoidable ? categories[avoidableCancellationCounter++ % categories.length] : 'UNAVOIDABLE_EVENT';
        const reasons: Record<string, string> = {
          ECONOMIC: 'Better-paying opportunity',
          INFORMATIONAL: 'Route requirements misunderstood',
          LOGISTICAL: 'Vehicle issue',
          BEHAVIORAL: 'Stopped responding',
          UNAVOIDABLE_EVENT: 'Illness',
        };
        await recordCancellation({
          assignmentId: assignment.id,
          classification: isAvoidable ? 'AVOIDABLE' : 'UNAVOIDABLE',
          category: category as 'ECONOMIC' | 'INFORMATIONAL' | 'LOGISTICAL' | 'BEHAVIORAL' | 'UNAVOIDABLE_EVENT',
          structuredReason: reasons[category],
          freeTextNote: 'Recorded by dispatcher during seed simulation.',
          reportedBy: 'seed-dispatcher',
        });

        const recoveryCase = await prisma.recoveryCase.findFirst({ where: { routeOccurrenceId: occurrence.id, status: { notIn: ['RESOLVED', 'UNRESOLVED'] } } });
        if (recoveryCase) {
          if (simulatedCount % 2 === 0) {
            const backupDriver = pool[(driverCursor + simulatedCount) % pool.length];
            const backup = await createBackupOffer({
              routeOccurrenceId: occurrence.id,
              driverId: backupDriver.id,
              arrangementType: 'PRIORITY_ACCESS',
              availabilityWindow: { start: '06:00', end: '10:00' },
              activationDeadline: new Date(scheduledStart.getTime() - 2 * 3_600_000),
              incentive: { type: 'priority_access' },
            });
            await respondToBackupOffer(backup.id, 'ACCEPTED');
            await activateBackup({ routeOccurrenceId: occurrence.id, backupArrangementId: backup.id, dispatcherId: 'seed-dispatcher', reason: reasons[category] });
          } else {
            const candidateDriver = pool[(driverCursor + simulatedCount + 1) % pool.length];
            const candidate = await addRecoveryCandidate(recoveryCase.id, candidateDriver.id, { vehicleEligible: true, serviceAreaMatch: true });
            await sourceReplacementFromCandidate(recoveryCase.id, candidate.id);
          }
        }
        continue;
      }

      if (scenario === 'STILL_OPEN_RECOVERY') {
        await recordCancellation({
          assignmentId: assignment.id,
          classification: 'AVOIDABLE',
          category: 'BEHAVIORAL',
          structuredReason: 'Overslept',
          reportedBy: 'seed-dispatcher',
        });
        // Intentionally left open in the Recovery Queue for demo purposes.
      }
    }
  }

  console.log(`Created ${simulatedCount} fully simulated occurrences and ${bareCount} scheduled-only occurrences.`);

  // ---------------------------------------------------------------------
  // Incentive programs + ledger
  // ---------------------------------------------------------------------
  const metroIncentive = await prisma.incentiveProgram.create({
    data: { operatorId: metro.id, name: 'Standby Priority Bonus', type: 'ACTIVATION_BONUS', rules: toJson({ amountPerActivation: 40 }), amount: 40 },
  });
  const summitIncentive = await prisma.incentiveProgram.create({
    data: { operatorId: summit.id, name: 'Named Backup Standby', type: 'STANDBY', rules: toJson({ amountPerWeek: 25 }), amount: 25 },
  });
  const activatedBackups = await prisma.backupArrangement.findMany({ where: { status: 'ACTIVATED' }, take: 10 });
  for (const b of activatedBackups) {
    const program = metroDrivers.some((d) => d.id === b.driverId) ? metroIncentive : summitIncentive;
    await prisma.incentiveLedgerEntry.create({
      data: { driverId: b.driverId, programId: program.id, status: 'EARNED', amount: program.amount ?? 0 },
    });
  }

  // ---------------------------------------------------------------------
  // Shipper scorecards
  // ---------------------------------------------------------------------
  await generateShipperScorecard({ shipperId: cascade.id, operatorId: metro.id, periodStart: daysFromNow(-30), periodEnd: daysFromNow(0) });
  await generateShipperScorecard({ shipperId: cascade.id, operatorId: summit.id, periodStart: daysFromNow(-30), periodEnd: daysFromNow(0) });
  await generateShipperScorecard({ shipperId: brightpath.id, operatorId: metro.id, periodStart: daysFromNow(-30), periodEnd: daysFromNow(0) });

  console.log('\nSeed complete. Demo logins (password: "password123"):');
  for (const u of users) console.log(`  ${u.role.padEnd(16)} ${u.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
