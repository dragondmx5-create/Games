import type { Prisma } from '@prisma/client';
import { HttpError } from '../middleware/httpError.js';

export async function activePvpSessionId(tx: Prisma.TransactionClient, userId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PvpSession"
    WHERE "userId" = ${userId} AND "status" IN ('active', 'death_pending')
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function assertInventoryNotLockedByPvp(
  tx: Prisma.TransactionClient,
  userId: string,
  allowedSessionId?: string,
): Promise<void> {
  const active = await activePvpSessionId(tx, userId);
  if (active && active !== allowedSessionId) throw new HttpError(409, 'canonical inventory is locked by an active PvP session');
}
