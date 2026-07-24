import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export interface AuthTokenPayload {
  userId: string;
  organizationType: 'PLATFORM' | 'OPERATOR' | 'SHIPPER';
  operatorId: string | null;
  shipperId: string | null;
  branchId: string | null;
  role: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '12h' });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, SECRET) as AuthTokenPayload;
}

// Short-lived, single-purpose signed tokens for driver secure links.
// Distinct secret usage (same key, different payload shape) so these can
// never be replayed as operator/shipper session tokens.
export interface SecureLinkPayload {
  purpose: 'DRIVER_LINK';
  driverId: string;
  messageId: string;
}

export function signSecureLink(payload: SecureLinkPayload, expiresInSeconds: number): string {
  return jwt.sign(payload, SECRET, { expiresIn: expiresInSeconds });
}

export function verifySecureLink(token: string): SecureLinkPayload {
  const decoded = jwt.verify(token, SECRET) as SecureLinkPayload;
  if (decoded.purpose !== 'DRIVER_LINK') throw new Error('Invalid token purpose');
  return decoded;
}
