// Internal service-to-service API — the sanctioned integration point for a
// future crypto/token layer. Deliberately narrow and separately
// authenticated (requireInternalApiKey, not requireAuth) so that layer:
//   - never needs a DB connection, JWT secret, or user session of its own
//     to talk to the game (a compromise of the game process can't leak
//     wallet keys or exchange credentials it never had),
//   - and the game process never needs to trust anything from that layer
//     beyond what these specific, validated, idempotent endpoints allow (a
//     compromise of the crypto layer can only call these endpoints, not
//     reach the game's database or user sessions directly).
// See CLAUDE.md's "Internal service API" section for the full rationale
// and what's still a v1 scaffold (no mTLS/HMAC, no IP allowlist yet).
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { serializableTransaction } from '../db/transaction.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { HttpError } from '../middleware/httpError.js';
import { requireInternalApiKey } from './middleware.js';
import { ledgerAdjustSchema } from './schema.js';

export const internalRouter = Router();

internalRouter.use(requireInternalApiKey);

internalRouter.get(
  '/users/:userId/balance',
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, 'unknown userId');
    const redZone = await prisma.redZonePlayer.findUnique({ where: { userId } });
    res.json({ userId, username: user.username, redZoneCrystals: redZone?.crystals ?? 0 });
  }),
);

async function applyRedZoneLedgerEntry(userId: string, amount: number, idempotencyKey: string): Promise<{ balance: number; replay: boolean }> {
  const existing = await prisma.internalLedgerEntry.findUnique({ where: { idempotencyKey } });
  if (existing) {
    // the amount must match too — a reused key carrying a different amount
    // is a caller bug, not a retry, and silently answering "replay" would
    // hide that the second amount was never applied
    if (existing.kind !== 'redzone_credit' || existing.targetId !== userId || existing.amount !== amount) {
      throw new HttpError(409, 'idempotencyKey was already used for a different operation');
    }
    return { balance: existing.resultBalance, replay: true };
  }

  try {
    const balance = await serializableTransaction(async (tx) => {
      await tx.redZonePlayer.upsert({ where: { userId }, create: { userId, crystals: 0 }, update: {} });
      if (amount < 0) {
        const changed = await tx.redZonePlayer.updateMany({
          where: { userId, crystals: { gte: -amount } },
          data: { crystals: { increment: amount } },
        });
        if (changed.count === 0) throw new HttpError(409, 'insufficient balance');
      } else if (amount > 0) {
        await tx.redZonePlayer.update({ where: { userId }, data: { crystals: { increment: amount } } });
      }
      const row = await tx.redZonePlayer.findUniqueOrThrow({ where: { userId } });
      await tx.internalLedgerEntry.create({
        data: { idempotencyKey, kind: 'redzone_credit', targetId: userId, amount, resultBalance: row.crystals },
      });
      return row.crystals;
    });
    return { balance, replay: false };
  } catch (err) {
    // lost a race against a concurrent call carrying the same idempotency
    // key (two retries of the same logical operation arriving together) —
    // treat it exactly like a sequential replay instead of erroring
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const row = await prisma.internalLedgerEntry.findUnique({ where: { idempotencyKey } });
      if (row) {
        if (row.kind !== 'redzone_credit' || row.targetId !== userId || row.amount !== amount) {
          throw new HttpError(409, 'idempotencyKey was already used for a different operation');
        }
        return { balance: row.resultBalance, replay: true };
      }
    }
    throw err;
  }
}

// credits (positive amount) or debits (negative amount) a user's Red Zone
// balance — the balance most naturally mapped to a future token economy,
// since it's already an isolated, separately-persisted number (see
// RedZonePlayer's schema comment). Never touches SaveGame/player.loot.
internalRouter.post(
  '/users/:userId/redzone-credit',
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { amount, idempotencyKey } = ledgerAdjustSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, 'unknown userId');

    const result = await applyRedZoneLedgerEntry(userId, amount, idempotencyKey);
    res.json({ userId, ...result });
  }),
);
