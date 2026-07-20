import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import { executeInventoryCommandInTransaction, getInventoryInTransaction } from '../inventory/service.js';
import type { InventorySnapshot } from '../inventory/types.js';
import { HttpError } from '../middleware/httpError.js';
import { findFreshWorldPresenceByUsername, getFreshWorldPresence } from '../world/presence.js';
import { regionResourceProfileAt } from '../world/regionResourceProfiles.js';
import { assertOfferOwned, canonicalTradeOffer, tradeDeltas, TRADE_MAX_DISTANCE, type TradeOffer } from './domain.js';

const TRADE_SESSION_MS = 10 * 60_000;

interface TradeRow {
  id: string;
  initiatorUserId: string;
  targetUserId: string;
  initiatorName: string;
  targetName: string;
  initiatorOffer: unknown;
  targetOffer: unknown;
  initiatorRevision: number;
  targetRevision: number;
  initiatorAccepted: boolean;
  targetAccepted: boolean;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  completedAt: Date | null;
}

export interface PublicTradeSession {
  id: string;
  role: 'initiator' | 'target';
  initiatorName: string;
  targetName: string;
  initiatorOffer: TradeOffer;
  targetOffer: TradeOffer;
  initiatorAccepted: boolean;
  targetAccepted: boolean;
  status: 'pending' | 'completed' | 'cancelled' | 'expired';
  expiresAt: string;
  createdAt: string;
  completedAt: string | null;
}

function sessionStatus(row: TradeRow, now = new Date()): PublicTradeSession['status'] {
  if (row.status === 'pending' && row.expiresAt <= now) return 'expired';
  return row.status as PublicTradeSession['status'];
}

