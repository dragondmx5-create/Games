import { prisma } from '../db.js';

// RefreshToken rows are never deleted on rotation/logout, only marked
// revoked — otherwise this table grows forever with no way to reclaim
// space. Truly expired rows are deleted right away; revoked-but-not-yet-
// expired rows are kept for a day first so the reuse-detection check in
// auth/routes.ts (a revoked token being presented again is a token-theft
// signal) still has something to see shortly after a rotation, not just
// "unknown token" for anything more than a few hours old.
const REVOKED_RETENTION_MS = 24 * 60 * 60 * 1000;

export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const now = new Date();
  const result = await prisma.refreshToken.deleteMany({
    where: {
      // retention is measured from when `revoked` flipped (updatedAt, same
      // field the /refresh reuse check reads) — NOT createdAt: tokens live
      // for days before rotation, so keying off createdAt deleted most rows
      // minutes after revocation and silently disabled reuse detection
      OR: [{ expiresAt: { lt: now } }, { revoked: true, updatedAt: { lt: new Date(now.getTime() - REVOKED_RETENTION_MS) } }],
    },
  });
  return result.count;
}

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export function startRefreshTokenCleanup(): ReturnType<typeof setInterval> {
  let inFlight: Promise<void> | null = null;
  const run = (): void => {
    if (inFlight) return;
    inFlight = cleanupExpiredRefreshTokens()
      .then(() => undefined)
      .catch((error: unknown) => console.error('Refresh-token cleanup failed', error))
      .finally(() => { inFlight = null; });
  };
  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}
