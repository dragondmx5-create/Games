import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { ItemId } from '../economy/catalog.js';
import { serializableTransaction } from '../db/transaction.js';
import { HttpError } from '../middleware/httpError.js';
import { executeInventoryCommandInTransaction } from '../inventory/service.js';
import type { InventoryCommandResult, InventoryStacks } from '../inventory/types.js';
import { awardProgressionInTransaction, getPlayerCombatStateInTransaction, type PlayerCombatSnapshot } from '../combat/service.js';
import { recordQuestEventInTransaction } from '../quests/service.js';
import { getFreshWorldPresence } from './presence.js';
import { getOrCreateWorldSeed } from './service.js';
import {
  generateRegionMiningNodes,
  parseMiningNodeId,
  type MiningKind,
  type WorldMiningNodeDefinition,
} from './miningLayout.js';
import { resolveMiningStrike } from './miningDomain.js';

const MINING_RADIUS = 44;

interface MiningStateRow {
  integrity: number;
  availableAt: Date;
  extractionCount: number;
}

export interface MiningNodeStatus extends WorldMiningNodeDefinition {
  integrity: number;
  available: boolean;
  availableAt: string | null;
  extractionCount: number;
}

export interface StrikeMiningResult {
  node: MiningNodeStatus;
  collapsed: boolean;
  reward: InventoryStacks;
  inventoryCommand: InventoryCommandResult;
  player: PlayerCombatSnapshot;
}

function rewardItem(kind: MiningKind): ItemId {
  return kind === 'crystal_geode' ? 'currency.crystal' : 'material.iron';
}

function canonicalNode(nodeId: string, worldSeed: number): WorldMiningNodeDefinition {
  const parsed = parseMiningNodeId(nodeId);
  if (!parsed || parsed.worldSeed !== worldSeed) throw new HttpError(400, 'invalid mining node');
  let nodes: WorldMiningNodeDefinition[];
  try {
    nodes = generateRegionMiningNodes(worldSeed, parsed.rx, parsed.ry);
  } catch {
    throw new HttpError(400, 'mining node outside world');
  }
  const node = nodes.find((candidate) => candidate.kind === parsed.kind && candidate.ordinal === parsed.ordinal);
  if (!node || node.id !== nodeId) throw new HttpError(400, 'unknown mining node');
  return node;
}

function assertPresence(userId: string, node: WorldMiningNodeDefinition): void {
  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'world presence is not connected');
  if (presence.rx !== node.rx || presence.ry !== node.ry) throw new HttpError(409, 'mining node is in another region');
  if (Math.hypot(presence.x - node.x, presence.y - node.y) > MINING_RADIUS) throw new HttpError(409, 'too far from mining node');
}

async function lockState(tx: Prisma.TransactionClient, node: WorldMiningNodeDefinition): Promise<MiningStateRow> {
  await tx.$executeRaw`
    INSERT INTO "WorldMiningState"
      ("nodeId", "worldSeed", "rx", "ry", "kind", "integrity", "availableAt", "extractionCount", "updatedAt")
    VALUES
      (${node.id}, ${node.worldSeed}, ${node.rx}, ${node.ry}, ${node.kind}, ${node.maxIntegrity}, TO_TIMESTAMP(0), 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("nodeId") DO NOTHING
  `;
  const rows = await tx.$queryRaw<MiningStateRow[]>`
    SELECT "integrity", "availableAt", "extractionCount"
    FROM "WorldMiningState" WHERE "nodeId" = ${node.id} FOR UPDATE
  `;
  if (!rows[0]) throw new Error('failed to lock mining state');
  return rows[0];
}

function publicStatus(node: WorldMiningNodeDefinition, state: MiningStateRow, now = new Date()): MiningNodeStatus {
  const available = state.availableAt <= now;
  return {
    ...node,
    integrity: available ? Math.max(1, Math.min(node.maxIntegrity, state.integrity)) : 0,
    available,
    availableAt: available ? null : state.availableAt.toISOString(),
    extractionCount: state.extractionCount,
  };
}

