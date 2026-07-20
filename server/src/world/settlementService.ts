import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { serializableTransaction } from '../db/transaction.js';
import { awardProgressionInTransaction, getPlayerCombatStateInTransaction, type PlayerCombatSnapshot } from '../combat/service.js';
import { executeInventoryCommandInTransaction, replayInventoryCommandInTransaction } from '../inventory/service.js';
import type { InventoryCommandResult, InventoryStacks } from '../inventory/types.js';
import { HttpError } from '../middleware/httpError.js';
import { getFreshWorldPresence } from './presence.js';
import {
  settlementAnimals,
  settlementFarmPlots,
  type SettlementAnimalDefinition,
  type SettlementFarmDefinition,
} from './settlementLayout.js';

const INTERACT_RADIUS = 44;

interface FarmRow {
  plotId: string;
  crop: string | null;
  plantedAt: Date | null;
  readyAt: Date | null;
  harvestCount: number;
}
interface AnimalRow {
  animalId: string;
  readyAt: Date;
  collectCount: number;
}

export interface PublicFarmPlot extends SettlementFarmDefinition {
  planted: boolean;
  plantedAt: string | null;
  readyAt: string | null;
  ready: boolean;
  harvestCount: number;
}
export interface PublicSettlementAnimal extends SettlementAnimalDefinition {
  ready: boolean;
  readyAt: string | null;
  collectCount: number;
}
export interface SettlementProductionSnapshot {
  serverTime: string;
  farmPlots: PublicFarmPlot[];
  animals: PublicSettlementAnimal[];
}
export interface FarmCommandResult {
  plot: PublicFarmPlot;
  inventoryCommand: InventoryCommandResult;
  player: PlayerCombatSnapshot;
  reward?: InventoryStacks;
}
export interface AnimalCollectResult {
  animal: PublicSettlementAnimal;
  inventoryCommand: InventoryCommandResult;
  player: PlayerCombatSnapshot;
  reward: InventoryStacks;
}

function deterministicInt(key: string, min: number, max: number): number {
  const value = createHash('sha256').update(key).digest().readUInt32LE(0);
  return min + (value % (max - min + 1));
}

function assertPresence(userId: string, entity: { rx: number; ry: number; x: number; y: number }): void {
  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'world presence is not connected');
  if (presence.rx !== entity.rx || presence.ry !== entity.ry) throw new HttpError(409, 'settlement entity is in another region');
  if (Math.hypot(presence.x - entity.x, presence.y - entity.y) > INTERACT_RADIUS) throw new HttpError(409, 'too far from settlement entity');
}

function farmDefinition(plotId: string): SettlementFarmDefinition {
  const match = /^farm:v1:(-?\d+):(-?\d+):(\d+)$/.exec(plotId);
  if (!match) throw new HttpError(400, 'invalid farm plot');
  const [rx, ry, ordinal] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const plot = settlementFarmPlots(rx, ry).find((candidate) => candidate.ordinal === ordinal && candidate.id === plotId);
  if (!plot) throw new HttpError(404, 'unknown farm plot');
  return plot;
}

function animalDefinition(animalId: string): SettlementAnimalDefinition {
  const match = /^animal:v1:(-?\d+):(-?\d+):(\d+)$/.exec(animalId);
  if (!match) throw new HttpError(400, 'invalid settlement animal');
  const [rx, ry, ordinal] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const animal = settlementAnimals(rx, ry).find((candidate) => candidate.ordinal === ordinal && candidate.id === animalId);
  if (!animal) throw new HttpError(404, 'unknown settlement animal');
  return animal;
}

function publicFarm(definition: SettlementFarmDefinition, row: FarmRow | undefined, now: Date): PublicFarmPlot {
  const planted = !!row?.crop && !!row.readyAt;
  return {
    ...definition,
    planted,
    plantedAt: row?.plantedAt?.toISOString() ?? null,
    readyAt: row?.readyAt?.toISOString() ?? null,
    ready: planted && row!.readyAt! <= now,
    harvestCount: row?.harvestCount ?? 0,
  };
}

function publicAnimal(definition: SettlementAnimalDefinition, row: AnimalRow | undefined, now: Date): PublicSettlementAnimal {
  const ready = !row || row.readyAt <= now;
  return {
    ...definition,
    ready,
    readyAt: ready ? null : row!.readyAt.toISOString(),
    collectCount: row?.collectCount ?? 0,
  };
}

