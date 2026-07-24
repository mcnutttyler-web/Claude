import { Router } from 'express';
import { getSmsProvider } from '../messaging/index.js';
import { handleInboundSms } from '../domain/messagingService.js';

export const webhookRouter = Router();

// Inbound SMS webhook (STOP/START/HELP + checkpoint replies). The fake
// provider trusts all requests in dev; a real provider's verifyWebhookSignature
// would reject anything not actually sent by the carrier.
webhookRouter.post('/sms/inbound', async (req, res) => {
  const provider = getSmsProvider();
  const valid = provider.verifyWebhookSignature(req.headers, JSON.stringify(req.body));
  if (!valid) return res.status(401).json({ error: 'Invalid webhook signature' });

  const { from, body } = req.body as { from: string; body: string };
  const result = await handleInboundSms({ fromPhone: from, body });
  res.json(result);
});