function publicTrade(row: TradeRow, userId: string): PublicTradeSession {
  return {
    id: row.id,
    role: row.initiatorUserId === userId ? 'initiator' : 'target',
    initiatorName: row.initiatorName,
    targetName: row.targetName,
    initiatorOffer: canonicalTradeOffer(row.initiatorOffer),
    targetOffer: canonicalTradeOffer(row.targetOffer),
    initiatorAccepted: row.initiatorAccepted,
    targetAccepted: row.targetAccepted,
    status: sessionStatus(row),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function assertTradePresence(userId: string, otherUserId: string): void {
  const actor = getFreshWorldPresence(userId);
  const other = getFreshWorldPresence(otherUserId);
  if (!actor || !other) throw new HttpError(409, 'both players must be connected to the overworld');
  if (actor.rx !== other.rx || actor.ry !== other.ry || Math.hypot(actor.x - other.x, actor.y - other.y) > TRADE_MAX_DISTANCE) {
    throw new HttpError(409, 'move closer to the other player');
  }
  if (regionResourceProfileAt(actor.rx, actor.ry).riskTier !== 'sanctuary') {
    throw new HttpError(409, 'direct player trade is available only in Sanctuary regions');
  }
}

async function tradeById(tx: Prisma.TransactionClient, tradeId: string, lock: boolean): Promise<TradeRow | undefined> {
  const lockSql = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty;
  const rows = await tx.$queryRaw<TradeRow[]>(Prisma.sql`
    SELECT t."id", t."initiatorUserId", t."targetUserId", iu."username" AS "initiatorName", tu."username" AS "targetName",
           t."initiatorOffer", t."targetOffer", t."initiatorRevision", t."targetRevision",
           t."initiatorAccepted", t."targetAccepted", t."status", t."expiresAt", t."createdAt", t."completedAt"
    FROM "PlayerTradeSession" t
    JOIN "User" iu ON iu."id" = t."initiatorUserId"
    JOIN "User" tu ON tu."id" = t."targetUserId"
    WHERE t."id" = ${tradeId}${lockSql}
  `);
  return rows[0];
}

function assertParticipant(row: TradeRow, userId: string): void {
  if (row.initiatorUserId !== userId && row.targetUserId !== userId) throw new HttpError(403, 'not a participant in this trade');
}

export async function listPlayerTrades(userId: string): Promise<{ trades: PublicTradeSession[] }> {
  const rows = await serializableTransaction((tx) => tx.$queryRaw<TradeRow[]>`
    SELECT t."id", t."initiatorUserId", t."targetUserId", iu."username" AS "initiatorName", tu."username" AS "targetName",
           t."initiatorOffer", t."targetOffer", t."initiatorRevision", t."targetRevision",
           t."initiatorAccepted", t."targetAccepted", t."status", t."expiresAt", t."createdAt", t."completedAt"
    FROM "PlayerTradeSession" t
    JOIN "User" iu ON iu."id" = t."initiatorUserId"
    JOIN "User" tu ON tu."id" = t."targetUserId"
    WHERE (t."initiatorUserId" = ${userId} OR t."targetUserId" = ${userId})
      AND (t."status" = 'pending' OR t."completedAt" > CURRENT_TIMESTAMP - INTERVAL '5 minutes')
    ORDER BY t."createdAt" DESC LIMIT 12
  `);
  return { trades: rows.map((row) => publicTrade(row, userId)) };
}

export async function createPlayerTrade(userId: string, targetUsername: string): Promise<{ trade: PublicTradeSession }> {
  const targetPresence = findFreshWorldPresenceByUsername(targetUsername);
  if (!targetPresence) throw new HttpError(404, 'target player is not online');
  if (targetPresence.userId === userId) throw new HttpError(409, 'cannot trade with yourself');
  assertTradePresence(userId, targetPresence.userId);
  return serializableTransaction(async (tx) => {
    const pairKey = [userId, targetPresence.userId].sort().join(':');
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${pairKey})::bigint) AS "locked"`;
    const existing = await tx.$queryRaw<TradeRow[]>`
      SELECT t."id", t."initiatorUserId", t."targetUserId", iu."username" AS "initiatorName", tu."username" AS "targetName",
             t."initiatorOffer", t."targetOffer", t."initiatorRevision", t."targetRevision",
             t."initiatorAccepted", t."targetAccepted", t."status", t."expiresAt", t."createdAt", t."completedAt"
      FROM "PlayerTradeSession" t
      JOIN "User" iu ON iu."id" = t."initiatorUserId" JOIN "User" tu ON tu."id" = t."targetUserId"
      WHERE t."status" = 'pending' AND t."expiresAt" > CURRENT_TIMESTAMP
        AND ((t."initiatorUserId" = ${userId} AND t."targetUserId" = ${targetPresence.userId})
          OR (t."initiatorUserId" = ${targetPresence.userId} AND t."targetUserId" = ${userId}))
      LIMIT 1
    `;
    if (existing[0]) return { trade: publicTrade(existing[0], userId) };
    const initiatorInventory = await getInventoryInTransaction(tx, userId, false);
    const targetInventory = await getInventoryInTransaction(tx, targetPresence.userId, false);
    const id = randomUUID();
    const emptyOffer = { crystals: 0, items: {} };
    const expiresAt = new Date(Date.now() + TRADE_SESSION_MS);
    await tx.$executeRaw`
      INSERT INTO "PlayerTradeSession"
        ("id", "initiatorUserId", "targetUserId", "initiatorOffer", "targetOffer", "initiatorRevision", "targetRevision",
         "initiatorAccepted", "targetAccepted", "status", "expiresAt", "createdAt", "updatedAt")
      VALUES
        (${id}, ${userId}, ${targetPresence.userId}, ${JSON.stringify(emptyOffer)}::jsonb, ${JSON.stringify(emptyOffer)}::jsonb,
         ${initiatorInventory.revision}, ${targetInventory.revision}, false, false, 'pending', ${expiresAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    const row = await tradeById(tx, id, false);
    if (!row) throw new Error('failed to create trade');
    return { trade: publicTrade(row, userId) };
  });
}

export async function updatePlayerTradeOffer(
  userId: string,
  tradeId: string,
  rawOffer: unknown,
  expectedRevision: number,
): Promise<{ trade: PublicTradeSession }> {
  const offer = canonicalTradeOffer(rawOffer);
  return serializableTransaction(async (tx) => {
    const row = await tradeById(tx, tradeId, true);
    if (!row) throw new HttpError(404, 'trade session was not found');
    assertParticipant(row, userId);
    if (sessionStatus(row) !== 'pending') throw new HttpError(409, 'trade session is no longer active');
    const otherUserId = row.initiatorUserId === userId ? row.targetUserId : row.initiatorUserId;
    assertTradePresence(userId, otherUserId);
    const inventory = await getInventoryInTransaction(tx, userId, true);
    if (inventory.revision !== expectedRevision) throw new HttpError(409, 'inventory revision mismatch');
    try { assertOfferOwned(inventory, offer); } catch (error) { throw new HttpError(409, error instanceof Error ? error.message : 'invalid trade offer'); }
    if (row.initiatorUserId === userId) {
      await tx.$executeRaw`
        UPDATE "PlayerTradeSession" SET "initiatorOffer" = ${JSON.stringify(offer)}::jsonb, "initiatorRevision" = ${inventory.revision},
          "initiatorAccepted" = false, "targetAccepted" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${tradeId}
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "PlayerTradeSession" SET "targetOffer" = ${JSON.stringify(offer)}::jsonb, "targetRevision" = ${inventory.revision},
          "initiatorAccepted" = false, "targetAccepted" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${tradeId}
      `;
    }
    const updated = await tradeById(tx, tradeId, false);
    if (!updated) throw new Error('failed to update trade offer');
    return { trade: publicTrade(updated, userId) };
  });
}

export async function acceptPlayerTrade(userId: string, tradeId: string, idempotencyKey: string): Promise<{ trade: PublicTradeSession; inventory: InventorySnapshot | null }> {
  return serializableTransaction(async (tx) => {
    const row = await tradeById(tx, tradeId, true);
    if (!row) throw new HttpError(404, 'trade session was not found');
    assertParticipant(row, userId);
    if (row.status === 'completed') return { trade: publicTrade(row, userId), inventory: await getInventoryInTransaction(tx, userId, false) };
    if (sessionStatus(row) !== 'pending') throw new HttpError(409, 'trade session is no longer active');
    const otherUserId = row.initiatorUserId === userId ? row.targetUserId : row.initiatorUserId;
    assertTradePresence(userId, otherUserId);
    const actorIsInitiator = row.initiatorUserId === userId;
    const initiatorAccepted = actorIsInitiator ? true : row.initiatorAccepted;
    const targetAccepted = actorIsInitiator ? row.targetAccepted : true;
    if (!initiatorAccepted || !targetAccepted) {
      await tx.$executeRaw`
        UPDATE "PlayerTradeSession" SET "initiatorAccepted" = ${initiatorAccepted}, "targetAccepted" = ${targetAccepted},
          "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${tradeId}
      `;
      const updated = await tradeById(tx, tradeId, false);
      if (!updated) throw new Error('failed to accept trade');
      return { trade: publicTrade(updated, userId), inventory: null };
    }

    const initiatorOffer = canonicalTradeOffer(row.initiatorOffer);
    const targetOffer = canonicalTradeOffer(row.targetOffer);
    const accountIds = [row.initiatorUserId, row.targetUserId].sort();
    let actorInventory: InventorySnapshot | null = null;
    for (const accountId of accountIds) {
      const initiator = accountId === row.initiatorUserId;
      const result = await executeInventoryCommandInTransaction(
        tx,
        accountId,
        'p2p_trade',
        { tradeId, side: initiator ? 'initiator' : 'target' },
        {
          expectedRevision: initiator ? row.initiatorRevision : row.targetRevision,
          idempotencyKey: `p2p-trade:${tradeId}:${initiator ? 'initiator' : 'target'}:${idempotencyKey}`,
        },
        (snapshot) => {
          try { assertOfferOwned(snapshot, initiator ? initiatorOffer : targetOffer); }
          catch (error) { throw new HttpError(409, error instanceof Error ? error.message : 'trade offer is no longer available'); }
          return { deltas: tradeDeltas(initiator ? initiatorOffer : targetOffer, initiator ? targetOffer : initiatorOffer) };
        },
      );
      if (accountId === userId) actorInventory = result.inventory;
    }
    await tx.$executeRaw`
      UPDATE "PlayerTradeSession" SET "initiatorAccepted" = true, "targetAccepted" = true, "status" = 'completed',
        "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${tradeId}
    `;
    const updated = await tradeById(tx, tradeId, false);
    if (!updated) throw new Error('failed to complete trade');
    return { trade: publicTrade(updated, userId), inventory: actorInventory };
  });
}

export async function cancelPlayerTrade(userId: string, tradeId: string): Promise<{ trade: PublicTradeSession }> {
  return serializableTransaction(async (tx) => {
    const row = await tradeById(tx, tradeId, true);
    if (!row) throw new HttpError(404, 'trade session was not found');
    assertParticipant(row, userId);
    if (row.status === 'completed') throw new HttpError(409, 'completed trade cannot be cancelled');
    if (row.status === 'pending') {
      await tx.$executeRaw`UPDATE "PlayerTradeSession" SET "status" = 'cancelled', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${tradeId}`;
    }
    const updated = await tradeById(tx, tradeId, false);
    if (!updated) throw new Error('failed to cancel trade');
    return { trade: publicTrade(updated, userId) };
  });
}
