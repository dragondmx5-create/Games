import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { attackProfile, bestArmorReduction, negativeDeltas, planDeathLoss } from '../combat/domain.js';
import { maxHpForLevel } from '../combat/catalog.js';
import {
  awardProgressionInTransaction,
  getPlayerCombatStateInTransaction,
  type PlayerCombatSnapshot,
} from '../combat/service.js';
import { serializableTransaction } from '../db/transaction.js';
import { getOrCreateWorldSeed } from '../world/service.js';
import { getFreshWorldPresence, relocateWorldPresence, suspendWorldPresence } from '../world/presence.js';
import { HttpError } from '../middleware/httpError.js';
import { recordQuestEventInTransaction } from '../quests/service.js';
import {
  executeInventoryCommandInTransaction,
  getInventoryInTransaction,
} from '../inventory/service.js';
import type { InventoryCommandResult, InventorySnapshot, InventoryStacks } from '../inventory/types.js';
import { dungeonDefinition } from './catalog.js';
import { DUNGEON_ENTRANCE_RADIUS, dungeonOverworldEntrance } from './overworldEntrance.js';
import {
  dungeonChestReward,
  dungeonContractReward,
  dungeonEnemyReward,
  entrancePixel,
  exitPixel,
  moveDungeonWithMechanics,
  spawnDungeonEntities,
  tickDungeonEnemies,
  tickDungeonHazards,
} from './domain.js';
import {
  deriveDungeonFloorSeed,
  generateDungeonTopology,
  type DungeonChestState,
  type DungeonEnemyState,
  type DungeonTopology,
} from './topology.js';

const PLAYER_WALK_SPEED = 62;
const PLAYER_RUN_SPEED = 105;
const MOVE_TIME_TOLERANCE_MS = 24;
const INTERACT_RADIUS = 28;


export type {
  DungeonRunStatus, PublicDungeonVaultProof, PublicDungeonReceipt,
  PublicDungeonSnapshot, DungeonCommandResponse,
} from './serviceTypes.js';
import type {
  DungeonRunStatus, DungeonRunRow, DungeonCommandRow, DungeonVaultProofRow,
  DungeonReceiptRow, CombatStateRow, LootBagRow, PublicDungeonVaultProof,
  PublicDungeonReceipt, PublicDungeonSnapshot, DungeonCommandResponse,
} from './serviceTypes.js';

function commandHash(kind: string, payload: unknown): string {
  return createHash('sha256').update(JSON.stringify({ kind, payload })).digest('hex');
}

function publicReceipt(row: DungeonReceiptRow): PublicDungeonReceipt {
  return {
    id: row.id,
    runId: row.runId,
    floor: row.floor,
    boss: row.boss,
    proofHash: row.proofHash,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseEnemies(value: unknown): DungeonEnemyState[] {
  if (!Array.isArray(value)) throw new Error('corrupt Dungeon enemy state');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('corrupt Dungeon enemy state');
    const enemy = entry as Partial<DungeonEnemyState>;
    if (
      typeof enemy.id !== 'string'
      || !['bug', 'shellbug', 'wallworm', 'spitter'].includes(String(enemy.kind))
      || typeof enemy.boss !== 'boolean'
      || !Number.isFinite(enemy.x)
      || !Number.isFinite(enemy.y)
      || !Number.isFinite(enemy.hp)
      || !Number.isFinite(enemy.maxHp)
      || !Number.isFinite(enemy.damage)
      || !Number.isFinite(enemy.speed)
      || !Number.isFinite(enemy.attackReadyAt)
      || typeof enemy.alive !== 'boolean'
    ) throw new Error('corrupt Dungeon enemy state');
    return enemy as DungeonEnemyState;
  });
}

function parseChests(value: unknown): DungeonChestState[] {
  if (!Array.isArray(value)) throw new Error('corrupt Dungeon chest state');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('corrupt Dungeon chest state');
    const chest = entry as Partial<DungeonChestState>;
    if (
      typeof chest.id !== 'string'
      || !['standard', 'forbidden'].includes(String(chest.kind))
      || !Number.isFinite(chest.x)
      || !Number.isFinite(chest.y)
      || typeof chest.opened !== 'boolean'
    ) throw new Error('corrupt Dungeon chest state');
    return chest as DungeonChestState;
  });
}

function canonicalTopology(row: DungeonRunRow): DungeonTopology {
  const topology = generateDungeonTopology(row.dungeonId, row.floor, row.floorSeed);
  const stored = row.topology as Partial<DungeonTopology> | null;
  if (!stored || stored.checksum !== topology.checksum) throw new Error('corrupt Dungeon topology');
  return topology;
}

function publicSnapshot(
  row: DungeonRunRow,
  topology = canonicalTopology(row),
  enemies = parseEnemies(row.enemies),
  chests = parseChests(row.chests),
): PublicDungeonSnapshot {
  return {
    runId: row.id,
    dungeonId: row.dungeonId,
    runSeed: row.runSeed,
    floor: row.floor,
    floorSeed: row.floorSeed,
    revision: row.revision,
    status: row.status,
    topology,
    player: {
      x: row.playerX,
      y: row.playerY,
      facing: row.playerFacing,
      hp: row.playerHp,
      maxHp: row.playerMaxHp,
    },
    enemies,
    chests,
    keyConsumed: row.keyConsumed,
    contractSettled: row.contractSettled,
    floorCompleted: row.floorCompleted,
    returnPosition: { rx: row.returnRx, ry: row.returnRy, x: row.returnX, y: row.returnY },
  };
}

async function findCommand(
  tx: Prisma.TransactionClient,
  userId: string,
  idempotencyKey: string,
): Promise<DungeonCommandRow | undefined> {
  const rows = await tx.$queryRaw<DungeonCommandRow[]>`
    SELECT "requestHash", "result"
    FROM "DungeonCommand"
    WHERE "userId" = ${userId} AND "idempotencyKey" = ${idempotencyKey}
  `;
  return rows[0];
}

