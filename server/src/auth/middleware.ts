import { NextFunction, Request, Response } from 'express';
import { validateAccessToken } from './session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      authSessionId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'not authenticated' });
    return;
  }
  void validateAccessToken(token)
    .then((session) => {
      if (!session) {
        res.status(401).json({ error: 'invalid, expired, or revoked access token' });
        return;
      }
      req.userId = session.userId;
      req.authSessionId = session.sessionId;
      next();
    })
    .catch(next);
}
