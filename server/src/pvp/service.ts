import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import { prisma } from '../db.js';
import { getFreshWorldPresence, suspendWorldPresence } from '../world/presence.js';
import { getOrCreateWorldSeed } from '../world/service.js';
import {
  canonicalPortalById,
  normalizeCanonicalOverworldPosition,
} from '../world/overworldTopology.js';
import { regionResourceProfileAt } from '../world/regionResourceProfiles.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from '../world/resourceLayout.js';
import { getInventoryInTransaction, executeInventoryCommandInTransaction } from '../inventory/service.js';
import type { InventoryCommandResult, InventorySnapshot } from '../inventory/types.js';
import { getPlayerCombatStateInTransaction } from '../combat/service.js';
import { HttpError } from '../middleware/httpError.js';
import { capitalRegionForLand, planPvpDeathSettlement, pvpRoomKey, type PvpRiskTier } from './domain.js';
import { isInsidePvpExtraction, PVP_EXTRACTION_IDLE_MS, pvpArenaForRoom } from './arena.js';

const GATE_USE_RADIUS = 34;
const PROCESS_OWNER_ID = randomUUID();
const ROOM_LEASE_MS = 30_000;
const CENTER = (RESOURCE_REGION_SIZE * RESOURCE_TILE_SIZE) / 2;

type LiveExitGuard = (sessionId: string) => boolean;
let liveExitGuard: LiveExitGuard | null = null;

type PvpStatus = 'active' | 'death_pending' | 'exited' | 'dead';

export interface PvpSessionRow {
  id: string;
  userId: string;
  roomKey: string;
  gateId: string;
  riskTier: PvpRiskTier;
  status: PvpStatus;
  admissionToken: string;
  inventoryRevision: number;
  carriedSnapshot: unknown;
  sourceRx: number;
  sourceRy: number;
  sourceX: number;
  sourceY: number;
  returnRx: number;
  returnRy: number;
  returnX: number;
  returnY: number;
  hp: number;
  maxHp: number;
  playerX: number;
  playerY: number;
  playerFacing: number;
  basicReadyAt: Date | null;
  abilityReadyAt: Date | null;
  lastMoveAt: Date;
  deathToken: string | null;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
}

interface CommandRow { requestHash: string; result: unknown }

export interface PublicPvpSession {
  sessionId: string;
  roomKey: string;
  gateId: string;
  riskTier: PvpRiskTier;
  status: PvpStatus;
  admissionToken: string;
  inventoryRevision: number;
  carriedInventory: InventorySnapshot;
  hp: number;
  maxHp: number;
  player: { x: number; y: number; facing: number };
  source: { rx: number; ry: number; x: number; y: number };
  returnPosition: { rx: number; ry: number; x: number; y: number };
  deathToken?: string;
  createdAt: string;
}

export interface PvpAdmissionResponse {
  replayed: boolean;
  pvp: PublicPvpSession;
}

export interface PvpReturnResponse {
  replayed: boolean;
  sessionId: string;
  status: 'exited' | 'dead';
  position: { rx: number; ry: number; x: number; y: number };
  inventory: InventorySnapshot;
}

export interface PvpDeathReceiptResponse {
  victimSessionId: string;
  killerSessionId: string;
  riskTier: PvpRiskTier;
  transferred: Record<string, number>;
  destroyed: Record<string, number>;
  vaultCrystals: number;
  victimInventory: InventorySnapshot;
  killerInventory: InventorySnapshot;
  deathToken: string;
}

function commandHash(kind: string, payload: unknown): string {
  return createHash('sha256').update(JSON.stringify({ kind, payload })).digest('hex');
}

function parseInventory(value: unknown): InventorySnapshot {
  const snapshot = value as InventorySnapshot;
  if (!snapshot || !Number.isSafeInteger(snapshot.revision) || !snapshot.stacks || typeof snapshot.stacks !== 'object') {
    throw new Error('invalid canonical inventory snapshot in PvP session');
  }
  return snapshot;
}

