import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { WebSocket } from 'ws';
import { createApp } from '../app.js';
import { prisma } from '../db.js';
import { joinWorldPresence, leaveWorldPresence, resetWorldPresenceForTests } from '../world/presence.js';
import { generateRegionResourceNodes } from '../world/resourceLayout.js';
import { regionResourceProfileAt } from '../world/regionResourceProfiles.js';

const app = createApp();
const WORLD_SEED = 246_813_579;
const emptyMutations = { openedChests: [], gatheredTiles: [], choppedTrees: [], farmPlots: [] };

function socket(): WebSocket {
  return { OPEN: 1, readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocket;
}

async function resetDb(): Promise<void> {
  resetWorldPresenceForTests();
  await prisma.worldResourceState.deleteMany();
  await prisma.playerWorldPosition.deleteMany();
  await prisma.saveAudit.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.saveGame.deleteMany();
  await prisma.user.deleteMany();
  await prisma.worldConfig.upsert({ where: { id: 1 }, create: { id: 1, worldSeed: WORLD_SEED }, update: { worldSeed: WORLD_SEED } });
}

beforeAll(resetDb);
afterEach(resetDb);
afterAll(async () => prisma.$disconnect());

async function registeredAgent() {
  const username = `gather_${Math.random().toString(36).slice(2, 10)}`;
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({
    email: `${username}@example.com`,
    username,
    password: 'hunter2222',
  });
  await agent.put('/api/save').send({
    version: 3,
    worldSeed: WORLD_SEED,
    mode: 'surface',
    currentRegion: { rx: 0, ry: 0 },
    pos: { x: 100, y: 100 },
    underworld: { reputation: 0, discoveredRoutes: ['green-land'], forbiddenDungeonKeys: 0, activeContracts: 0, inspectionProtection: 0 },
    player: {
      hp: 10, maxHp: 10, xp: 0, level: 1, light: 100,
      loot: 0, shrooms: 0, weapons: ['bone'], weaponIdx: 0,
      tools: [], armor: [], chests: 0,
      wood: 0, iron: 0, meat: 0, hide: 0, feathers: 0,
    },
    hasPet: false,
    bags: [],
    regions: { '0,0': emptyMutations },
    visited: ['0,0'],
    stats: { deaths: 0, kills: 0, totalPlaySeconds: 1, deepestLayer: 1, itemsFound: 0, lootLostForever: 0, sessions: 1, deathSpots: {} },
    savedAt: new Date().toISOString(),
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  return { agent, user };
}

describe('shared server-authoritative resources', () => {
  it('awards a canonical node once, shares depletion, and safely replays after disconnect', async () => {
    const { agent, user } = await registeredAgent();
    await agent.get('/api/inventory');
    const node = generateRegionResourceNodes(WORLD_SEED, 0, 0, regionResourceProfileAt(0, 0))
      .find((candidate) => candidate.kind === 'shroom')!;
    const ws = socket();
    joinWorldPresence(user.id, user.username, ws, { rx: 0, ry: 0, x: node.x, y: node.y });

    const command = { nodeId: node.id, idempotencyKey: 'harvest:integration-shroom' };
    const harvested = await agent.post('/api/world/harvest').send(command);
    expect(harvested.status).toBe(200);
    expect(harvested.body.inventoryCommand.replayed).toBe(false);
    expect(harvested.body.inventoryCommand.deltas).toEqual({ 'consumable.shroom': 1 });
    expect(harvested.body.inventoryCommand.inventory.stacks['consumable.shroom']).toBe(1);

    const region = await agent.get('/api/world/regions/0/0/resources');
    expect(region.status).toBe(200);
    expect(region.body.nodes.find((candidate: { id: string }) => candidate.id === node.id)).toMatchObject({ available: false, harvestCount: 1 });

    leaveWorldPresence(user.id, ws);
    const replay = await agent.post('/api/world/harvest').send(command);
    expect(replay.status).toBe(200);
    expect(replay.body.inventoryCommand.replayed).toBe(true);
    expect(replay.body.inventoryCommand.inventory).toEqual(harvested.body.inventoryCommand.inventory);
  });

  it('rejects arbitrary or distant node claims', async () => {
    const { agent, user } = await registeredAgent();
    const ws = socket();
    joinWorldPresence(user.id, user.username, ws, { rx: 0, ry: 0, x: 100, y: 100 });

    const forged = await agent.post('/api/world/harvest').send({ nodeId: 'res1:999:0:0:shroom:0', idempotencyKey: 'harvest:forged-node' });
    expect(forged.status).toBe(400);

    const node = generateRegionResourceNodes(WORLD_SEED, 0, 0, regionResourceProfileAt(0, 0))
      .find((candidate) => candidate.kind === 'shroom')!;
    const distant = await agent.post('/api/world/harvest').send({ nodeId: node.id, idempotencyKey: 'harvest:distant-node' });
    expect(distant.status).toBe(409);
    expect(distant.body.error).toContain('too far');
  });
  it('rejects the removed unrestricted capital relocation endpoint', async () => {
    const { agent } = await registeredAgent();
    const response = await agent.post('/api/world/return-to-capital');
    expect(response.status).toBe(410);
    expect(response.body.error).toContain('death ticket');
  });

});
