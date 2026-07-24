import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedScenario } from './helpers.js';
import { handleInboundSms, sendDriverMessage } from '../src/domain/messagingService.js';
import { offerAssignment } from '../src/domain/fullDisclosure.js';
import { fakeSmsProvider } from '../src/messaging/fakeProvider.js';

beforeEach(async () => {
  await resetDb();
  fakeSmsProvider.outbox = [];
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('opt-out handling', () => {
  it('STOP immediately opts a driver out and blocks further automated messages', async () => {
    const s = await seedScenario();
    await offerAssignment({ routeOccurrenceId: s.occurrence.id, driverId: s.driver.id, assignmentType: 'PRIMARY' });

    const result = await handleInboundSms({ fromPhone: s.driver.phone, body: 'STOP' });
    expect(result).toMatchObject({ handled: true, intent: 'OPT_OUT' });

    const driver = await prisma.driver.findUniqueOrThrow({ where: { id: s.driver.id } });
    expect(driver.smsConsentStatus).toBe('OPTED_OUT');
    expect(driver.optOutAt).toBeTruthy();

    const outcome = await sendDriverMessage({ driverId: s.driver.id, template: 'T24_RECONFIRM', bodyBuilder: () => 'test' });
    expect(outcome).toEqual({ sent: false, reason: 'OPTED_OUT' });
  });

  it('START re-enables messaging after an opt-out', async () => {
    const s = await seedScenario();
    await handleInboundSms({ fromPhone: s.driver.phone, body: 'STOP' });
    await handleInboundSms({ fromPhone: s.driver.phone, body: 'START' });

    const driver = await prisma.driver.findUniqueOrThrow({ where: { id: s.driver.id } });
    expect(driver.smsConsentStatus).toBe('OPTED_IN');
    expect(driver.optOutAt).toBeNull();
  });

  it('never sends to a driver who has not opted in', async () => {
    const s = await seedScenario();
    await prisma.driver.update({ where: { id: s.driver.id }, data: { smsConsentStatus: 'PENDING' } });
    const outcome = await sendDriverMessage({ driverId: s.driver.id, template: 'T24_RECONFIRM', bodyBuilder: () => 'test' });
    expect(outcome).toEqual({ sent: false, reason: 'NO_CONSENT' });
  });
});