function replayCommand<T>(stored: DungeonCommandRow | undefined, hash: string): T | null {
  if (!stored) return null;
  if (stored.requestHash !== hash) throw new HttpError(409, 'idempotency key was already used with another Dungeon command');
  return stored.result as T;
}

async function assertReplayRunStillBlocking(
  tx: Prisma.TransactionClient,
  replay: DungeonCommandResponse,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT "status" FROM "DungeonRun" WHERE "id" = ${replay.dungeon.runId}
  `;
  if (!rows[0] || !['active', 'death_pending'].includes(rows[0].status)) {
    throw new HttpError(409, 'Dungeon start idempotency receipt belongs to a closed run');
  }
}

async function storeCommand(
  tx: Prisma.TransactionClient,
  userId: string,
  runId: string,
  idempotencyKey: string,
  kind: string,
  hash: string,
  result: unknown,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "DungeonCommand"
      ("id", "runId", "userId", "idempotencyKey", "kind", "requestHash", "result", "createdAt")
    VALUES
      (${randomUUID()}, ${runId}, ${userId}, ${idempotencyKey}, ${kind}, ${hash}, ${JSON.stringify(result)}::jsonb, CURRENT_TIMESTAMP)
  `;
}

async function lockRun(tx: Prisma.TransactionClient, userId: string, runId: string): Promise<DungeonRunRow> {
  const rows = await tx.$queryRaw<DungeonRunRow[]>`
    SELECT "id", "userId", "dungeonId", "runSeed", "floor", "floorSeed", "revision", "status",
           "topology", "enemies", "chests", "playerX", "playerY", "playerFacing", "playerHp", "playerMaxHp",
           "returnRx", "returnRy", "returnX", "returnY", "keyConsumed", "contractSettled", "floorCompleted",
           "basicReadyAt", "abilityReadyAt", "hazardReadyAt", "hazardId", "lastMoveAt", "createdAt", "updatedAt", "endedAt"
    FROM "DungeonRun" WHERE "id" = ${runId} AND "userId" = ${userId} FOR UPDATE
  `;
  if (!rows[0]) throw new HttpError(404, 'Dungeon run not found');
  return rows[0];
}

function assertActiveRun(row: DungeonRunRow): void {
  if (row.status === 'death_pending') throw new HttpError(409, 'Dungeon death must be settled before another command');
  if (row.status !== 'active') throw new HttpError(409, 'Dungeon run is no longer active');
}

function assertRevision(row: DungeonRunRow, expectedRevision: number): void {
  if (row.revision !== expectedRevision) throw new HttpError(409, `stale Dungeon revision; expected ${row.revision}`);
}

async function persistRun(
  tx: Prisma.TransactionClient,
  row: DungeonRunRow,
  fields: {
    floor?: number;
    floorSeed?: number;
    revision?: number;
    status?: DungeonRunStatus;
    topology?: DungeonTopology;
    enemies?: DungeonEnemyState[];
    chests?: DungeonChestState[];
    playerX?: number;
    playerY?: number;
    playerFacing?: number;
    playerHp?: number;
    playerMaxHp?: number;
    keyConsumed?: boolean;
    contractSettled?: boolean;
    floorCompleted?: boolean;
    basicReadyAt?: Date | null;
    abilityReadyAt?: Date | null;
    hazardReadyAt?: Date | null;
    hazardId?: string | null;
    lastMoveAt?: Date;
    endedAt?: Date | null;
  },
): Promise<DungeonRunRow> {
  const next: DungeonRunRow = { ...row, ...fields, updatedAt: new Date() };
  await tx.$executeRaw`
    UPDATE "DungeonRun"
    SET "floor" = ${next.floor}, "floorSeed" = ${next.floorSeed}, "revision" = ${next.revision}, "status" = ${next.status},
        "topology" = ${JSON.stringify(fields.topology ?? canonicalTopology(next))}::jsonb,
        "enemies" = ${JSON.stringify(fields.enemies ?? parseEnemies(next.enemies))}::jsonb,
        "chests" = ${JSON.stringify(fields.chests ?? parseChests(next.chests))}::jsonb,
        "playerX" = ${next.playerX}, "playerY" = ${next.playerY}, "playerFacing" = ${next.playerFacing},
        "playerHp" = ${next.playerHp}, "playerMaxHp" = ${next.playerMaxHp},
        "keyConsumed" = ${next.keyConsumed}, "contractSettled" = ${next.contractSettled},
        "floorCompleted" = ${next.floorCompleted}, "basicReadyAt" = ${next.basicReadyAt},
        "abilityReadyAt" = ${next.abilityReadyAt}, "hazardReadyAt" = ${next.hazardReadyAt}, "hazardId" = ${next.hazardId}, "lastMoveAt" = ${next.lastMoveAt},
        "endedAt" = ${next.endedAt}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${row.id}
  `;
  next.topology = fields.topology ?? canonicalTopology(next);
  next.enemies = fields.enemies ?? parseEnemies(next.enemies);
  next.chests = fields.chests ?? parseChests(next.chests);
  return next;
}

async function executeRunCommand<T>(
  userId: string,
  runId: string,
  expectedRevision: number,
  idempotencyKey: string,
  kind: string,
  payload: unknown,
  mutate: (tx: Prisma.TransactionClient, row: DungeonRunRow) => Promise<T>,
): Promise<T> {
  const hash = commandHash(kind, payload);
  return serializableTransaction(async (tx) => {
    const early = replayCommand<T>(await findCommand(tx, userId, idempotencyKey), hash);
    if (early) return early;
    const row = await lockRun(tx, userId, runId);
    const lockedReplay = replayCommand<T>(await findCommand(tx, userId, idempotencyKey), hash);
    if (lockedReplay) return lockedReplay;
    assertActiveRun(row);
    assertRevision(row, expectedRevision);
    const result = await mutate(tx, row);
    await storeCommand(tx, userId, runId, idempotencyKey, kind, hash, result);
    return result;
  });
}

