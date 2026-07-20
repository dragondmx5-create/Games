import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

export interface AccessPayload extends jwt.JwtPayload {
  sub: string; // userId
  sid: string; // RefreshToken row id: the revocable access-session id
}

export function signAccessToken(userId: string, sessionId: string): string {
  const options: jwt.SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  };
  return jwt.sign({ sub: userId, sid: sessionId } satisfies AccessPayload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }) as AccessPayload;
}

// Refresh tokens are opaque random strings, not JWTs — the raw value only ever
// lives in the httpOnly cookie; the DB stores a sha256 hash of it (RefreshToken
// .tokenHash) so a DB leak alone can't be replayed as a working token.
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiry(): Date {
  const days = env.JWT_REFRESH_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
