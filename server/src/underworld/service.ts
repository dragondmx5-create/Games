import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import { executeInventoryCommandInTransaction } from '../inventory/service.js';
import type { InventoryCommandResult, InventoryStacks } from '../inventory/types.js';
import { HttpError } from '../middleware/httpError.js';
import { getFreshWorldPresence } from '../world/presence.js';
import { getOrCreateWorldSeed } from '../world/service.js';
import { generateCanonicalOverworldTopology } from '../world/overworldTopology.js';
import { regionResourceProfileAt, type ResourceLandId } from '../world/regionResourceProfiles.js';
import {
  availableUnderworldOffers,
  contrabandRewards,
  currentWorldDay,
  LOST_ROUTE_REGIONS,
  MARKET_ROUTE_REGIONS,
  type UnderworldOffer,
  type UnderworldOfferId,
} from './catalog.js';

const SESSION_MS = 20 * 60_000;
const MARKET_PORTAL_RADIUS = 34;
const ALL_LANDS: readonly ResourceLandId[] = ['witchlands', 'green-land', 'rainforest', 'frostlands', 'sunscorched-desert', 'cinder-coast'];

interface StateRow {
  reputation: number;
  discoveredRoutes: unknown;
  revealedLostLands: unknown;
  forbiddenDungeonKeys: number;
  activeContracts: number;
  inspectionProtection: number;
  activeSessionToken: string | null;
  activeSourceLand: string | null;
  sessionExpiresAt: Date | null;
}

export interface PublicUnderworldState {
  reputation: number;
  discoveredRoutes: ResourceLandId[];
  revealedLostLands: ResourceLandId[];
  forbiddenDungeonKeys: number;
  activeContracts: number;
  inspectionProtection: number;
  sessionToken: string | null;
  sourceLandId: ResourceLandId | null;
  sessionExpiresAt: string | null;
}

export interface UnderworldSessionResult {
  state: PublicUnderworldState;
  worldDay: number;
  offers: UnderworldOffer[];
}

function landArray(value: unknown, fallback: ResourceLandId[] = []): ResourceLandId[] {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.filter((entry): entry is ResourceLandId => typeof entry === 'string' && ALL_LANDS.includes(entry as ResourceLandId)))];
}

function isLandId(value: string | null): value is ResourceLandId {
  return value !== null && ALL_LANDS.includes(value as ResourceLandId);
}

function publicState(row: StateRow, now = new Date()): PublicUnderworldState {
  const active = !!row.activeSessionToken && !!row.sessionExpiresAt && row.sessionExpiresAt > now && isLandId(row.activeSourceLand);
  return {
    reputation: row.reputation,
    discoveredRoutes: landArray(row.discoveredRoutes, ['green-land']),
    revealedLostLands: landArray(row.revealedLostLands),
    forbiddenDungeonKeys: row.forbiddenDungeonKeys,
    activeContracts: row.activeContracts,
    inspectionProtection: row.inspectionProtection,
    sessionToken: active ? row.activeSessionToken : null,
    sourceLandId: active ? row.activeSourceLand as ResourceLandId : null,
    sessionExpiresAt: active ? row.sessionExpiresAt!.toISOString() : null,
  };
}

async function ensureState(tx: Prisma.TransactionClient, userId: string, lock: boolean): Promise<StateRow> {
  const lockSql = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty;
  let rows = await tx.$queryRaw<StateRow[]>(Prisma.sql`
    SELECT "reputation", "discoveredRoutes", "revealedLostLands", "forbiddenDungeonKeys", "activeContracts",
           "inspectionProtection", "activeSessionToken", "activeSourceLand", "sessionExpiresAt"
    FROM "PlayerUnderworldState" WHERE "userId" = ${userId}${lockSql}
  `);
  if (rows[0]) return rows[0];

  await tx.$executeRaw`
    INSERT INTO "PlayerUnderworldState"
      ("userId", "reputation", "discoveredRoutes", "revealedLostLands", "forbiddenDungeonKeys", "activeContracts",
       "inspectionProtection", "createdAt", "updatedAt")
    VALUES (${userId}, 0, ${JSON.stringify(['green-land'])}::jsonb, ${JSON.stringify([])}::jsonb, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING
  `;
  rows = await tx.$queryRaw<StateRow[]>(Prisma.sql`
    SELECT "reputation", "discoveredRoutes", "revealedLostLands", "forbiddenDungeonKeys", "activeContracts",
           "inspectionProtection", "activeSessionToken", "activeSourceLand", "sessionExpiresAt"
    FROM "PlayerUnderworldState" WHERE "userId" = ${userId}${lockSql}
  `);
  if (!rows[0]) throw new Error('failed to create underworld state');
  return rows[0];
}

function offersFor(row: StateRow, now = new Date()): UnderworldOffer[] {
  return availableUnderworldOffers(currentWorldDay(now), row.reputation);
}

function requireSession(row: StateRow, token: string, now: Date): ResourceLandId {
  if (row.activeSessionToken !== token || !row.sessionExpiresAt || row.sessionExpiresAt <= now || !isLandId(row.activeSourceLand)) {
    throw new HttpError(409, 'underworld session is missing or expired');
  }
  return row.activeSourceLand;
}