function publicSession(row: PvpSessionRow): PublicPvpSession {
  return {
    sessionId: row.id,
    roomKey: row.roomKey,
    gateId: row.gateId,
    riskTier: row.riskTier,
    status: row.status,
    admissionToken: row.admissionToken,
    inventoryRevision: row.inventoryRevision,
    carriedInventory: parseInventory(row.carriedSnapshot),
    hp: row.hp,
    maxHp: row.maxHp,
    player: { x: row.playerX, y: row.playerY, facing: row.playerFacing },
    source: { rx: row.sourceRx, ry: row.sourceRy, x: row.sourceX, y: row.sourceY },
    returnPosition: { rx: row.returnRx, ry: row.returnRy, x: row.returnX, y: row.returnY },
    ...(row.deathToken ? { deathToken: row.deathToken } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function replayCommand<T extends object>(row: CommandRow | undefined, hash: string): (T & { replayed: boolean }) | null {
  if (!row) return null;
  if (row.requestHash !== hash) throw new HttpError(409, 'idempotency key was already used with a different PvP command');
  return { ...(row.result as T), replayed: true };
}

async function findCommand(tx: Prisma.TransactionClient, userId: string, idempotencyKey: string): Promise<CommandRow | undefined> {
  const rows = await tx.$queryRaw<CommandRow[]>`
    SELECT "requestHash", "result" FROM "PvpCommand"
    WHERE "userId" = ${userId} AND "idempotencyKey" = ${idempotencyKey}
  `;
  return rows[0];
}

async function storeCommand(
  tx: Prisma.TransactionClient,
  userId: string,
  sessionId: string | null,
  idempotencyKey: string,
  kind: string,
  hash: string,
  result: unknown,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "PvpCommand" ("id", "userId", "sessionId", "idempotencyKey", "kind", "requestHash", "result", "createdAt")
    VALUES (${randomUUID()}, ${userId}, ${sessionId}, ${idempotencyKey}, ${kind}, ${hash}, ${JSON.stringify(result)}::jsonb, CURRENT_TIMESTAMP)
  `;
}

async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  if (!rows[0]) throw new HttpError(404, 'user not found');
}

async function activeSession(tx: Prisma.TransactionClient, userId: string, lock = false): Promise<PvpSessionRow | null> {
  const lockClause = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty;
  const rows = await tx.$queryRaw<PvpSessionRow[]>(Prisma.sql`
    SELECT "id", "userId", "roomKey", "gateId", "riskTier", "status", "admissionToken", "inventoryRevision",
           "carriedSnapshot", "sourceRx", "sourceRy", "sourceX", "sourceY", "returnRx", "returnRy", "returnX", "returnY",
           "hp", "maxHp", "playerX", "playerY", "playerFacing", "basicReadyAt", "abilityReadyAt", "lastMoveAt",
           "deathToken", "createdAt", "updatedAt", "endedAt"
    FROM "PvpSession" WHERE "userId" = ${userId} AND "status" IN ('active', 'death_pending')
    ORDER BY "createdAt" DESC LIMIT 1${lockClause}
  `);
  return rows[0] ?? null;
}

async function lockSession(tx: Prisma.TransactionClient, userId: string, sessionId: string): Promise<PvpSessionRow> {
  const rows = await tx.$queryRaw<PvpSessionRow[]>`
    SELECT "id", "userId", "roomKey", "gateId", "riskTier", "status", "admissionToken", "inventoryRevision",
           "carriedSnapshot", "sourceRx", "sourceRy", "sourceX", "sourceY", "returnRx", "returnRy", "returnX", "returnY",
           "hp", "maxHp", "playerX", "playerY", "playerFacing", "basicReadyAt", "abilityReadyAt", "lastMoveAt",
           "deathToken", "createdAt", "updatedAt", "endedAt"
    FROM "PvpSession" WHERE "id" = ${sessionId} AND "userId" = ${userId} FOR UPDATE
  `;
  if (!rows[0]) throw new HttpError(404, 'PvP session not found');
  return rows[0];
}

async function hasBlockingDungeon(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "DungeonRun" WHERE "userId" = ${userId} AND "status" IN ('active', 'death_pending') LIMIT 1
  `;
  return Boolean(rows[0]);
}

async function acquireRoomLease(tx: Prisma.TransactionClient, roomKey: string): Promise<void> {
  const expiresAt = new Date(Date.now() + ROOM_LEASE_MS);
  const rows = await tx.$queryRaw<Array<{ roomKey: string }>>`
    INSERT INTO "PvpRoomLease" ("roomKey", "ownerId", "leaseExpiresAt", "updatedAt")
    VALUES (${roomKey}, ${PROCESS_OWNER_ID}, ${expiresAt}, CURRENT_TIMESTAMP)
    ON CONFLICT ("roomKey") DO UPDATE
      SET "ownerId" = EXCLUDED."ownerId", "leaseExpiresAt" = EXCLUDED."leaseExpiresAt", "updatedAt" = CURRENT_TIMESTAMP
      WHERE "PvpRoomLease"."ownerId" = ${PROCESS_OWNER_ID} OR "PvpRoomLease"."leaseExpiresAt" < CURRENT_TIMESTAMP
    RETURNING "roomKey"
  `;
  if (!rows[0]) throw new HttpError(503, 'PvP region room is owned by another server; retry through the assigned room');
}

async function assertRoomLeaseOwnedInTransaction(tx: Prisma.TransactionClient, roomKey: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ roomKey: string }>>`
    SELECT "roomKey" FROM "PvpRoomLease"
    WHERE "roomKey" = ${roomKey} AND "ownerId" = ${PROCESS_OWNER_ID} AND "leaseExpiresAt" > CURRENT_TIMESTAMP
    FOR UPDATE
  `;
  if (!rows[0]) throw new HttpError(503, 'authoritative PvP room ownership is unavailable');
}


export async function claimPvpRoomLease(roomKey: string): Promise<void> {
  await serializableTransaction((tx) => acquireRoomLease(tx, roomKey));
}

export async function renewPvpRoomLease(roomKey: string): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ROOM_LEASE_MS);
  const count = await prisma.$executeRaw`
    UPDATE "PvpRoomLease" SET "leaseExpiresAt" = ${expiresAt}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "roomKey" = ${roomKey} AND "ownerId" = ${PROCESS_OWNER_ID}
  `;
  return count === 1;
}