async function executeTransientRunCommand<T>(
  userId: string,
  runId: string,
  expectedRevision: number,
  mutate: (tx: Prisma.TransactionClient, row: DungeonRunRow) => Promise<T>,
): Promise<T> {
  return serializableTransaction(async (tx) => {
    const row = await lockRun(tx, userId, runId);
    assertActiveRun(row);
    assertRevision(row, expectedRevision);
    return mutate(tx, row);
  });
}

async function ensureUnderworldState(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "PlayerUnderworldState"
      ("userId", "reputation", "discoveredRoutes", "revealedLostLands", "forbiddenDungeonKeys", "activeContracts",
       "inspectionProtection", "createdAt", "updatedAt")
    VALUES (${userId}, 0, ${JSON.stringify(['green-land'])}::jsonb, ${JSON.stringify([])}::jsonb, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING
  `;
}

async function createVaultProof(
  tx: Prisma.TransactionClient,
  runId: string,
  userId: string,
  layer: 1 | 5,
): Promise<PublicDungeonVaultProof> {
  const rows = await tx.$queryRaw<DungeonVaultProofRow[]>`
    INSERT INTO "DungeonVaultProof" ("id", "runId", "userId", "layer", "proofHash", "createdAt")
    VALUES (${randomUUID()}, ${runId}, ${userId}, ${layer}, ${randomBytes(32).toString('hex')}, CURRENT_TIMESTAMP)
    ON CONFLICT ("runId", "layer") DO UPDATE SET "runId" = EXCLUDED."runId"
    RETURNING "id", "runId", "layer", "proofHash", "createdAt"
  `;
  const proof = rows[0];
  if (!proof) throw new Error('failed to create Dungeon Vault proof');
  return { ...proof, createdAt: proof.createdAt.toISOString() };
}

async function combatRowForUpdate(tx: Prisma.TransactionClient, userId: string): Promise<CombatStateRow> {
  await getPlayerCombatStateInTransaction(tx, userId);
  const rows = await tx.$queryRaw<CombatStateRow[]>`
    SELECT "hp", "maxHp", "xp", "level", "dead", "deathToken", "deaths", "kills"
    FROM "PlayerCombatState" WHERE "userId" = ${userId} FOR UPDATE
  `;
  if (!rows[0]) throw new Error('failed to load combat state');
  return rows[0];
}

function publicCombatRow(row: CombatStateRow): PlayerCombatSnapshot {
  return {
    hp: row.hp,
    maxHp: row.maxHp,
    xp: row.xp,
    level: row.level,
    dead: row.dead,
    ...(row.deathToken ? { deathToken: row.deathToken } : {}),
    deaths: row.deaths,
    kills: row.kills,
  };
}

export async function startDungeonRun(
  userId: string,
  input: { dungeonId: string; useForbiddenKey: boolean; idempotencyKey: string },
): Promise<DungeonCommandResponse> {
  const definition = dungeonDefinition(input.dungeonId);
  if (!definition) throw new HttpError(400, 'unknown Dungeon');
  const worldSeed = await getOrCreateWorldSeed();

  const kind = 'dungeon_start';
  const payload = { dungeonId: input.dungeonId, useForbiddenKey: input.useForbiddenKey };
  const hash = commandHash(kind, payload);
  const result = await serializableTransaction(async (tx) => {
    const replay = replayCommand<DungeonCommandResponse>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (replay) {
      await assertReplayRunStillBlocking(tx, replay);
      return replay;
    }
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const blockingPvp = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "PvpSession"
      WHERE "userId" = ${userId} AND "status" IN ('active', 'death_pending')
      LIMIT 1
    `;
    if (blockingPvp[0]) throw new HttpError(409, 'exit or settle the active PvP session before entering a Dungeon');
    const lockedReplay = replayCommand<DungeonCommandResponse>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (lockedReplay) {
      await assertReplayRunStillBlocking(tx, lockedReplay);
      return lockedReplay;
    }

    const presence = getFreshWorldPresence(userId);
    if (!presence) throw new HttpError(409, 'world presence is not connected');
    if (presence.rx !== definition.entranceRegion.rx || presence.ry !== definition.entranceRegion.ry) {
      throw new HttpError(409, 'not inside the authoritative Dungeon entrance region');
    }
    const entrance = dungeonOverworldEntrance(worldSeed, definition.id);
    if (Math.hypot(presence.x - entrance.x, presence.y - entrance.y) > DUNGEON_ENTRANCE_RADIUS) {
      throw new HttpError(409, 'not at the authoritative Dungeon entrance');
    }

    const active = await tx.$queryRaw<DungeonRunRow[]>`
      SELECT "id", "userId", "dungeonId", "runSeed", "floor", "floorSeed", "revision", "status",
             "topology", "enemies", "chests", "playerX", "playerY", "playerFacing", "playerHp", "playerMaxHp",
             "returnRx", "returnRy", "returnX", "returnY", "keyConsumed", "contractSettled", "floorCompleted",
             "basicReadyAt", "abilityReadyAt", "hazardReadyAt", "hazardId", "lastMoveAt", "createdAt", "updatedAt", "endedAt"
      FROM "DungeonRun" WHERE "userId" = ${userId} AND "status" IN ('active', 'death_pending')
      ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE
    `;
    if (active[0]) throw new HttpError(409, 'an authoritative Dungeon run is already active');

    const combat = await combatRowForUpdate(tx, userId);
    if (combat.dead) throw new HttpError(409, 'dead players cannot enter a Dungeon');
    await getInventoryInTransaction(tx, userId, true);
    await ensureUnderworldState(tx, userId);

    let keyConsumed = false;
    if (input.useForbiddenKey) {
      const changed = await tx.$executeRaw`
        UPDATE "PlayerUnderworldState"
        SET "forbiddenDungeonKeys" = "forbiddenDungeonKeys" - 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ${userId} AND "forbiddenDungeonKeys" > 0
      `;
      if (changed !== 1) throw new HttpError(409, 'no Forbidden Dungeon Key is available');
      keyConsumed = true;
    }

    const runId = randomUUID();
    const runSeed = randomInt(-2147483648, 2147483648);
    const floor = 1;
    const floorSeed = deriveDungeonFloorSeed(runSeed, definition.id, floor);
    const topology = generateDungeonTopology(definition.id, floor, floorSeed);
    const entities = spawnDungeonEntities(topology, definition.recommendedLevel, definition.floors === 1, keyConsumed);
    const spawn = entrancePixel(topology);
    const now = new Date();

    await tx.$executeRaw`
      INSERT INTO "DungeonRun"
        ("id", "userId", "dungeonId", "runSeed", "floor", "floorSeed", "revision", "status", "topology", "enemies", "chests",
         "playerX", "playerY", "playerFacing", "playerHp", "playerMaxHp", "returnRx", "returnRy", "returnX", "returnY",
         "keyConsumed", "contractSettled", "floorCompleted", "lastMoveAt", "createdAt", "updatedAt")
      VALUES
        (${runId}, ${userId}, ${definition.id}, ${runSeed}, ${floor}, ${floorSeed}, 0, 'active',
         ${JSON.stringify(topology)}::jsonb, ${JSON.stringify(entities.enemies)}::jsonb, ${JSON.stringify(entities.chests)}::jsonb,
         ${spawn.x}, ${spawn.y}, 0, ${combat.hp}, ${combat.maxHp}, ${presence.rx}, ${presence.ry}, ${presence.x}, ${presence.y},
         ${keyConsumed}, false, false, ${now}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    const row: DungeonRunRow = {
      id: runId,
      userId,
      dungeonId: definition.id,
      runSeed,
      floor,
      floorSeed,
      revision: 0,
      status: 'active',
      topology,
      enemies: entities.enemies,
      chests: entities.chests,
      playerX: spawn.x,
      playerY: spawn.y,
      playerFacing: 0,
      playerHp: combat.hp,
      playerMaxHp: combat.maxHp,
      returnRx: presence.rx,
      returnRy: presence.ry,
      returnX: presence.x,
      returnY: presence.y,
      keyConsumed,
      contractSettled: false,
      floorCompleted: false,
      basicReadyAt: null,
      abilityReadyAt: null,
      hazardReadyAt: null,
      hazardId: null,
      lastMoveAt: now,
      createdAt: now,
      updatedAt: now,
      endedAt: null,
    };
    const result: DungeonCommandResponse = { dungeon: publicSnapshot(row, topology, entities.enemies, entities.chests), combatPlayer: publicCombatRow(combat) };
    await storeCommand(tx, userId, runId, input.idempotencyKey, kind, hash, result);
    return result;
  });
  // Commit first, then remove the live overworld capability. Every overworld
  // economy/combat service requires fresh presence, and websocket rejoin also
  // checks the durable run row before restoring it.
  suspendWorldPresence(userId);
  return result;
}

export async function getActiveDungeonRun(userId: string): Promise<PublicDungeonSnapshot | null> {
  return serializableTransaction(async (tx) => {
    const rows = await tx.$queryRaw<DungeonRunRow[]>`
      SELECT "id", "userId", "dungeonId", "runSeed", "floor", "floorSeed", "revision", "status",
             "topology", "enemies", "chests", "playerX", "playerY", "playerFacing", "playerHp", "playerMaxHp",
             "returnRx", "returnRy", "returnX", "returnY", "keyConsumed", "contractSettled", "floorCompleted",
             "basicReadyAt", "abilityReadyAt", "hazardReadyAt", "hazardId", "lastMoveAt", "createdAt", "updatedAt", "endedAt"
      FROM "DungeonRun" WHERE "userId" = ${userId} AND "status" IN ('active', 'death_pending')
      ORDER BY "createdAt" DESC LIMIT 1
    `;
    return rows[0] ? publicSnapshot(rows[0]) : null;
  });
}

export function moveDungeonPlayer(
  userId: string,
  input: {
    runId: string;
    expectedRevision: number;
    idempotencyKey: string;
    moveX: number;
    moveY: number;
    running: boolean;
    facing: number;
    dtMs: number;
  },
): Promise<DungeonCommandResponse> {
  // Movement is revision-protected, so a duplicate request cannot apply twice.
  // Unlike economic/finalizing commands it is intentionally not written to
  // DungeonCommand: retaining every high-frequency position intent caused
  // unbounded ledger growth with no recovery benefit.
  return executeTransientRunCommand(userId, input.runId, input.expectedRevision, async (tx, row) => {
    const topology = canonicalTopology(row);
    const inventory = await getInventoryInTransaction(tx, userId, false);
    const now = new Date();
    const elapsedByServer = Math.max(16, Math.min(250, now.getTime() - row.lastMoveAt.getTime() + MOVE_TIME_TOLERANCE_MS));
    const elapsedMs = Math.min(input.dtMs, elapsedByServer);
    const armorReduction = bestArmorReduction(inventory);
    const tick = tickDungeonEnemies(
      topology,
      parseEnemies(row.enemies),
      { x: row.playerX, y: row.playerY, hp: row.playerHp },
      elapsedMs,
      armorReduction,
      now.getTime(),
    );

    // Settle every elapsed hazard tick at the last authoritative position
    // before applying movement. Otherwise a silent client could wait inside a
    // hazard and use its next command to step out before catch-up damage.
    const beforeMoveHazard = tickDungeonHazards(
      topology,
      { x: row.playerX, y: row.playerY, hp: tick.playerHp },
      armorReduction,
      row.hazardId,
      row.hazardReadyAt?.getTime() ?? null,
      now.getTime(),
    );

    const magnitude = Math.hypot(input.moveX, input.moveY);
    const normalizedX = magnitude > 1 ? input.moveX / magnitude : input.moveX;
    const normalizedY = magnitude > 1 ? input.moveY / magnitude : input.moveY;
    const speed = input.running ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
    const distance = speed * (elapsedMs / 1000);
    const moved = beforeMoveHazard.playerHp > 0
      ? moveDungeonWithMechanics(topology, { x: row.playerX, y: row.playerY }, normalizedX * distance, normalizedY * distance)
      : { x: row.playerX, y: row.playerY };
    const afterMoveHazard = beforeMoveHazard.playerHp > 0
      ? tickDungeonHazards(
          topology,
          { ...moved, hp: beforeMoveHazard.playerHp },
          armorReduction,
          beforeMoveHazard.hazardId,
          beforeMoveHazard.readyAt,
          now.getTime(),
        )
      : { ...beforeMoveHazard, damageTaken: 0 };
    const status: DungeonRunStatus = afterMoveHazard.playerHp <= 0 ? 'death_pending' : 'active';
    const next = await persistRun(tx, row, {
      revision: row.revision + 1,
      status,
      enemies: tick.enemies,
      playerX: moved.x,
      playerY: moved.y,
      playerFacing: input.facing,
      playerHp: afterMoveHazard.playerHp,
      hazardReadyAt: afterMoveHazard.readyAt == null ? null : new Date(afterMoveHazard.readyAt),
      hazardId: afterMoveHazard.hazardId,
      lastMoveAt: now,
    });
    return {
      dungeon: publicSnapshot(next, topology, tick.enemies),
      damageTaken: tick.damageTaken + beforeMoveHazard.damageTaken + afterMoveHazard.damageTaken,
    };
  });
}

export function attackDungeonEnemies(
  userId: string,
  input: { runId: string; expectedRevision: number; idempotencyKey: string; ability: boolean; facing: number },
): Promise<DungeonCommandResponse> {
  const payload = { ...input, idempotencyKey: undefined };
  return executeRunCommand(userId, input.runId, input.expectedRevision, input.idempotencyKey, 'dungeon_attack', payload, async (tx, row) => {
    const topology = canonicalTopology(row);
    const inventory = await getInventoryInTransaction(tx, userId, true);
    const profile = attackProfile(inventory.equippedWeapon, input.ability);
    const now = new Date();
    const readyAt = input.ability ? row.abilityReadyAt : row.basicReadyAt;
    if (readyAt && readyAt > now) throw new HttpError(409, 'Dungeon attack is still on cooldown');

    const tick = tickDungeonEnemies(
      topology,
      parseEnemies(row.enemies),
      { x: row.playerX, y: row.playerY, hp: row.playerHp },
      Math.max(16, Math.min(250, now.getTime() - row.lastMoveAt.getTime())),
      bestArmorReduction(inventory),
      now.getTime(),
    );
    const hazard = tickDungeonHazards(
      topology,
      { x: row.playerX, y: row.playerY, hp: tick.playerHp },
      bestArmorReduction(inventory),
      row.hazardId,
      row.hazardReadyAt?.getTime() ?? null,
      now.getTime(),
    );
    if (hazard.playerHp <= 0) {
      const dead = await persistRun(tx, row, {
        revision: row.revision + 1,
        status: 'death_pending',
        enemies: tick.enemies,
        playerHp: 0,
        hazardReadyAt: hazard.readyAt == null ? null : new Date(hazard.readyAt),
        hazardId: hazard.hazardId,
        playerFacing: input.facing,
        lastMoveAt: now,
      });
      return { dungeon: publicSnapshot(dead, topology, tick.enemies), damageTaken: tick.damageTaken + hazard.damageTaken };
    }

    const enemies = tick.enemies.map((enemy) => ({ ...enemy }));
    const killed: DungeonEnemyState[] = [];
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const distance = Math.hypot(enemy.x - row.playerX, enemy.y - row.playerY);
      if (distance > profile.range) continue;
      if (profile.arc < Math.PI * 2 - 0.001) {
        const angle = Math.atan2(enemy.y - row.playerY, enemy.x - row.playerX);
        let difference = Math.abs(angle - input.facing) % (Math.PI * 2);
        if (difference > Math.PI) difference = Math.PI * 2 - difference;
        if (difference > profile.arc / 2) continue;
      }
      const dealt = enemy.affix === 'armored' ? Math.max(1, Math.ceil(profile.damage * 0.65)) : profile.damage;
      enemy.hp = Math.max(0, enemy.hp - dealt);
      if (enemy.hp === 0) {
        enemy.alive = false;
        killed.push(enemy);
      }
    }

    let reward: InventoryStacks = {};
    let xp = 0;
    for (const enemy of killed) {
      const planned = dungeonEnemyReward(enemy, row.floor);
      xp += planned.xp;
      for (const [itemId, amount] of Object.entries(planned.deltas)) {
        if (!amount) continue;
        reward[itemId as keyof InventoryStacks] = (reward[itemId as keyof InventoryStacks] ?? 0) + amount;
      }
    }

    let inventoryCommand: InventoryCommandResult | undefined;
    if (Object.keys(reward).length > 0) {
      inventoryCommand = await executeInventoryCommandInTransaction(
        tx,
        userId,
        'dungeon_enemy_reward',
        { runId: row.id, enemyIds: killed.map((enemy) => enemy.id), reward },
        { idempotencyKey: `dungeon_enemy_reward:${row.id}:${killed.map((enemy) => enemy.id).join(',')}` },
        () => ({ deltas: reward }),
      );
    }

    let combatPlayer = await getPlayerCombatStateInTransaction(tx, userId);
    let playerMaxHp = row.playerMaxHp;
    let playerHp = hazard.playerHp;
    if (xp > 0) {
      combatPlayer = await awardProgressionInTransaction(tx, userId, xp);
      await tx.$executeRaw`
        UPDATE "PlayerCombatState" SET "kills" = "kills" + ${killed.length}, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}
      `;
      const gainedMaxHp = Math.max(0, combatPlayer.maxHp - row.playerMaxHp);
      playerMaxHp = combatPlayer.maxHp;
      playerHp = Math.min(playerMaxHp, playerHp + gainedMaxHp);
      combatPlayer = { ...combatPlayer, kills: combatPlayer.kills + killed.length };
    }

    const cooldownAt = new Date(now.getTime() + profile.cooldownMs);
    const next = await persistRun(tx, row, {
      revision: row.revision + 1,
      enemies,
      playerFacing: input.facing,
      playerHp,
      playerMaxHp,
      hazardReadyAt: hazard.readyAt == null ? null : new Date(hazard.readyAt),
      hazardId: hazard.hazardId,
      lastMoveAt: now,
      ...(input.ability ? { abilityReadyAt: cooldownAt } : { basicReadyAt: cooldownAt }),
    });
    return {
      dungeon: publicSnapshot(next, topology, enemies),
      damageTaken: tick.damageTaken + hazard.damageTaken,
      killedEnemyIds: killed.map((enemy) => enemy.id),
      reward,
      ...(inventoryCommand ? { inventoryCommand } : {}),
      combatPlayer,
    };
  });
}

export function openDungeonChest(
  userId: string,
  input: { runId: string; expectedRevision: number; idempotencyKey: string; chestId: string },
): Promise<DungeonCommandResponse> {
  const payload = { ...input, idempotencyKey: undefined };
  return executeRunCommand(userId, input.runId, input.expectedRevision, input.idempotencyKey, 'dungeon_chest', payload, async (tx, row) => {
    const topology = canonicalTopology(row);
    const chests = parseChests(row.chests).map((chest) => ({ ...chest }));
    const chest = chests.find((candidate) => candidate.id === input.chestId);
    if (!chest) throw new HttpError(404, 'Dungeon chest not found');
    if (chest.opened) throw new HttpError(409, 'Dungeon chest was already opened');
    if (Math.hypot(row.playerX - chest.x, row.playerY - chest.y) > INTERACT_RADIUS) throw new HttpError(409, 'too far from Dungeon chest');
    if (chest.kind === 'forbidden' && !row.keyConsumed) throw new HttpError(409, 'Forbidden chest has no server-settled key');

    // Settle authoritative threats before any reward-bearing interaction.
    // Otherwise a client could remain silent in a hazard, then open a nearby
    // chest before the overdue lethal cadence was applied.
    const inventory = await getInventoryInTransaction(tx, userId, true);
    const now = new Date();
    const enemyTick = tickDungeonEnemies(
      topology,
      parseEnemies(row.enemies),
      { x: row.playerX, y: row.playerY, hp: row.playerHp },
      Math.max(16, Math.min(250, now.getTime() - row.lastMoveAt.getTime())),
      bestArmorReduction(inventory),
      now.getTime(),
    );
    const hazardTick = tickDungeonHazards(
      topology,
      { x: row.playerX, y: row.playerY, hp: enemyTick.playerHp },
      bestArmorReduction(inventory),
      row.hazardId,
      row.hazardReadyAt?.getTime() ?? null,
      now.getTime(),
    );
    const damageTaken = enemyTick.damageTaken + hazardTick.damageTaken;
    if (hazardTick.playerHp <= 0) {
      const dead = await persistRun(tx, row, {
        revision: row.revision + 1,
        status: 'death_pending',
        enemies: enemyTick.enemies,
        playerHp: 0,
        hazardReadyAt: hazardTick.readyAt == null ? null : new Date(hazardTick.readyAt),
        hazardId: hazardTick.hazardId,
        lastMoveAt: now,
      });
      return { dungeon: publicSnapshot(dead, topology, enemyTick.enemies, chests), damageTaken };
    }

    const reward = dungeonChestReward(chest, row.floor);
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'dungeon_chest_reward',
      { runId: row.id, chestId: chest.id, reward },
      { idempotencyKey: `dungeon_chest_reward:${chest.id}` },
      () => ({ deltas: reward }),
    );
    chest.opened = true;
    const next = await persistRun(tx, row, {
      revision: row.revision + 1,
      enemies: enemyTick.enemies,
      chests,
      playerHp: hazardTick.playerHp,
      hazardReadyAt: hazardTick.readyAt == null ? null : new Date(hazardTick.readyAt),
      hazardId: hazardTick.hazardId,
      lastMoveAt: now,
    });
    return {
      dungeon: publicSnapshot(next, topology, enemyTick.enemies, chests),
      damageTaken,
      reward,
      inventoryCommand,
    };
  });
}

export function completeDungeonFloor(
  userId: string,
  input: { runId: string; expectedRevision: number; idempotencyKey: string },
): Promise<DungeonCommandResponse> {
  const payload = { runId: input.runId, expectedRevision: input.expectedRevision };
  return executeRunCommand(userId, input.runId, input.expectedRevision, input.idempotencyKey, 'dungeon_complete_floor', payload, async (tx, row) => {
    const definition = dungeonDefinition(row.dungeonId);
    if (!definition) throw new Error('Dungeon definition disappeared');
    const topology = canonicalTopology(row);
    const existing = await tx.$queryRaw<DungeonReceiptRow[]>`
      SELECT "id", "runId", "floor", "boss", "proofHash", "createdAt"
      FROM "DungeonFloorReceipt" WHERE "runId" = ${row.id} AND "floor" = ${row.floor}
    `;
    if (existing[0]) return { dungeon: publicSnapshot(row, topology), receipt: publicReceipt(existing[0]) };

    const enemies = parseEnemies(row.enemies);
    if (enemies.some((enemy) => enemy.alive)) throw new HttpError(409, 'all server-owned Dungeon enemies must be defeated');
    const exit = exitPixel(topology);
    if (Math.hypot(row.playerX - exit.x, row.playerY - exit.y) > INTERACT_RADIUS) throw new HttpError(409, 'player is not at the authoritative floor exit');

    const finalFloor = row.floor === definition.floors;
    const receiptId = randomUUID();
    const proofHash = randomBytes(32).toString('hex');
    const receiptRows = await tx.$queryRaw<DungeonReceiptRow[]>`
      INSERT INTO "DungeonFloorReceipt" ("id", "runId", "userId", "floor", "boss", "proofHash", "createdAt")
      VALUES (${receiptId}, ${row.id}, ${userId}, ${row.floor}, ${finalFloor}, ${proofHash}, CURRENT_TIMESTAMP)
      RETURNING "id", "runId", "floor", "boss", "proofHash", "createdAt"
    `;
    const receipt = receiptRows[0];
    if (!receipt) throw new Error('failed to create Dungeon receipt');
    await recordQuestEventInTransaction(
      tx,
      userId,
      'dungeon_floor',
      1,
      `dungeon-floor:${receipt.id}`,
      new Date(),
      { dungeonId: row.dungeonId, floor: row.floor },
    );

    const vaultProofs: PublicDungeonVaultProof[] = [];
    if (row.floor === 1) vaultProofs.push(await createVaultProof(tx, row.id, userId, 1));
    if (finalFloor) vaultProofs.push(await createVaultProof(tx, row.id, userId, 5));

    let contractSettled = row.contractSettled;
    let inventoryCommand: InventoryCommandResult | undefined;
    let reward: InventoryStacks | undefined;
    if (finalFloor && !contractSettled) {
      await ensureUnderworldState(tx, userId);
      const changed = await tx.$executeRaw`
        UPDATE "PlayerUnderworldState"
        SET "activeContracts" = "activeContracts" - 1, "reputation" = "reputation" + 5, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ${userId} AND "activeContracts" > 0
      `;
      if (changed === 1) {
        reward = dungeonContractReward(row.floor);
        inventoryCommand = await executeInventoryCommandInTransaction(
          tx,
          userId,
          'dungeon_contract_reward',
          { runId: row.id, floor: row.floor, reward },
          { idempotencyKey: `dungeon_contract_reward:${row.id}` },
          () => ({ deltas: reward! }),
        );
        contractSettled = true;
      }
    }

    const next = await persistRun(tx, row, {
      revision: row.revision + 1,
      floorCompleted: true,
      contractSettled,
    });
    return {
      dungeon: publicSnapshot(next, topology),
      receipt: publicReceipt(receipt),
      vaultProofs,
      contractSettled,
      ...(reward ? { reward } : {}),
      ...(inventoryCommand ? { inventoryCommand } : {}),
    };
  });
}

export function advanceDungeonFloor(
  userId: string,
  input: { runId: string; expectedRevision: number; idempotencyKey: string },
): Promise<DungeonCommandResponse> {
  const payload = { runId: input.runId, expectedRevision: input.expectedRevision };
  return executeRunCommand(userId, input.runId, input.expectedRevision, input.idempotencyKey, 'dungeon_advance', payload, async (tx, row) => {
    const definition = dungeonDefinition(row.dungeonId);
    if (!definition) throw new Error('Dungeon definition disappeared');
    if (row.floor >= definition.floors) throw new HttpError(409, 'final Dungeon floor cannot advance');
    const receipts = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "DungeonFloorReceipt" WHERE "runId" = ${row.id} AND "floor" = ${row.floor}
    `;
    if (!receipts[0] || !row.floorCompleted) throw new HttpError(409, 'floor completion receipt is required');

    const floor = row.floor + 1;
    const floorSeed = deriveDungeonFloorSeed(row.runSeed, row.dungeonId, floor);
    const topology = generateDungeonTopology(row.dungeonId, floor, floorSeed);
    const entities = spawnDungeonEntities(
      topology,
      definition.recommendedLevel + floor - 1,
      floor === definition.floors,
      row.keyConsumed,
    );
    const spawn = entrancePixel(topology);
    const next = await persistRun(tx, row, {
      floor,
      floorSeed,
      revision: row.revision + 1,
      topology,
      enemies: entities.enemies,
      chests: entities.chests,
      playerX: spawn.x,
      playerY: spawn.y,
      floorCompleted: false,
      basicReadyAt: null,
      abilityReadyAt: null,
      hazardReadyAt: null,
      hazardId: null,
      lastMoveAt: new Date(),
    });
    return { dungeon: publicSnapshot(next, topology, entities.enemies, entities.chests) };
  });
}