export async function listRegionMining(rx: number, ry: number): Promise<{ worldSeed: number; serverTime: string; nodes: MiningNodeStatus[] }> {
  const worldSeed = await getOrCreateWorldSeed();
  const definitions = generateRegionMiningNodes(worldSeed, rx, ry);
  const rows = await serializableTransaction((tx) => tx.$queryRaw<Array<{ nodeId: string } & MiningStateRow>>`
    SELECT "nodeId", "integrity", "availableAt", "extractionCount"
    FROM "WorldMiningState"
    WHERE "worldSeed" = ${worldSeed} AND "rx" = ${rx} AND "ry" = ${ry}
  `);
  const byId = new Map(rows.map((row) => [row.nodeId, row]));
  const now = new Date();
  return {
    worldSeed,
    serverTime: now.toISOString(),
    nodes: definitions.map((node) => publicStatus(node, byId.get(node.id) ?? {
      integrity: node.maxIntegrity,
      availableAt: new Date(0),
      extractionCount: 0,
    }, now)),
  };
}

export async function strikeMiningNode(
  userId: string,
  nodeId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<StrikeMiningResult> {
  const worldSeed = await getOrCreateWorldSeed();
  const node = canonicalNode(nodeId, worldSeed);
  return serializableTransaction(async (tx) => {
    let collapsed = false;
    let reward: InventoryStacks = {};
    let nextState: MiningStateRow | undefined;
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'mining_strike',
      { nodeId },
      { idempotencyKey, expectedRevision },
      async (snapshot) => {
        assertPresence(userId, node);
        if ((snapshot.stacks['tool.pickaxe'] ?? 0) < 1) throw new HttpError(409, 'requires pickaxe');
        const state = await lockState(tx, node);
        const now = new Date();
        if (state.availableAt > now) throw new HttpError(409, `mining node depleted until ${state.availableAt.toISOString()}`);
        // A depleted node is reset only after its canonical cooldown elapses.
        const transition = resolveMiningStrike(node, {
          integrity: state.integrity,
          availableAtMs: state.availableAt.getTime(),
          extractionCount: state.extractionCount,
        }, now.getTime());
        collapsed = transition.collapsed;
        const integrity = transition.integrity;
        const availableAt = new Date(transition.availableAtMs);
        const extractionCount = transition.extractionCount;
        if (collapsed) {
          const amount = crypto.randomInt(node.rewardMin, node.rewardMax + 1);
          reward = { [rewardItem(node.kind)]: amount };
          if (node.kind === 'ancient_seam' && crypto.randomInt(0, 5) === 0) reward['container.supply_crate'] = 1;
          await recordQuestEventInTransaction(
            tx,
            userId,
            'mineral_mined',
            1,
            `mineral-mined:${node.id}:${extractionCount}`,
            now,
            { miningKind: node.kind },
          );
          await awardProgressionInTransaction(tx, userId, node.kind === 'ancient_seam' ? 5 : 3);
        }
        await tx.$executeRaw`
          UPDATE "WorldMiningState"
          SET "integrity" = ${integrity},
              "availableAt" = ${availableAt},
              "extractionCount" = ${extractionCount},
              "lastMinedBy" = ${userId},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "nodeId" = ${node.id}
        `;
        nextState = { integrity, availableAt, extractionCount };
        return { deltas: reward };
      },
    );
    // Exact retries do not execute the mutator. Read current canonical state;
    // inventoryCommand still contains the exact once-only reward/deltas.
    if (!nextState) {
      const rows = await tx.$queryRaw<MiningStateRow[]>`
        SELECT "integrity", "availableAt", "extractionCount" FROM "WorldMiningState" WHERE "nodeId" = ${node.id}
      `;
      nextState = rows[0] ?? { integrity: node.maxIntegrity, availableAt: new Date(0), extractionCount: 0 };
      collapsed = Object.keys(inventoryCommand.deltas).length > 0;
      reward = inventoryCommand.deltas;
    }
    const player = await getPlayerCombatStateInTransaction(tx, userId);
    return { node: publicStatus(node, nextState), collapsed, reward, inventoryCommand, player };
  });
}