export async function releasePvpRoomLease(roomKey: string): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "PvpRoomLease" WHERE "roomKey" = ${roomKey} AND "ownerId" = ${PROCESS_OWNER_ID}
  `;
}

export function registerPvpLiveExitGuard(guard: LiveExitGuard): void {
  liveExitGuard = guard;
}

export async function assertPvpRoomOwned(roomKey: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ roomKey: string }>>`
    SELECT "roomKey" FROM "PvpRoomLease"
    WHERE "roomKey" = ${roomKey} AND "ownerId" = ${PROCESS_OWNER_ID} AND "leaseExpiresAt" > CURRENT_TIMESTAMP
  `;
  if (!rows[0]) throw new HttpError(503, 'PvP region room lease is unavailable');
}

export async function getActivePvpSession(userId: string): Promise<PublicPvpSession | null> {
  return serializableTransaction(async (tx) => {
    const row = await activeSession(tx, userId, false);
    return row ? publicSession(row) : null;
  });
}

export async function admitPvp(
  userId: string,
  input: { gateId: string; idempotencyKey: string },
): Promise<PvpAdmissionResponse> {
  const kind = 'pvp_admit';
  const payload = { gateId: input.gateId };
  const hash = commandHash(kind, payload);

  // Admission retries must replay even though the successful first request
  // has already removed overworld presence. This read happens before any
  // gate capability check, then repeats after the user row lock below.
  const replay = await serializableTransaction(async (tx) => replayCommand<PvpAdmissionResponse>(
    await findCommand(tx, userId, input.idempotencyKey),
    hash,
  ));
  if (replay) return replay;

  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'fresh authoritative overworld presence is required at the PvP gate');
  const worldSeed = await getOrCreateWorldSeed();
  const portal = canonicalPortalById(worldSeed, presence.rx, presence.ry, input.gateId);
  if (!portal || (portal.kind !== 'red-gate' && portal.kind !== 'black-gate')) throw new HttpError(403, 'the requested PvP gate is not in the current region');
  if (Math.hypot(presence.x - portal.x, presence.y - portal.y) > GATE_USE_RADIUS) throw new HttpError(403, 'move closer to the authoritative PvP gate');
  const riskTier: PvpRiskTier = portal.kind === 'red-gate' ? 'fracture' : 'lost';
  const roomKey = pvpRoomKey(worldSeed, portal.id, riskTier);

  const response = await serializableTransaction(async (tx) => {
    const early = replayCommand<PvpAdmissionResponse>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (early) return early;
    await lockUser(tx, userId);
    const lockedReplay = replayCommand<PvpAdmissionResponse>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (lockedReplay) return lockedReplay;
    if (await activeSession(tx, userId, true)) throw new HttpError(409, 'an authoritative PvP session is already active');
    if (await hasBlockingDungeon(tx, userId)) throw new HttpError(409, 'exit or settle the active Dungeon before entering PvP');

    const live = getFreshWorldPresence(userId);
    if (!live || live.ws !== presence.ws || live.rx !== presence.rx || live.ry !== presence.ry
      || Math.hypot(live.x - portal.x, live.y - portal.y) > GATE_USE_RADIUS) {
      throw new HttpError(409, 'authoritative gate presence changed during admission');
    }

    await acquireRoomLease(tx, roomKey);
    const inventory = await getInventoryInTransaction(tx, userId, true);
    const combat = await getPlayerCombatStateInTransaction(tx, userId);
    if (combat.dead) throw new HttpError(409, 'settle the existing death before entering PvP');

    const capital = capitalRegionForLand(regionResourceProfileAt(live.rx, live.ry).landId);
    const safeReturn = normalizeCanonicalOverworldPosition(worldSeed, { ...capital, x: CENTER, y: CENTER });
    const sessionId = randomUUID();
    const admissionToken = randomUUID();
    const arenaSpawn = pvpArenaForRoom(roomKey).spawn;
    const rows = await tx.$queryRaw<PvpSessionRow[]>`
      INSERT INTO "PvpSession"
        ("id", "userId", "roomKey", "gateId", "riskTier", "status", "admissionToken", "inventoryRevision", "carriedSnapshot",
         "sourceRx", "sourceRy", "sourceX", "sourceY", "returnRx", "returnRy", "returnX", "returnY",
         "hp", "maxHp", "playerX", "playerY", "playerFacing", "lastMoveAt", "createdAt", "updatedAt")
      VALUES
        (${sessionId}, ${userId}, ${roomKey}, ${portal.id}, ${riskTier}, 'active', ${admissionToken}, ${inventory.revision},
         ${JSON.stringify(inventory)}::jsonb, ${live.rx}, ${live.ry}, ${live.x}, ${live.y},
         ${safeReturn.rx}, ${safeReturn.ry}, ${safeReturn.x}, ${safeReturn.y}, ${combat.hp}, ${combat.maxHp},
         ${arenaSpawn.x}, ${arenaSpawn.y}, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING "id", "userId", "roomKey", "gateId", "riskTier", "status", "admissionToken", "inventoryRevision",
                "carriedSnapshot", "sourceRx", "sourceRy", "sourceX", "sourceY", "returnRx", "returnRy", "returnX", "returnY",
                "hp", "maxHp", "playerX", "playerY", "playerFacing", "basicReadyAt", "abilityReadyAt", "lastMoveAt",
           "deathToken", "createdAt", "updatedAt", "endedAt"
    `;
    if (!rows[0]) throw new Error('failed to create authoritative PvP session');
    const result: PvpAdmissionResponse = { replayed: false, pvp: publicSession(rows[0]) };
    await storeCommand(tx, userId, sessionId, input.idempotencyKey, kind, hash, result);
    return result;
  });

  // Capability removal happens after the durable transaction commits. The
  // world socket independently checks the DB before any visibility rejoin.
  suspendWorldPresence(userId);
  return response;
}

async function upsertWorldPosition(
  tx: Prisma.TransactionClient,
  userId: string,
  position: { rx: number; ry: number; x: number; y: number },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "PlayerWorldPosition" ("userId", "rx", "ry", "x", "y", "sessionId", "createdAt", "updatedAt")
    VALUES (${userId}, ${position.rx}, ${position.ry}, ${position.x}, ${position.y}, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO UPDATE SET
      "rx" = EXCLUDED."rx", "ry" = EXCLUDED."ry", "x" = EXCLUDED."x", "y" = EXCLUDED."y", "sessionId" = '', "updatedAt" = CURRENT_TIMESTAMP
  `;
}

