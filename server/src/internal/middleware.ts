import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';

// Separate trust boundary from requireAuth (auth/middleware.ts): this checks
// a static shared secret meant for a *service* (a future crypto/token
// layer), never a user's session cookie/JWT. The two must never be
// interchangeable — a leaked user access token must not grant internal API
// access, and vice versa a leaked INTERNAL_API_KEY must not act as any
// particular user (every internal route takes an explicit target id, it
// never reads req.userId).
export function requireInternalApiKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header('x-internal-api-key');
  if (!provided || !timingSafeEqualStrings(provided, env.INTERNAL_API_KEY)) {
    res.status(401).json({ error: 'invalid or missing internal API key' });
    return;
  }
  next();
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // lengths differ -> not equal, but still do a same-size timingSafeEqual
  // call so the branch itself doesn't leak the length via timing beyond
  // what an attacker could already learn from the response
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
