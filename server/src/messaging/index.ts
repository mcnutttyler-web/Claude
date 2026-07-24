import type { SmsProvider } from './provider.js';
import { fakeSmsProvider } from './fakeProvider.js';

// Twilio (or any future provider) would be wired in here behind the same
// SmsProvider interface, selected via SMS_PROVIDER env var. Only the fake
// provider is implemented today so the app runs without paid credentials.
export function getSmsProvider(): SmsProvider {
  const kind = process.env.SMS_PROVIDER || 'fake';
  switch (kind) {
    case 'fake':
    default:
      return fakeSmsProvider;
  }
}