export async function exitPvp(
  userId: string,
  input: { sessionId: string; idempotencyKey: string },
): Promise<PvpReturnResponse> {
  const kind = 'pvp_exit';
  const hash = commandHash(kind, { sessionId: input.sessionId });
  return serializableTransaction(async (tx) => {
    const early = replayCommand<PvpReturnResponse>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (early) return early;
    await lockUser(tx, userId);
    const lockedReplay = replayCommand<PvpReturnResponse>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (lockedReplay) return lockedReplay;
    const session = await lockSession(tx, userId, input.sessionId);
    if (session.status === 'death_pending') throw new HttpError(409, 'dead PvP sessions must use the authoritative death return');
    if (session.status !== 'active') throw new HttpError(409, 'PvP session is already closed');
    if (!liveExitGuard?.(session.id)) {
      throw new HttpError(409, 'an active authoritative PvP connection must be stationary at extraction before exit');
    }
    await assertRoomLeaseOwnedInTransaction(tx, session.roomKey);
    if (!isInsidePvpExtraction(session.roomKey, session.playerX, session.playerY)) {
      throw new HttpError(409, 'return to the authoritative extraction beacon before exiting PvP');
    }
    if (Date.now() - session.lastMoveAt.getTime() < PVP_EXTRACTION_IDLE_MS) {
      throw new HttpError(409, 'remain still at the extraction beacon before exiting PvP');
    }
    const inventory = await getInventoryInTransaction(tx, userId, true);
    const position = { rx: session.sourceRx, ry: session.sourceRy, x: session.sourceX, y: session.sourceY };
    await upsertWorldPosition(tx, userId, position);
    await tx.$executeRaw`
      UPDATE "PlayerCombatState" SET "hp" = GREATEST(1, LEAST("maxHp", ${session.hp})), "dead" = false,
        "deathToken" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}
    `;
    await tx.$executeRaw`UPDATE "PvpSession" SET "status" = 'exited', "endedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${session.id}`;
    const result: PvpReturnResponse = { replayed: false, sessionId: session.id, status: 'exited', position, inventory };
    await storeCommand(tx, userId, session.id, input.idempotencyKey, kind, hash, result);
    return result;
  });
}

