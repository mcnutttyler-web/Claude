import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('PLATFORM_ADMIN'));

adminRouter.get('/organizations', async (_req, res) => {
  const [operators, shippers] = await Promise.all([
    prisma.operatorOrganization.findMany({ include: { branches: true } }),
    prisma.shipperOrganization.findMany(),
  ]);
  res.json({ operators, shippers });
});

adminRouter.get('/audit-log', async (req, res) => {
  const { entityType, entityId } = req.query as Record<string, string>;
  const events = await prisma.auditEvent.findMany({
    where: { ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) },
    orderBy: { timestamp: 'desc' },
    take: 200,
  });
  res.json(events);
});

// shipper_pilot_mode feature flag: baseline vs intervention period reporting (section 27).
adminRouter.post('/feature-flags/shipper-pilot-mode', async (req, res) => {
  const { shipperId, pilotStatus } = req.body as { shipperId: string; pilotStatus: 'none' | 'baseline' | 'intervention' };
  const shipper = await prisma.shipperOrganization.update({ where: { id: shipperId }, data: { pilotStatus } });
  res.json(shipper);
});
