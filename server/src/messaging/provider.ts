export interface SendResult {
  providerMessageId: string;
  status: 'SENT' | 'FAILED';
}

/**
 * SMS provider abstraction. Any real provider (Twilio, etc.) implements this
 * interface; the rest of the app never talks to a vendor SDK directly.
 */
export interface SmsProvider {
  send(input: { to: string; body: string; idempotencyKey: string }): Promise<SendResult>;
  verifyWebhookSignature(headers: Record<string, string | string[] | undefined>, rawBody: string): boolean;
}
