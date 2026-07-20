import { prisma } from '../db.js';
import { verifyAccessToken, type AccessPayload } from './jwt.js';

export interface AuthenticatedAccessSession {
  userId: string;
  sessionId: string;
  expiresAtMs: number;
}

export async function validateAccessToken(token: string): Promise<AuthenticatedAccessSession | null> {
  let payload: AccessPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return null;
  }
  if (!payload.sub || !payload.sid || !payload.exp) return null;
  const session = await prisma.refreshToken.findFirst({
    where: {
      id: payload.sid,
      userId: payload.sub,
      revoked: false,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return session ? { userId: payload.sub, sessionId: payload.sid, expiresAtMs: payload.exp * 1_000 } : null;
}
