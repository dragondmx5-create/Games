import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import type { ItemId } from '../economy/catalog.js';
import { HttpError } from '../middleware/httpError.js';
import { executeInventoryCommandInTransaction } from '../inventory/service.js';
import type { InventoryCommandResult, InventorySnapshot, InventoryStacks } from '../inventory/types.js';
import { getFreshWorldPresence } from './presence.js';
import { generateRegionResourceNodes, parseResourceNodeId, type ResourceKind, type WorldResourceNodeDefinition } from './resourceLayout.js';
import { regionResourceProfileAt } from './regionResourceProfiles.js';
import { getOrCreateWorldSeed } from './service.js';
import { prisma } from '../db.js';
import { awardProgressionInTransaction, getPlayerCombatStateInTransaction, type PlayerCombatSnapshot } from '../combat/service.js';
import { recordQuestEventInTransaction } from '../quests/service.js';

const HARVEST_RADIUS = 42;

interface ResourceStateRow {
  availableAt: Date;
  harvestCount: number;
}

export interface ResourceNodeStatus extends WorldResourceNodeDefinition {
  available: boolean;
  availableAt: string | null;
  harvestCount: number;
}

export interface HarvestResourceResult {
  nodeId: string;
  availableAt: string;
  inventoryCommand: InventoryCommandResult;
  player: PlayerCombatSnapshot;
}

function inventoryItemFor(kind: ResourceKind): ItemId {
  switch (kind) {
    case 'tree': return 'material.wood';
    case 'iron': return 'material.iron';
    case 'crystal': return 'currency.crystal';
    case 'shroom': return 'consumable.shroom';
  }
}

function assertToolOwned(snapshot: InventorySnapshot, node: WorldResourceNodeDefinition): void {
  if (!node.tool) return;
  const itemId: ItemId = node.tool === 'axe' ? 'tool.axe' : 'tool.pickaxe';
  if ((snapshot.stacks[itemId] ?? 0) < 1) throw new HttpError(409, `requires ${node.tool}`);
}

function canonicalNode(nodeId: string, worldSeed: number): WorldResourceNodeDefinition {
  const parsed = parseResourceNodeId(nodeId);
  if (!parsed || parsed.worldSeed !== worldSeed) throw new HttpError(400, 'invalid resource node');
  let profile;
  try {
    profile = regionResourceProfileAt(parsed.rx, parsed.ry);
  } catch {
    throw new HttpError(400, 'resource node outside world');
  }
  const node = generateRegionResourceNodes(worldSeed, parsed.rx, parsed.ry, profile)
    .find((candidate) => candidate.kind === parsed.kind && candidate.ordinal === parsed.ordinal);
  if (!node || node.id !== nodeId) throw new HttpError(400, 'unknown resource node');
  return node;
}

async function lockResourceState(tx: Prisma.TransactionClient, node: WorldResourceNodeDefinition): Promise<ResourceStateRow> {
  await tx.$executeRaw`
    INSERT INTO "WorldResourceState"
      ("nodeId", "worldSeed", "rx", "ry", "kind", "availableAt", "harvestCount", "updatedAt")
    VALUES
      (${node.id}, ${node.worldSeed}, ${node.rx}, ${node.ry}, ${node.kind}, TO_TIMESTAMP(0), 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("nodeId") DO NOTHING
  `;
  const rows = await tx.$queryRaw<ResourceStateRow[]>`
    SELECT "availableAt", "harvestCount"
    FROM "WorldResourceState"
    WHERE "nodeId" = ${node.id}
    FOR UPDATE
  `;
  if (!rows[0]) throw new Error('failed to lock resource state');
  return rows[0];
}

function assertPresence(userId: string, node: WorldResourceNodeDefinition): void {
  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'world presence is not connected');
  if (presence.rx !== node.rx || presence.ry !== node.ry) throw new HttpError(409, 'resource is in another region');
  if (Math.hypot(presence.x - node.x, presence.y - node.y) > HARVEST_RADIUS) {
    throw new HttpError(409, 'too far from resource');
  }
}

export async function listRegionResources(rx: number, ry: number): Promise<{ worldSeed: number; nodes: ResourceNodeStatus[]; serverTime: string }> {
  const worldSeed = await getOrCreateWorldSeed();
  const profile = regionResourceProfileAt(rx, ry);
  const definitions = generateRegionResourceNodes(worldSeed, rx, ry, profile);
  const rows: Array<{ nodeId: string; availableAt: Date; harvestCount: number }> = await prisma.worldResourceState.findMany({
    where: { nodeId: { in: definitions.map((node) => node.id) } },
    select: { nodeId: true, availableAt: true, harvestCount: true },
  });
  const states = new Map(rows.map((row) => [row.nodeId, row]));
  const now = new Date();
  return {
    worldSeed,
    serverTime: now.toISOString(),
    nodes: definitions.map((node) => {
      const state = states.get(node.id);
      const available = !state || state.availableAt <= now;
      return {
        ...node,
        available,
        availableAt: available || !state ? null : state.availableAt.toISOString(),
        harvestCount: state?.harvestCount ?? 0,
      };
    }),
  };
}

export async function harvestResource(userId: string, nodeId: string, idempotencyKey: string): Promise<HarvestResourceResult> {
  const worldSeed = await getOrCreateWorldSeed();
  const node = canonicalNode(nodeId, worldSeed);

  return serializableTransaction(async (tx) => {
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'harvest',
      { nodeId },
      { idempotencyKey },
      async (snapshot) => {
        assertPresence(userId, node);
        assertToolOwned(snapshot, node);
        const state = await lockResourceState(tx, node);
        const now = new Date();
        if (state.availableAt > now) throw new HttpError(409, `resource depleted until ${state.availableAt.toISOString()}`);
        const amount = crypto.randomInt(node.yieldMin, node.yieldMax + 1);
        const availableAt = new Date(now.getTime() + node.respawnSeconds * 1000);
        await tx.$executeRaw`
          UPDATE "WorldResourceState"
          SET "availableAt" = ${availableAt},
              "harvestCount" = "harvestCount" + 1,
              "lastHarvestedBy" = ${userId},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "nodeId" = ${node.id}
        `;
        const deltas: InventoryStacks = { [inventoryItemFor(node.kind)]: amount };
        await recordQuestEventInTransaction(
          tx,
          userId,
          'resource_harvest',
          1,
          `resource-harvest:${node.id}:${state.harvestCount + 1}`,
          now,
          { resourceKind: node.kind },
        );
        const player = await awardProgressionInTransaction(tx, userId, 2);
        return { deltas, progressionLevel: player.level };
      },
    );

    const rows = await tx.$queryRaw<ResourceStateRow[]>`
      SELECT "availableAt", "harvestCount"
      FROM "WorldResourceState"
      WHERE "nodeId" = ${node.id}
    `;
    if (!rows[0]) throw new Error('resource state missing after harvest');
    const player = await getPlayerCombatStateInTransaction(tx, userId);
    return { nodeId: node.id, availableAt: rows[0].availableAt.toISOString(), inventoryCommand, player };
  });
}
