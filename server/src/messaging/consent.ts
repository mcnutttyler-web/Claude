import type { Driver } from '@prisma/client';
import { fromJson } from '../domain/json.js';
import { InboundKeywords } from '../domain/enums.js';

interface QuietHours {
  start: string; // "HH:mm" local
  end: string; // "HH:mm" local, may wrap past midnight
}

/** True if `atUtc` falls within the driver's configured quiet hours, in the driver's local timezone. */
export function isWithinQuietHours(driver: Pick<Driver, 'quietHours' | 'timezone'>, atUtc: Date): boolean {
  const quiet = fromJson<QuietHours>(driver.quietHours, { start: '21:00', end: '07:00' });
  const local = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: driver.timezone,
  }).format(atUtc);
  const [h, m] = local.split(':').map(Number);
  const minutesNow = h * 60 + m;
  const [sh, sm] = quiet.start.split(':').map(Number);
  const [eh, em] = quiet.end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return minutesNow >= startMin && minutesNow < endMin;
  }
  // Wraps past midnight, e.g. 21:00 -> 07:00
  return minutesNow >= startMin || minutesNow < endMin;
}

export function canSendAutomatedMessage(driver: Pick<Driver, 'smsConsentStatus' | 'optOutAt'>): boolean {
  return driver.smsConsentStatus === 'OPTED_IN' && !driver.optOutAt;
}

export type InboundIntent = 'OPT_OUT' | 'OPT_IN' | 'HELP' | 'CHECKPOINT_RESPONSE';

export function classifyInbound(body: string): InboundIntent {
  const normalized = body.trim().toUpperCase();
  if (InboundKeywords.OPT_OUT.includes(normalized)) return 'OPT_OUT';
  if (InboundKeywords.OPT_IN.includes(normalized)) return 'OPT_IN';
  if (InboundKeywords.HELP.includes(normalized)) return 'HELP';
  return 'CHECKPOINT_RESPONSE';
}