export async function getUnderworldState(userId: string): Promise<UnderworldSessionResult> {
  return serializableTransaction(async (tx) => {
    const row = await ensureState(tx, userId, false);
    const now = new Date();
    return { state: publicState(row, now), worldDay: currentWorldDay(now), offers: offersFor(row, now) };
  });
}

export async function enterUnderworld(userId: string): Promise<UnderworldSessionResult> {
  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'world presence is not connected');
  const profile = regionResourceProfileAt(presence.rx, presence.ry);
  const route = MARKET_ROUTE_REGIONS[profile.landId];
  if (route.rx !== presence.rx || route.ry !== presence.ry) throw new HttpError(409, 'not inside a Black Market route region');
  const worldSeed = await getOrCreateWorldSeed();
  const portal = generateCanonicalOverworldTopology(worldSeed, presence.rx, presence.ry).portals
    .find((candidate) => candidate.kind === 'black-market');
  if (!portal || Math.hypot(presence.x - portal.x, presence.y - portal.y) > MARKET_PORTAL_RADIUS) {
    throw new HttpError(409, 'move closer to the Black Market route');
  }
  const now = new Date();
  const sessionToken = randomUUID();
  const sessionExpiresAt = new Date(now.getTime() + SESSION_MS);

  return serializableTransaction(async (tx) => {
    const row = await ensureState(tx, userId, true);
    const discovered = new Set(landArray(row.discoveredRoutes, ['green-land']));
    discovered.add(profile.landId);
    await tx.$executeRaw`
      UPDATE "PlayerUnderworldState"
      SET "discoveredRoutes" = ${JSON.stringify([...discovered])}::jsonb,
          "activeSessionToken" = ${sessionToken}, "activeSourceLand" = ${profile.landId},
          "sessionExpiresAt" = ${sessionExpiresAt}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `;
    const next: StateRow = { ...row, discoveredRoutes: [...discovered], activeSessionToken: sessionToken, activeSourceLand: profile.landId, sessionExpiresAt };
    return { state: publicState(next, now), worldDay: currentWorldDay(now), offers: offersFor(next, now) };
  });
}

export async function exitUnderworld(userId: string, sessionToken: string): Promise<PublicUnderworldState> {
  return serializableTransaction(async (tx) => {
    const row = await ensureState(tx, userId, true);
    requireSession(row, sessionToken, new Date());
    await tx.$executeRaw`
      UPDATE "PlayerUnderworldState"
      SET "activeSessionToken" = NULL, "activeSourceLand" = NULL, "sessionExpiresAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `;
    return publicState({ ...row, activeSessionToken: null, activeSourceLand: null, sessionExpiresAt: null });
  });
}

export async function purchaseUnderworldOffer(
  userId: string,
  sessionToken: string,
  offerId: UnderworldOfferId,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<{ inventoryCommand: InventoryCommandResult; state: PublicUnderworldState; offers: UnderworldOffer[]; revealedRegion: { rx: number; ry: number } | null; message: string }> {
  const now = new Date();
  return serializableTransaction(async (tx) => {
    const row = await ensureState(tx, userId, true);
    const sourceLand = requireSession(row, sessionToken, now);
    const offer = offersFor(row, now).find((candidate) => candidate.id === offerId);
    if (!offer) throw new HttpError(409, 'offer is unavailable for this day or reputation');

    let revealedRegion: { rx: number; ry: number } | null = null;
    let message = offer.label;
    const payload = { offerId, sourceLand, worldDay: currentWorldDay(now) };
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'underworld_purchase',
      payload,
      { expectedRevision, idempotencyKey },
      async (_snapshot) => {
        const deltas: InventoryStacks = { 'currency.crystal': -offer.crystalCost };
        let reputation = row.reputation + 1;
        let forbiddenDungeonKeys = row.forbiddenDungeonKeys;
        let activeContracts = row.activeContracts;
        let inspectionProtection = row.inspectionProtection;
        const revealed = new Set(landArray(row.revealedLostLands));

        if (offerId === 'contraband-cache') {
          Object.assign(deltas, contrabandRewards(sourceLand));
          message = `Contraband from ${sourceLand} was settled into canonical inventory.`;
        } else if (offerId === 'lost-map') {
          revealed.add(sourceLand);
          revealedRegion = LOST_ROUTE_REGIONS[sourceLand];
          message = `The ${sourceLand} Lost Territory route was revealed.`;
        } else if (offerId === 'clean-papers') {
          inspectionProtection += 3;
          message = 'Three server-owned inspection protections were added.';
        } else if (offerId === 'dungeon-key') {
          forbiddenDungeonKeys += 1;
          message = 'A server-owned Forbidden Dungeon Key was added.';
        } else if (offerId === 'anonymous-contract') {
          activeContracts += 1;
          message = 'A server-owned Anonymous Contract was activated.';
        }

        await tx.$executeRaw`
          UPDATE "PlayerUnderworldState"
          SET "reputation" = ${reputation}, "revealedLostLands" = ${JSON.stringify([...revealed])}::jsonb,
              "forbiddenDungeonKeys" = ${forbiddenDungeonKeys}, "activeContracts" = ${activeContracts},
              "inspectionProtection" = ${inspectionProtection}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "userId" = ${userId}
        `;
        return { deltas };
      },
    );

    const updated = await ensureState(tx, userId, false);
    return {
      inventoryCommand,
      state: publicState(updated, now),
      offers: offersFor(updated, now),
      revealedRegion,
      message,
    };
  });
}
