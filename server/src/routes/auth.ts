import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { signToken } from '../auth/jwt.js';

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials payload' });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken({
    userId: user.id,
    organizationType: user.organizationType as 'PLATFORM' | 'OPERATOR' | 'SHIPPER',
    operatorId: user.operatorId,
    shipperId: user.shipperId,
    branchId: user.branchId,
    role: user.role,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationType: user.organizationType,
      operatorId: user.operatorId,
      shipperId: user.shipperId,
      branchId: user.branchId,
    },
  });
});
