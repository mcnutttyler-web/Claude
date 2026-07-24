import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type AuthTokenPayload } from './jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    req.auth = verifyToken(header.slice('Bearer '.length));
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden for this role' });
    }
    next();
  };
}

/** Tenant isolation: caller must be scoped to the operator org they operate under. */
export function requireOperatorScope(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.organizationType !== 'OPERATOR' || !req.auth.operatorId) {
    return res.status(403).json({ error: 'Operator scope required' });
  }
  next();
}

/** Tenant isolation: caller must be scoped to the shipper org they operate under. */
export function requireShipperScope(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.organizationType !== 'SHIPPER' || !req.auth.shipperId) {
    return res.status(403).json({ error: 'Shipper scope required' });
  }
  next();
}
