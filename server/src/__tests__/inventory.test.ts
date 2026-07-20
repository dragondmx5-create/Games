import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { WebSocket } from 'ws';
import { createApp } from '../app.js';
import { prisma } from '../db.js';
import { getOrCreateWorldSeed } from '../world/service.js';
import { generateRegionNpcs } from '../world/npcLayout.js';
import { joinWorldPresence, resetWorldPresenceForTests } from '../world/presence.js';

const app = createApp();
const emptyMutations = { openedChests: [], gatheredTiles: [], choppedTrees: [], farmPlots: [] };

async function resetDb() {
  resetWorldPresenceForTests();
  await prisma.saveAudit.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.saveGame.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(resetDb);
afterEach(resetDb);
afterAll(async () => prisma.$disconnect());

async function registeredAgent() {
  const agent = request.agent(app);
  const register = await agent.post('/api/auth/register').send({
    email: `inventory-${Math.random()}@example.com`,
    username: `inv_${Math.random().toString(36).slice(2, 10)}`,
    password: 'hunter2222',
  });
  expect(register.status).toBe(201);
  return { agent, userId: register.body.user.id as string };
}

async function grant(userId: string, itemId: string, quantity: number): Promise<void> {
  await prisma.inventoryStack.upsert({
    where: { userId_itemId: { userId, itemId } },
    create: { userId, itemId, quantity },
    update: { quantity },
  });
}

async function connectAtMerchant(userId: string): Promise<void> {
  const worldSeed = await getOrCreateWorldSeed();
  const merchant = generateRegionNpcs(worldSeed, 0, 0).find((npc) => npc.role === 'merchant');
  if (!merchant) throw new Error('test merchant missing');
  const ws = {
    OPEN: 1,
    CONNECTING: 0,
    readyState: 1,
    bufferedAmount: 0,
    send: () => undefined,
    close: () => undefined,
  } as unknown as WebSocket;
  joinWorldPresence(userId, 'test-player', ws, { rx: 0, ry: 0, x: merchant.x, y: merchant.y });
}

function forgedSave() {
  return {
    version: 3,
    worldSeed: 42,
    mode: 'surface',
    currentRegion: { rx: 5, ry: 5 },
    pos: { x: 3_000, y: 3_000 },
    underworld: { reputation: 999, discoveredRoutes: ['green-land'], forbiddenDungeonKeys: 999, activeContracts: 999, inspectionProtection: 999 },
    player: {
      hp: 999, maxHp: 999, xp: 999_999, level: 200, light: 100,
      loot: 999_999, shrooms: 999_999,
      weapons: ['bone', 'chitin', 'crystal'], weaponIdx: 2,
      tools: ['axe', 'pickaxe'], armor: ['leather', 'iron'], chests: 9_999,
      wood: 999_999, iron: 999_999, meat: 999_999, hide: 999_999, feathers: 999_999,
    },
    hasPet: true,
    bags: [],
    regions: { '0,0': emptyMutations },
    visited: ['0,0'],
    stats: { deaths: 0, kills: 0, totalPlaySeconds: 1, deepestLayer: 1, itemsFound: 0, lootLostForever: 0, sessions: 1, deathSpots: {} },
    savedAt: new Date().toISOString(),
  };
}

describe('server-authoritative inventory routes', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/inventory')).status).toBe(401);
  });

  it('never bootstraps canonical economy or position from a client SaveGame', async () => {
    const { agent, userId } = await registeredAgent();
    const saved = await agent.put('/api/save').send(forgedSave());
    expect(saved.status).toBe(200);

    const inventory = await agent.get('/api/inventory');
    expect(inventory.status).toBe(200);
    expect(inventory.body.inventory).toMatchObject({
      revision: 0,
      progressionLevel: 1,
      equippedWeapon: 'weapon.bone',
      migratedFromSave: false,
      stacks: { 'weapon.bone': 1 },
    });
    expect(inventory.body.inventory.stacks['currency.crystal']).toBeUndefined();
    expect(inventory.body.inventory.stacks['material.wood']).toBeUndefined();

    const position = await prisma.playerWorldPosition.findUniqueOrThrow({ where: { userId } });
    expect(position).toMatchObject({ rx: 0, ry: 0 });
    expect(position.x).not.toBe(3_000);
    expect(position.y).not.toBe(3_000);
  });

  it('crafts atomically near a merchant and safely replays the same idempotency key', async () => {
    const { agent, userId } = await registeredAgent();
    await grant(userId, 'material.wood', 8);
    await connectAtMerchant(userId);
    const command = { recipeId: 'craft_wood_club', expectedRevision: 0, idempotencyKey: 'craft:test-wood-club' };

    const crafted = await agent.post('/api/inventory/craft').send(command);
    expect(crafted.status).toBe(200);
    expect(crafted.body.replayed).toBe(false);
    expect(crafted.body.inventory.revision).toBe(1);
    expect(crafted.body.inventory.stacks['material.wood']).toBe(2);
    expect(crafted.body.inventory.stacks['weapon.wood_club']).toBe(1);

    const replay = await agent.post('/api/inventory/craft').send(command);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.inventory).toEqual(crafted.body.inventory);
  });

  it('rejects remote merchant mutations', async () => {
    const { agent, userId } = await registeredAgent();
    await grant(userId, 'material.wood', 8);
    const remote = await agent.post('/api/inventory/craft').send({
      recipeId: 'craft_wood_club', expectedRevision: 0, idempotencyKey: 'craft:remote',
    });
    expect(remote.status).toBe(409);
    expect(remote.body.error).toContain('presence');
  });

  it('rejects stale revisions and idempotency-key payload changes', async () => {
    const { agent, userId } = await registeredAgent();
    await grant(userId, 'material.wood', 12);
    await connectAtMerchant(userId);
    await agent.post('/api/inventory/craft').send({ recipeId: 'craft_wood_club', expectedRevision: 0, idempotencyKey: 'craft:one' });

    const stale = await agent.post('/api/inventory/craft').send({ recipeId: 'craft_supply_crate', expectedRevision: 0, idempotencyKey: 'craft:two' });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toContain('revision mismatch');

    const changed = await agent.post('/api/inventory/craft').send({ recipeId: 'craft_supply_crate', expectedRevision: 0, idempotencyKey: 'craft:one' });
    expect(changed.status).toBe(409);
    expect(changed.body.error).toContain('different command');
  });

  it('purchases and equips only owned catalog items', async () => {
    const { agent, userId } = await registeredAgent();
    await grant(userId, 'currency.crystal', 20);
    await connectAtMerchant(userId);
    const bought = await agent.post('/api/inventory/purchase').send({ offerId: 'buy_chitin', expectedRevision: 0, idempotencyKey: 'purchase:chitin' });
    expect(bought.status).toBe(200);
    expect(bought.body.inventory.stacks['currency.crystal']).toBe(10);
    expect(bought.body.inventory.stacks['weapon.chitin']).toBe(1);

    const equipped = await agent.post('/api/inventory/equip').send({ weaponId: 'weapon.chitin', expectedRevision: 1, idempotencyKey: 'equip:chitin' });
    expect(equipped.status).toBe(200);
    expect(equipped.body.inventory.equippedWeapon).toBe('weapon.chitin');

    const missing = await agent.post('/api/inventory/equip').send({ weaponId: 'weapon.crystal', expectedRevision: 2, idempotencyKey: 'equip:missing' });
    expect(missing.status).toBe(409);
  });
});