export async function returnFromPvpDeath(
  userId: string,
  input: { sessionId: string; deathToken: string; idempotencyKey: string },
): Promise<PvpReturnResponse> {
  const kind = 'pvp_death_return';
  const hash = commandHash(kind, { sessionId: input.sessionId, deathToken: input.deathToken });
  return serializableTransaction(async (tx) => {
    const early = replayCommand<PvpReturnResponse>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (early) return early;
    await lockUser(tx, userId);
    const lockedReplay = replayCommand<PvpReturnResponse>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (lockedReplay) return lockedReplay;
    const session = await lockSession(tx, userId, input.sessionId);
    if (session.status !== 'death_pending' || session.deathToken !== input.deathToken) throw new HttpError(409, 'invalid or already-settled PvP death receipt');
    const inventory = await getInventoryInTransaction(tx, userId, true);
    const position = { rx: session.returnRx, ry: session.returnRy, x: session.returnX, y: session.returnY };
    await upsertWorldPosition(tx, userId, position);
    await tx.$executeRaw`
      UPDATE "PlayerCombatState" SET "hp" = "maxHp", "dead" = false, "deathToken" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `;
    await tx.$executeRaw`UPDATE "PvpSession" SET "status" = 'dead', "endedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${session.id}`;
    const result: PvpReturnResponse = { replayed: false, sessionId: session.id, status: 'dead', position, inventory };
    await storeCommand(tx, userId, session.id, input.idempotencyKey, kind, hash, result);
    return result;
  });
}

