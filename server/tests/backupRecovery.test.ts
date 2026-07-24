import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedScenario } from './helpers.js';
import { offerAssignment, recordAcceptance } from '../src/domain/fullDisclosure.js';
import { recordCancellation } from '../src/domain/cancellations.js';
import { createBackupOffer, respondToBackupOffer, activateBackup } from '../src/domain/backups.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setUpCanceledRouteWithAcceptedBackup() {
  const s = await seedScenario();
  const primary = await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });
  await recordAcceptance(primary.id, { channel: 'SMS' });

  const backupDriver = await prisma.driver.create({
    data: { operatorId: s.operatorA.id, name: 'Backup Driver', phone: '+15551230099', smsConsentStatus: 'OPTED_IN', smsConsentAt: new Date() },
  });
  const backup = await createBackupOffer({
    routeOccurrenceId: s.occurrence.id,
    driverId: backupDriver.id,
    arrangementType: 'NAMED_UNPAID',
    availabilityWindow: {},
    activationDeadline: new Date('2026-08-01T10:00:00Z'),
    incentive: {},
  });
  await respondToBackupOffer(backup.id, 'ACCEPTED');

  await recordCancellation({
    assignmentId: primary.id,
    classification: 'AVOIDABLE',
    category: 'BEHAVIORAL',
    structuredReason: 'Stopped responding',
    reportedBy: 'test-dispatcher',
  });

  return { s, primary, backup, backupDriver };
}

describe('recovery case lifecycle', () => {
  it('opens a recovery case automatically when the primary driver cancels', async () => {
    const { s } = await setUpCanceledRouteWithAcceptedBackup();
    const recoveryCase = await prisma.recoveryCase.findFirst({ where: { routeOccurrenceId: s.occurrence.id } });
    expect(recoveryCase).toBeTruthy();
    expect(recoveryCase!.status).not.toBe('RESOLVED');
  });
});

describe('backup activation', () => {
  it('creates a replacement assignment and preserves the original assignment untouched', async () => {
    const { s, primary, backup, backupDriver } = await setUpCanceledRouteWithAcceptedBackup();

    const { replacementAssignment } = await activateBackup({
      routeOccurrenceId: s.occurrence.id,
      backupArrangementId: backup.id,
      dispatcherId: 'test-dispatcher',
      reason: 'Primary canceled',
    });

    expect(replacementAssignment.assignmentType).toBe('REPLACEMENT');
    expect(replacementAssignment.driverId).toBe(backupDriver.id);
    expect(replacementAssignment.originalAssignmentId).toBe(primary.id);

    const originalStillExists = await prisma.assignment.findUniqueOrThrow({ where: { id: primary.id } });
    expect(originalStillExists.status).toBe('CANCELED');
    expect(originalStillExists.id).toBe(primary.id);

    const occurrence = await prisma.routeOccurrence.findUniqueOrThrow({ where: { id: s.occurrence.id } });
    expect(occurrence.recoveryLocked).toBe(true);
  });

  it('refuses a second activation attempt on an already-locked occurrence', async () => {
    const { s, backup } = await setUpCanceledRouteWithAcceptedBackup();
    await activateBackup({ routeOccurrenceId: s.occurrence.id, backupArrangementId: backup.id, dispatcherId: 'd1', reason: 'first' });

    const secondBackupDriver = await prisma.driver.create({
      data: { operatorId: s.operatorA.id, name: 'Second Backup', phone: '+15551230098', smsConsentStatus: 'OPTED_IN', smsConsentAt: new Date() },
    });
    const secondBackup = await createBackupOffer({
      routeOccurrenceId: s.occurrence.id,
      driverId: secondBackupDriver.id,
      arrangementType: 'NAMED_UNPAID',
      availabilityWindow: {},
      activationDeadline: new Date('2026-08-01T10:00:00Z'),
      incentive: {},
    });
    await respondToBackupOffer(secondBackup.id, 'ACCEPTED');

    await expect(
      activateBackup({ routeOccurrenceId: s.occurrence.id, backupArrangementId: secondBackup.id, dispatcherId: 'd2', reason: 'duplicate attempt' }),
    ).rejects.toThrow(/already locked/i);
  });
});
