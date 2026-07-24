import type { SendResult, SmsProvider } from './provider.js';

interface OutboxEntry {
  to: string;
  body: string;
  idempotencyKey: string;
  sentAt: Date;
}

/**
 * Local, credential-free SMS provider for dev/test/demo. Messages are logged
 * and kept in an in-memory outbox instead of hitting a real carrier, so
 * RoutePilot runs end-to-end with zero paid dependencies.
 */
export class FakeSmsProvider implements SmsProvider {
  private sent = new Map<string, OutboxEntry>();
  public outbox: OutboxEntry[] = [];

  async send(input: { to: string; body: string; idempotencyKey: string }): Promise<SendResult> {
    const existing = this.sent.get(input.idempotencyKey);
    if (existing) {
      // Idempotent replay: don't double-send.
      return { providerMessageId: input.idempotencyKey, status: 'SENT' };
    }
    const entry: OutboxEntry = { ...input, sentAt: new Date() };
    this.sent.set(input.idempotencyKey, entry);
    this.outbox.push(entry);
    // eslint-disable-next-line no-console
    console.log(`[fake-sms] -> ${input.to}: ${input.body}`);
    return { providerMessageId: input.idempotencyKey, status: 'SENT' };
  }

  verifyWebhookSignature(): boolean {
    // No signature scheme for the local fake provider; always trusted in dev.
    return true;
  }
}

export const fakeSmsProvider = new FakeSmsProvider();