export async function listSettlementProduction(userId: string, rx: number, ry: number): Promise<SettlementProductionSnapshot> {
  const [farmDefinitions, animalDefinitions] = [settlementFarmPlots(rx, ry), settlementAnimals(rx, ry)];
  const [farmRows, animalRows] = await Promise.all([
    prisma.playerFarmPlot.findMany({ where: { userId, rx, ry } }) as unknown as Promise<FarmRow[]>,
    prisma.playerAnimalState.findMany({ where: { userId, rx, ry } }) as unknown as Promise<AnimalRow[]>,
  ]);
  const farmById = new Map(farmRows.map((row) => [row.plotId, row]));
  const animalById = new Map(animalRows.map((row) => [row.animalId, row]));
  const now = new Date();
  return {
    serverTime: now.toISOString(),
    farmPlots: farmDefinitions.map((definition) => publicFarm(definition, farmById.get(definition.id), now)),
    animals: animalDefinitions.map((definition) => publicAnimal(definition, animalById.get(definition.id), now)),
  };
}

async function lockFarm(tx: Prisma.TransactionClient, userId: string, definition: SettlementFarmDefinition): Promise<FarmRow> {
  await tx.$executeRaw`
    INSERT INTO "PlayerFarmPlot" ("userId", "plotId", "rx", "ry", "harvestCount", "updatedAt")
    VALUES (${userId}, ${definition.id}, ${definition.rx}, ${definition.ry}, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId", "plotId") DO NOTHING
  `;
  const rows = await tx.$queryRaw<FarmRow[]>`
    SELECT "plotId", "crop", "plantedAt", "readyAt", "harvestCount"
    FROM "PlayerFarmPlot" WHERE "userId" = ${userId} AND "plotId" = ${definition.id} FOR UPDATE
  `;
  if (!rows[0]) throw new Error('failed to lock farm plot');
  return rows[0];
}

async function lockAnimal(tx: Prisma.TransactionClient, userId: string, definition: SettlementAnimalDefinition): Promise<AnimalRow> {
  await tx.$executeRaw`
    INSERT INTO "PlayerAnimalState" ("userId", "animalId", "rx", "ry", "readyAt", "collectCount", "updatedAt")
    VALUES (${userId}, ${definition.id}, ${definition.rx}, ${definition.ry}, TO_TIMESTAMP(0), 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId", "animalId") DO NOTHING
  `;
  const rows = await tx.$queryRaw<AnimalRow[]>`
    SELECT "animalId", "readyAt", "collectCount"
    FROM "PlayerAnimalState" WHERE "userId" = ${userId} AND "animalId" = ${definition.id} FOR UPDATE
  `;
  if (!rows[0]) throw new Error('failed to lock settlement animal');
  return rows[0];
}

export async function plantFarmPlot(userId: string, plotId: string, expectedRevision: number, idempotencyKey: string): Promise<FarmCommandResult> {
  const definition = farmDefinition(plotId);
  assertPresence(userId, definition);
  const kind = 'farm_plant';
  const payload = { plotId };
  return serializableTransaction(async (tx) => {
    const replay = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replay) {
      const row = await lockFarm(tx, userId, definition);
      return { plot: publicFarm(definition, row, new Date()), inventoryCommand: replay, player: await getPlayerCombatStateInTransaction(tx, userId) };
    }
    const row = await lockFarm(tx, userId, definition);
    const replayAfterLock = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replayAfterLock) {
      return { plot: publicFarm(definition, row, new Date()), inventoryCommand: replayAfterLock, player: await getPlayerCombatStateInTransaction(tx, userId) };
    }
    if (row.crop && row.readyAt) throw new HttpError(409, 'farm plot is already planted');
    const now = new Date();
    const readyAt = new Date(now.getTime() + definition.growMs);
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx, userId, kind, payload, { idempotencyKey, expectedRevision },
      (snapshot) => {
        if ((snapshot.stacks['consumable.shroom'] ?? 0) < 1) throw new HttpError(409, 'planting requires one shroom');
        return { deltas: { 'consumable.shroom': -1 } };
      },
    );
    await tx.$executeRaw`
      UPDATE "PlayerFarmPlot" SET "crop" = ${definition.crop}, "plantedAt" = ${now}, "readyAt" = ${readyAt}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "plotId" = ${plotId}
    `;
    return {
      plot: publicFarm(definition, { ...row, crop: definition.crop, plantedAt: now, readyAt }, now),
      inventoryCommand,
      player: await getPlayerCombatStateInTransaction(tx, userId),
    };
  });
}

