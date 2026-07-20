import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';
import { originIsAllowed, parseBrowserOrigins } from './browserOrigins.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Browser cookies may be SameSite=None when the game and API use different
 * origins. CORS only controls response visibility; it does not stop a forged
 * cross-site POST or WebSocket upgrade from reaching the server. */
export function isTrustedBrowserOrigin(
  origin: string | undefined,
  expectedOrigins: string | readonly string[],
  production: boolean,
): boolean {
  if (!origin) return !production;
  const allowed = typeof expectedOrigins === 'string' ? parseBrowserOrigins(expectedOrigins) : expectedOrigins;
  return originIsAllowed(origin, allowed);
}

export function requireBrowserMutationOrigin(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || req.path.startsWith('/internal/')) {
    next();
    return;
  }
  if (!isTrustedBrowserOrigin(req.header('origin'), env.CORS_ORIGIN, env.NODE_ENV === 'production')) {
    res.status(403).json({ error: 'untrusted request origin' });
    return;
  }
  next();
}
