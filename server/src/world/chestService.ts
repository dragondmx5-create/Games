import { serializableTransaction } from '../db/transaction.js';
import { executeInventoryCommandInTransaction, replayInventoryCommandInTransaction } from '../inventory/service.js';
import type { InventoryCommandResult, InventoryStacks } from '../inventory/types.js';
import { HttpError } from '../middleware/httpError.js';
import { getFreshWorldPresence } from './presence.js';
import { regionResourceProfileAt } from './regionResourceProfiles.js';
import { getOrCreateWorldSeed } from './service.js';
import { filterWorldChestRewards, rollWorldChestRewards } from './chestDomain.js';
import { generateWorldChests, type WorldChestDefinition } from './chestLayout.js';
import { awardProgressionInTransaction, getPlayerCombatStateInTransaction, type PlayerCombatSnapshot } from '../combat/service.js';
import { recordQuestEventInTransaction } from '../quests/service.js';

const CHEST_OPEN_RADIUS = 30;

interface ChestStateRow {
  chestId: string;
  availableAt: Date;
  openCount: number;
}

export interface PublicWorldChest extends WorldChestDefinition {
  available: boolean;
  availableAt: string | null;
}

export interface WorldChestOpenResult {
  chestId: string;
  availableAt: string;
  reward: InventoryStacks;
  inventoryCommand: InventoryCommandResult;
  player: PlayerCombatSnapshot;
}

export async function listRegionWorldChests(rx: number, ry: number): Promise<{
  worldSeed: number;
  serverTime: string;
  chests: PublicWorldChest[];
}> {
  const worldSeed = await getOrCreateWorldSeed();
  const definitions = generateWorldChests(worldSeed, rx, ry, regionResourceProfileAt(rx, ry).riskTier);
  const states = await serializableTransaction(async (tx) => tx.$queryRaw<ChestStateRow[]>`
    SELECT "chestId", "availableAt", "openCount"
    FROM "WorldChestState"
    WHERE "worldSeed" = ${worldSeed} AND "rx" = ${rx} AND "ry" = ${ry}
  `);
  const byId = new Map<string, ChestStateRow>(states.map((state: ChestStateRow) => [state.chestId, state]));
  const now = new Date();
  return {
    worldSeed,
    serverTime: now.toISOString(),
    chests: definitions.map((definition) => {
      const state = byId.get(definition.id);
      const available = !state || state.availableAt <= now;
      return { ...definition, available, availableAt: available ? null : state.availableAt.toISOString() };
    }),
  };
}

export async function openWorldChest(
  userId: string,
  chestId: string,
  idempotencyKey: string,
): Promise<WorldChestOpenResult> {
  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'world presence is not connected');
  const worldSeed = await getOrCreateWorldSeed();
  const riskTier = regionResourceProfileAt(presence.rx, presence.ry).riskTier;
  const definition = generateWorldChests(worldSeed, presence.rx, presence.ry, riskTier).find((chest) => chest.id === chestId);
  if (!definition) throw new HttpError(409, 'chest does not belong to the current region');
  if (Math.hypot(presence.x - definition.x, presence.y - definition.y) > CHEST_OPEN_RADIUS) {
    throw new HttpError(409, 'too far from chest');
  }

  const kind = 'world_chest';
  const payload = { chestId };
  return serializableTransaction(async (tx) => {
    const replay = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replay) {
      const rows = await tx.$queryRaw<ChestStateRow[]>`
        SELECT "chestId", "availableAt", "openCount" FROM "WorldChestState" WHERE "chestId" = ${chestId}
      `;
      return {
        chestId,
        availableAt: rows[0]?.availableAt.toISOString() ?? new Date().toISOString(),
        reward: replay.deltas,
        inventoryCommand: replay,
        player: await getPlayerCombatStateInTransaction(tx, userId),
      };
    }

    await tx.$executeRaw`
      INSERT INTO "WorldChestState"
        ("chestId", "worldSeed", "rx", "ry", "availableAt", "openCount", "updatedAt")
      VALUES
        (${chestId}, ${worldSeed}, ${presence.rx}, ${presence.ry}, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
      ON CONFLICT ("chestId") DO NOTHING
    `;
    const rows = await tx.$queryRaw<ChestStateRow[]>`
      SELECT "chestId", "availableAt", "openCount"
      FROM "WorldChestState"
      WHERE "chestId" = ${chestId}
      FOR UPDATE
    `;
    const state = rows[0];
    if (!state) throw new Error('failed to create chest state');
    const replayAfterLock = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replayAfterLock) {
      return {
        chestId,
        availableAt: state.availableAt.toISOString(),
        reward: replayAfterLock.deltas,
        inventoryCommand: replayAfterLock,
        player: await getPlayerCombatStateInTransaction(tx, userId),
      };
    }
    const now = new Date();
    if (state.availableAt > now) throw new HttpError(409, 'chest has not respawned');

    const nextOpenCount = state.openCount + 1;
    const rolled = rollWorldChestRewards(`world-chest:${chestId}:${nextOpenCount}`, riskTier);
    let reward: InventoryStacks = {};
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx,
      userId,
      kind,
      payload,
      { idempotencyKey },
      async (snapshot) => {
        reward = filterWorldChestRewards(snapshot, rolled);
        await recordQuestEventInTransaction(
          tx,
          userId,
          'world_chest',
          1,
          `world-chest:${chestId}:${nextOpenCount}`,
          now,
        );
        const player = await awardProgressionInTransaction(tx, userId, 4);
        return { deltas: reward, progressionLevel: player.level };
      },
    );
    const availableAt = new Date(now.getTime() + definition.respawnMs);
    await tx.$executeRaw`
      UPDATE "WorldChestState"
      SET "availableAt" = ${availableAt}, "openCount" = ${nextOpenCount}, "lastOpenedBy" = ${userId}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "chestId" = ${chestId}
    `;
    return {
      chestId,
      availableAt: availableAt.toISOString(),
      reward,
      inventoryCommand,
      player: await getPlayerCombatStateInTransaction(tx, userId),
    };
  });
}

export async function openSupplyCrate(userId: string, idempotencyKey: string): Promise<InventoryCommandResult> {
  const kind = 'open_supply_crate';
  const payload = { container: 'container.supply_crate' };
  return serializableTransaction(async (tx) => executeInventoryCommandInTransaction(
    tx,
    userId,
    kind,
    payload,
    { idempotencyKey },
    (snapshot) => {
      if ((snapshot.stacks['container.supply_crate'] ?? 0) < 1) throw new HttpError(409, 'no supply crate is available');
      const rolled = rollWorldChestRewards(`supply-crate:${userId}:${idempotencyKey}`, 'frontier');
      const reward = filterWorldChestRewards(snapshot, rolled);
      return {
        deltas: {
          ...reward,
          'container.supply_crate': (reward['container.supply_crate'] ?? 0) - 1,
        },
      };
    },
  ));
}