export async function sessionForAdmissionToken(token: string): Promise<PvpSessionRow | null> {
  const rows = await prisma.$queryRaw<PvpSessionRow[]>`
    SELECT "id", "userId", "roomKey", "gateId", "riskTier", "status", "admissionToken", "inventoryRevision",
           "carriedSnapshot", "sourceRx", "sourceRy", "sourceX", "sourceY", "returnRx", "returnRy", "returnX", "returnY",
           "hp", "maxHp", "playerX", "playerY", "playerFacing", "basicReadyAt", "abilityReadyAt", "lastMoveAt",
           "deathToken", "createdAt", "updatedAt", "endedAt"
    FROM "PvpSession" WHERE "admissionToken" = ${token} AND "status" IN ('active', 'death_pending')
  `;
  return rows[0] ?? null;
}

export async function persistPvpMotion(
  sessionId: string,
  state: { x: number; y: number; facing: number; hp: number; moving: boolean; basicReadyAt: Date | null; abilityReadyAt: Date | null },
): Promise<boolean> {
  const count = await prisma.$executeRaw`
    UPDATE "PvpSession"
    SET "playerX" = ${state.x}, "playerY" = ${state.y}, "playerFacing" = ${state.facing},
        "hp" = LEAST("hp", GREATEST(0, LEAST("maxHp", ${Math.floor(state.hp)}))),
        "basicReadyAt" = ${state.basicReadyAt}, "abilityReadyAt" = ${state.abilityReadyAt},
        "lastMoveAt" = CASE WHEN ${state.moving} THEN CURRENT_TIMESTAMP ELSE "lastMoveAt" END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${sessionId} AND "status" = 'active'
      AND EXISTS (
        SELECT 1 FROM "PvpRoomLease"
        WHERE "PvpRoomLease"."roomKey" = "PvpSession"."roomKey"
          AND "PvpRoomLease"."ownerId" = ${PROCESS_OWNER_ID}
          AND "PvpRoomLease"."leaseExpiresAt" > CURRENT_TIMESTAMP
      )
  `;
  return count === 1;
}

export async function persistPvpHitPoints(sessionId: string, hp: number): Promise<boolean> {
  const count = await prisma.$executeRaw`
    UPDATE "PvpSession" SET "hp" = LEAST("hp", GREATEST(0, LEAST("maxHp", ${Math.floor(hp)}))), "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${sessionId} AND "status" = 'active'
      AND EXISTS (
        SELECT 1 FROM "PvpRoomLease"
        WHERE "PvpRoomLease"."roomKey" = "PvpSession"."roomKey"
          AND "PvpRoomLease"."ownerId" = ${PROCESS_OWNER_ID}
          AND "PvpRoomLease"."leaseExpiresAt" > CURRENT_TIMESTAMP
      )
  `;
  return count === 1;
}