export async function exitDungeonRun(
  userId: string,
  input: { runId: string; expectedRevision: number; idempotencyKey: string },
): Promise<DungeonCommandResponse & { position: { rx: number; ry: number; x: number; y: number }; inventory: InventorySnapshot; combatPlayer: PlayerCombatSnapshot }> {
  const payload = { runId: input.runId, expectedRevision: input.expectedRevision };
  const result = await executeRunCommand(userId, input.runId, input.expectedRevision, input.idempotencyKey, 'dungeon_exit', payload, async (tx, row) => {
    const definition = dungeonDefinition(row.dungeonId);
    if (!definition) throw new Error('Dungeon definition disappeared');
    const topology = canonicalTopology(row);
    const entrance = entrancePixel(topology);
    const exit = exitPixel(topology);
    const atEntrance = Math.hypot(row.playerX - entrance.x, row.playerY - entrance.y) <= INTERACT_RADIUS;
    const finalComplete = row.floor === definition.floors && row.floorCompleted
      && Math.hypot(row.playerX - exit.x, row.playerY - exit.y) <= INTERACT_RADIUS;
    if (!atEntrance && !finalComplete) throw new HttpError(409, 'authoritative Dungeon exit is not reachable from this position');

    const status: DungeonRunStatus = finalComplete ? 'completed' : 'exited';
    const combat = await combatRowForUpdate(tx, userId);
    if (combat.dead) throw new HttpError(409, 'dead players cannot exit a Dungeon');
    const hp = Math.max(1, Math.min(combat.maxHp, row.playerHp));
    await tx.$executeRaw`
      UPDATE "PlayerCombatState" SET "hp" = ${hp}, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}
    `;
    await tx.$executeRaw`
      INSERT INTO "PlayerWorldPosition" ("userId", "rx", "ry", "x", "y", "sessionId", "createdAt", "updatedAt")
      VALUES (${userId}, ${row.returnRx}, ${row.returnRy}, ${row.returnX}, ${row.returnY}, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET
        "rx" = EXCLUDED."rx", "ry" = EXCLUDED."ry", "x" = EXCLUDED."x", "y" = EXCLUDED."y", "updatedAt" = CURRENT_TIMESTAMP
    `;
    const inventory = await getInventoryInTransaction(tx, userId, false);
    const next = await persistRun(tx, row, {
      revision: row.revision + 1,
      status,
      playerHp: hp,
      endedAt: new Date(),
    });
    const combatPlayer = publicCombatRow({ ...combat, hp });
    return {
      dungeon: publicSnapshot(next, topology),
      position: { rx: row.returnRx, ry: row.returnRy, x: row.returnX, y: row.returnY },
      inventory,
      combatPlayer,
    };
  });
  relocateWorldPresence(userId, result.position);
  return result;
}