export async function harvestFarmPlot(userId: string, plotId: string, expectedRevision: number, idempotencyKey: string): Promise<FarmCommandResult> {
  const definition = farmDefinition(plotId);
  assertPresence(userId, definition);
  const kind = 'farm_harvest';
  const payload = { plotId };
  return serializableTransaction(async (tx) => {
    const replay = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replay) {
      const row = await lockFarm(tx, userId, definition);
      return { plot: publicFarm(definition, row, new Date()), inventoryCommand: replay, player: await getPlayerCombatStateInTransaction(tx, userId), reward: replay.deltas };
    }
    const row = await lockFarm(tx, userId, definition);
    const replayAfterLock = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replayAfterLock) {
      return { plot: publicFarm(definition, row, new Date()), inventoryCommand: replayAfterLock, player: await getPlayerCombatStateInTransaction(tx, userId), reward: replayAfterLock.deltas };
    }
    const now = new Date();
    if (!row.crop || !row.readyAt) throw new HttpError(409, 'farm plot is empty');
    if (row.readyAt > now) throw new HttpError(409, `crop is growing until ${row.readyAt.toISOString()}`);
    const amount = deterministicInt(`farm:${userId}:${plotId}:${row.harvestCount + 1}`, definition.yieldMin, definition.yieldMax);
    const itemId = definition.crop === 'glowshroom' ? 'consumable.shroom' : 'currency.crystal';
    const reward: InventoryStacks = { [itemId]: amount };
    let player: PlayerCombatSnapshot | null = null;
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx, userId, kind, payload, { idempotencyKey, expectedRevision },
      async () => {
        player = await awardProgressionInTransaction(tx, userId, 5);
        return { deltas: reward, progressionLevel: player.level };
      },
    );
    await tx.$executeRaw`
      UPDATE "PlayerFarmPlot"
      SET "crop" = NULL, "plantedAt" = NULL, "readyAt" = NULL, "harvestCount" = "harvestCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "plotId" = ${plotId}
    `;
    return {
      plot: publicFarm(definition, { ...row, crop: null, plantedAt: null, readyAt: null, harvestCount: row.harvestCount + 1 }, now),
      inventoryCommand,
      player: player ?? await getPlayerCombatStateInTransaction(tx, userId),
      reward,
    };
  });
}

export async function collectSettlementAnimal(userId: string, animalId: string, expectedRevision: number, idempotencyKey: string): Promise<AnimalCollectResult> {
  const definition = animalDefinition(animalId);
  assertPresence(userId, definition);
  const kind = 'animal_collect';
  const payload = { animalId };
  return serializableTransaction(async (tx) => {
    const replay = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replay) {
      const row = await lockAnimal(tx, userId, definition);
      return { animal: publicAnimal(definition, row, new Date()), inventoryCommand: replay, player: await getPlayerCombatStateInTransaction(tx, userId), reward: replay.deltas };
    }
    const row = await lockAnimal(tx, userId, definition);
    const replayAfterLock = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replayAfterLock) {
      return { animal: publicAnimal(definition, row, new Date()), inventoryCommand: replayAfterLock, player: await getPlayerCombatStateInTransaction(tx, userId), reward: replayAfterLock.deltas };
    }
    const now = new Date();
    if (row.readyAt > now) throw new HttpError(409, `animal production is ready at ${row.readyAt.toISOString()}`);
    const readyAt = new Date(now.getTime() + definition.readyMs);
    const reward: InventoryStacks = { [definition.rewardItem]: definition.rewardAmount };
    let player: PlayerCombatSnapshot | null = null;
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx, userId, kind, payload, { idempotencyKey, expectedRevision },
      async () => {
        player = await awardProgressionInTransaction(tx, userId, 3);
        return { deltas: reward, progressionLevel: player.level };
      },
    );
    await tx.$executeRaw`
      UPDATE "PlayerAnimalState"
      SET "readyAt" = ${readyAt}, "collectCount" = "collectCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "animalId" = ${animalId}
    `;
    return {
      animal: publicAnimal(definition, { ...row, readyAt, collectCount: row.collectCount + 1 }, now),
      inventoryCommand,
      player: player ?? await getPlayerCombatStateInTransaction(tx, userId),
      reward,
    };
  });
}