export async function settlePvpDeath(victimSessionId: string, killerSessionId: string): Promise<PvpDeathReceiptResponse> {
  if (victimSessionId === killerSessionId) throw new HttpError(409, 'self kills cannot settle PvP inventory');
  return serializableTransaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{
      victimSessionId: string; killerSessionId: string; riskTier: PvpRiskTier; transferred: unknown; destroyed: unknown;
      vaultCrystals: number; victimInventory: unknown; killerInventory: unknown;
    }>>`
      SELECT "victimSessionId", "killerSessionId", "riskTier", "transferred", "destroyed", "vaultCrystals", "victimInventory", "killerInventory"
      FROM "PvpDeathReceipt" WHERE "victimSessionId" = ${victimSessionId}
    `;
    if (existing[0]) {
      const victim = await tx.$queryRaw<Array<{ deathToken: string | null }>>`SELECT "deathToken" FROM "PvpSession" WHERE "id" = ${victimSessionId}`;
      if (!victim[0]?.deathToken) throw new Error('PvP death receipt is missing its death token');
      return {
        ...existing[0],
        transferred: existing[0].transferred as Record<string, number>,
        destroyed: existing[0].destroyed as Record<string, number>,
        victimInventory: parseInventory(existing[0].victimInventory),
        killerInventory: parseInventory(existing[0].killerInventory),
        deathToken: victim[0].deathToken,
      };
    }

    const sessions = await tx.$queryRaw<PvpSessionRow[]>`
      SELECT "id", "userId", "roomKey", "gateId", "riskTier", "status", "admissionToken", "inventoryRevision",
             "carriedSnapshot", "sourceRx", "sourceRy", "sourceX", "sourceY", "returnRx", "returnRy", "returnX", "returnY",
             "hp", "maxHp", "playerX", "playerY", "playerFacing", "basicReadyAt", "abilityReadyAt", "lastMoveAt",
           "deathToken", "createdAt", "updatedAt", "endedAt"
      FROM "PvpSession" WHERE "id" IN (${victimSessionId}, ${killerSessionId}) ORDER BY "id" FOR UPDATE
    `;
    const victim = sessions.find((row) => row.id === victimSessionId);
    const killer = sessions.find((row) => row.id === killerSessionId);
    if (!victim || !killer || victim.status !== 'active' || killer.status !== 'active' || victim.roomKey !== killer.roomKey) {
      throw new HttpError(409, 'PvP death participants are not active in the same authoritative room');
    }
    if (victim.riskTier !== killer.riskTier) throw new HttpError(409, 'PvP death participants have inconsistent risk authority');
    await assertRoomLeaseOwnedInTransaction(tx, victim.roomKey);

    // Inventory row locks are always acquired in userId order, preventing two
    // simultaneous opposite-direction kills from deadlocking.
    const userIds = [victim.userId, killer.userId].sort();
    const snapshots = new Map<string, InventorySnapshot>();
    for (const id of userIds) snapshots.set(id, await getInventoryInTransaction(tx, id, true));
    const victimInventory = snapshots.get(victim.userId)!;
    const killerInventory = snapshots.get(killer.userId)!;
    const plan = planPvpDeathSettlement(victimInventory, killerInventory, victim.riskTier);

    const commandSpecs = [
      {
        userId: victim.userId,
        sessionId: victim.id,
        kind: 'pvp_death_loss',
        payload: { victimSessionId, killerSessionId, riskTier: victim.riskTier },
        key: `pvp-death:${victimSessionId}`,
        expectedRevision: victimInventory.revision,
        mutate: () => ({ deltas: plan.victimDeltas, progressionLevel: plan.victimProgressionLevel, equippedWeapon: plan.victimEquippedWeapon }),
      },
      {
        userId: killer.userId,
        sessionId: killer.id,
        kind: 'pvp_kill_loot',
        payload: { victimSessionId, killerSessionId, riskTier: victim.riskTier },
        key: `pvp-loot:${victimSessionId}`,
        expectedRevision: killerInventory.revision,
        mutate: () => ({ deltas: plan.killerDeltas }),
      },
    ].sort((a, b) => a.userId.localeCompare(b.userId));

    const results = new Map<string, InventoryCommandResult>();
    for (const spec of commandSpecs) {
      results.set(spec.userId, await executeInventoryCommandInTransaction(
        tx,
        spec.userId,
        spec.kind,
        spec.payload,
        { idempotencyKey: spec.key, expectedRevision: spec.expectedRevision },
        spec.mutate,
        { allowActivePvpSessionId: spec.sessionId },
      ));
    }
    const victimResult = results.get(victim.userId)!;
    const killerResult = results.get(killer.userId)!;
    const deathToken = randomUUID();

    await tx.$executeRaw`
      INSERT INTO "Vault" ("layer", "crystals") VALUES (0, ${plan.vaultCrystals})
      ON CONFLICT ("layer") DO UPDATE SET "crystals" = "Vault"."crystals" + EXCLUDED."crystals"
    `;
    await tx.$executeRaw`
      UPDATE "PvpSession" SET "status" = 'death_pending', "hp" = 0, "deathToken" = ${deathToken},
        "inventoryRevision" = ${victimResult.inventory.revision}, "carriedSnapshot" = ${JSON.stringify(victimResult.inventory)}::jsonb,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${victim.id}
    `;
    await tx.$executeRaw`
      UPDATE "PvpSession" SET "inventoryRevision" = ${killerResult.inventory.revision},
        "carriedSnapshot" = ${JSON.stringify(killerResult.inventory)}::jsonb, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${killer.id} AND "status" = 'active'
    `;
    await tx.$executeRaw`
      INSERT INTO "PlayerCombatState" ("userId", "hp", "maxHp", "xp", "level", "dead", "deathToken", "deaths", "kills", "updatedAt")
      VALUES (${victim.userId}, 0, ${victim.maxHp}, 0, 1, true, ${deathToken}, 1, 0, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET "hp" = 0, "dead" = true, "deathToken" = ${deathToken}, "deaths" = "PlayerCombatState"."deaths" + 1, "updatedAt" = CURRENT_TIMESTAMP
    `;
    await tx.$executeRaw`
      INSERT INTO "PlayerCombatState" ("userId", "hp", "maxHp", "xp", "level", "dead", "deaths", "kills", "updatedAt")
      VALUES (${killer.userId}, ${killer.hp}, ${killer.maxHp}, 0, 1, false, 0, 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET "kills" = "PlayerCombatState"."kills" + 1, "updatedAt" = CURRENT_TIMESTAMP
    `;
    await tx.$executeRaw`
      INSERT INTO "PvpDeathReceipt"
        ("id", "victimSessionId", "killerSessionId", "victimUserId", "killerUserId", "riskTier", "transferred", "destroyed",
         "vaultCrystals", "victimInventory", "killerInventory", "createdAt")
      VALUES
        (${randomUUID()}, ${victim.id}, ${killer.id}, ${victim.userId}, ${killer.userId}, ${victim.riskTier},
         ${JSON.stringify(plan.transferred)}::jsonb, ${JSON.stringify(plan.destroyed)}::jsonb, ${plan.vaultCrystals},
         ${JSON.stringify(victimResult.inventory)}::jsonb, ${JSON.stringify(killerResult.inventory)}::jsonb, CURRENT_TIMESTAMP)
    `;
    return {
      victimSessionId: victim.id,
      killerSessionId: killer.id,
      riskTier: victim.riskTier,
      transferred: plan.transferred as Record<string, number>,
      destroyed: plan.destroyed as Record<string, number>,
      vaultCrystals: plan.vaultCrystals,
      victimInventory: victimResult.inventory,
      killerInventory: killerResult.inventory,
      deathToken,
    };
  });
}

export function pvpProcessOwnerIdForTests(): string {
  return PROCESS_OWNER_ID;
}
