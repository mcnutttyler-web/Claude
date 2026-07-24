import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { operatorRouter } from './routes/operator.js';
import { shipperRouter } from './routes/shipper.js';
import { driverRouter } from './routes/driver.js';
import { webhookRouter } from './routes/webhooks.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/operator', operatorRouter);
  app.use('/api/shipper', shipperRouter);
  app.use('/api/driver', driverRouter);
  app.use('/api/webhooks', webhookRouter);
  app.use('/api/admin', adminRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(400).json({ error: message });
  });

  return app;
}