function parseBagItems(items: unknown): InventoryStacks {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return {};
  return items as InventoryStacks;
}

export async function settleDungeonDeath(
  userId: string,
  input: { runId: string; idempotencyKey: string },
): Promise<{
  dungeon: PublicDungeonSnapshot;
  player: PlayerCombatSnapshot;
  death: {
    token: string;
    riskTier: 'lost';
    bag: {
      id: string;
      ownerUserId: string;
      rx: number;
      ry: number;
      x: number;
      y: number;
      items: InventoryStacks;
      expiresAt: string;
    } | null;
    inventory: InventoryCommandResult;
  };
}> {
  const kind = 'dungeon_death';
  const payload = { runId: input.runId };
  const hash = commandHash(kind, payload);
  const deathToken = randomUUID();
  const worldSeed = await getOrCreateWorldSeed();
  const result = await serializableTransaction(async (tx) => {
    const replay = replayCommand<Awaited<ReturnType<typeof settleDungeonDeath>>>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (replay) return replay;
    const row = await lockRun(tx, userId, input.runId);
    const lockedReplay = replayCommand<Awaited<ReturnType<typeof settleDungeonDeath>>>(await findCommand(tx, userId, input.idempotencyKey), hash);
    if (lockedReplay) return lockedReplay;
    if (row.status !== 'death_pending' || row.playerHp > 0) throw new HttpError(409, 'Dungeon run has no unsettled authoritative death');

    const combat = await combatRowForUpdate(tx, userId);
    if (combat.dead) throw new HttpError(409, 'combat death was already settled outside this Dungeon command');
    const inventory = await getInventoryInTransaction(tx, userId, true);
    const lossPlan = planDeathLoss(inventory, 'lost');
    const deathInventory = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'dungeon_death_loss',
      { runId: row.id, deathToken, riskTier: 'lost' },
      { idempotencyKey: `dungeon_death_loss:${row.id}` },
      () => ({
        deltas: negativeDeltas(lossPlan.dropped),
        progressionLevel: lossPlan.progressionLevel,
        equippedWeapon: lossPlan.equippedWeapon,
      }),
    );

    let bag: LootBagRow | undefined;
    if (Object.keys(lossPlan.dropped).length > 0) {
      const bags = await tx.$queryRaw<LootBagRow[]>`
        INSERT INTO "WorldLootBag"
          ("id", "ownerUserId", "worldSeed", "rx", "ry", "x", "y", "items", "expiresAt", "createdAt")
        VALUES
          (${randomUUID()}, ${userId}, ${worldSeed}, ${row.returnRx}, ${row.returnRy}, ${row.returnX}, ${row.returnY},
           ${JSON.stringify(lossPlan.dropped)}::jsonb, ${new Date(Date.now() + 30 * 60_000)}, CURRENT_TIMESTAMP)
        RETURNING "id", "ownerUserId", "rx", "ry", "x", "y", "items", "expiresAt"
      `;
      bag = bags[0];
    }

    const level = 1;
    const maxHp = maxHpForLevel(level);
    await tx.$executeRaw`
      UPDATE "PlayerCombatState"
      SET "hp" = 0, "maxHp" = ${maxHp}, "xp" = 0, "level" = ${level}, "dead" = true,
          "deathToken" = ${deathToken}, "deaths" = "deaths" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `;
    await tx.$executeRaw`
      INSERT INTO "PlayerWorldPosition" ("userId", "rx", "ry", "x", "y", "sessionId", "createdAt", "updatedAt")
      VALUES (${userId}, ${row.returnRx}, ${row.returnRy}, ${row.returnX}, ${row.returnY}, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET
        "rx" = EXCLUDED."rx", "ry" = EXCLUDED."ry", "x" = EXCLUDED."x", "y" = EXCLUDED."y", "updatedAt" = CURRENT_TIMESTAMP
    `;
    const next = await persistRun(tx, row, { revision: row.revision + 1, status: 'dead', endedAt: new Date() });
    const player = publicCombatRow({
      ...combat,
      hp: 0,
      maxHp,
      xp: 0,
      level,
      dead: true,
      deathToken,
      deaths: combat.deaths + 1,
    });
    const result = {
      dungeon: publicSnapshot(next),
      player,
      death: {
        token: deathToken,
        riskTier: 'lost' as const,
        bag: bag ? {
          id: bag.id,
          ownerUserId: bag.ownerUserId,
          rx: bag.rx,
          ry: bag.ry,
          x: bag.x,
          y: bag.y,
          items: parseBagItems(bag.items),
          expiresAt: bag.expiresAt.toISOString(),
        } : null,
        inventory: deathInventory,
      },
    };
    await storeCommand(tx, userId, row.id, input.idempotencyKey, kind, hash, result);
    return result;
  });
  relocateWorldPresence(userId, result.dungeon.returnPosition);
  return result;
}
