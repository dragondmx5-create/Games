import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db.js';

const app = createApp();
const emptyMutations = { openedChests: [], gatheredTiles: [], choppedTrees: [], farmPlots: [] };

function saveAtLayer(layer: number, loot = 0, bags: unknown[] = []) {
  return {
    version: 2,
    worldSeed: 424242,
    mode: layer > 1 ? 'dungeon' : 'surface',
    currentRegion: { rx: 0, ry: 0 },
    pos: { x: 100, y: 100 },
    ...(layer > 1 ? { dungeon: { layer, seed: 9001, mutations: emptyMutations } } : {}),
    player: {
      hp: 10, maxHp: 10, xp: 0, level: 1, light: 100, loot, shrooms: 0,
      weapons: ['bone'], weaponIdx: 0, tools: [], armor: [], chests: 0,
      wood: 0, iron: 0, meat: 0, hide: 0, feathers: 0,
    },
    hasPet: false,
    bags,
    regions: { '0,0': emptyMutations },
    visited: ['0,0'],
    stats: {
      deaths: 0, kills: 0, totalPlaySeconds: 12, deepestLayer: Math.max(1, layer),
      itemsFound: 0, lootLostForever: 0, sessions: 1, deathSpots: {},
    },
    savedAt: new Date().toISOString(),
  };
}

async function resetDb() {
  await prisma.$executeRaw`DELETE FROM "DungeonVaultProof"`;
  await prisma.$executeRaw`DELETE FROM "DungeonFloorReceipt"`;
  await prisma.$executeRaw`DELETE FROM "DungeonCommand"`;
  await prisma.$executeRaw`DELETE FROM "DungeonRun"`;
  await prisma.vaultClaim.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.saveGame.deleteMany();
  await prisma.user.deleteMany();
  await prisma.vault.deleteMany();
}

beforeAll(resetDb);
afterEach(resetDb);
afterAll(async () => prisma.$disconnect());

const creds = { email: 'vault@example.com', username: 'vaulter', password: 'hunter2222' };

async function loggedInAgent() {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send(creds);
  return agent;
}

async function createDungeonVaultProof(email: string, layer: 1 | 5) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const runId = randomUUID();
  const proofId = randomUUID();
  const now = new Date();
  const topology = JSON.stringify({ version: 1, width: 1, height: 1, tileSize: 32, tiles: [0], checksum: 'vault-test' });
  await prisma.$executeRaw`
    INSERT INTO "DungeonRun"
      ("id", "userId", "dungeonId", "runSeed", "floor", "floorSeed", "revision", "status",
       "topology", "enemies", "chests", "playerX", "playerY", "playerFacing", "playerHp", "playerMaxHp",
       "returnRx", "returnRy", "returnX", "returnY", "keyConsumed", "contractSettled", "floorCompleted",
       "lastMoveAt", "createdAt", "updatedAt", "endedAt")
    VALUES
      (${runId}, ${user.id}, 'green-land-caves', 101, ${layer}, 202, 1, 'completed',
       ${topology}::jsonb, '[]'::jsonb, '[]'::jsonb, 16, 16, 0, 10, 10,
       0, 0, 100, 100, false, false, true, ${now}, ${now}, ${now}, ${now})
  `;
  await prisma.$executeRaw`
    INSERT INTO "DungeonVaultProof" ("id", "runId", "userId", "layer", "proofHash", "createdAt")
    VALUES (${proofId}, ${runId}, ${user.id}, ${layer}, ${`vault-proof:${proofId}`}, ${now})
  `;
  return { runId, proofId };
}

describe('vault routes', () => {
  it('GET works without auth and defaults to zero', async () => {
    const res = await request(app).get('/api/vault');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ layer0: 0, layer1: 0, layer5: 0 });
  });

  it('has no client-amount contribution endpoint and rejects unauthenticated claims', async () => {
    const removed = await request(app).post('/api/vault/contribute').send({ layer1Amount: 1_000_000, layer5Amount: 1_000_000 });
    expect(removed.status).toBe(404);
    const proofs = await request(app).get('/api/vault/proofs');
    expect(proofs.status).toBe(401);
    const claim = await request(app).post('/api/vault/claim').send({ proofId: randomUUID() });
    expect(claim.status).toBe(401);
  });

  it('rejects client-authored Dungeon save state when no server proof exists', async () => {
    const agent = await loggedInAgent();
    await agent.put('/api/save').send(saveAtLayer(5));
    await prisma.vault.create({ data: { layer: 1, crystals: 25 } });
    const res = await agent.post('/api/vault/claim').send({ proofId: randomUUID() });
    expect(res.status).toBe(409);
    expect((await prisma.vault.findUnique({ where: { layer: 1 } }))?.crystals).toBe(25);
  });

  it('claims once per dungeon run and persists the reward without double-paying on replay', async () => {
    const agent = await loggedInAgent();
    await agent.put('/api/save').send(saveAtLayer(2, 4));
    const { proofId } = await createDungeonVaultProof(creds.email, 1);
    await prisma.vault.create({ data: { layer: 1, crystals: 25 } });
    const pending = await agent.get('/api/vault/proofs');
    expect(pending.status).toBe(200);
    expect(pending.body.proofs).toEqual([expect.objectContaining({ id: proofId, layer: 1 })]);

    const first = await agent.post('/api/vault/claim').send({ proofId });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ proofId, layer: 1, claimed: 25, replay: false, canonicalSettled: true });
    expect(first.body.inventory.stacks['currency.crystal']).toBe(29);

    const replay = await agent.post('/api/vault/claim').send({ proofId });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ proofId, layer: 1, claimed: 25, replay: true, canonicalSettled: true });
    expect(replay.body.inventory).toEqual(first.body.inventory);

    const save = await agent.get('/api/save');
    expect(save.body.save.player.loot).toBe(29);
    expect((await prisma.vault.findUnique({ where: { layer: 1 } }))?.crystals).toBe(0);
    const after = await agent.get('/api/vault/proofs');
    expect(after.body.proofs).toEqual([]);
  });

  it('fail-closes legacy death bags without contributing unproven value', async () => {
    const agent = await loggedInAgent();
    const oldBag = {
      id: 'bag-persisted-0001', layer: 2, x: 100, y: 100, loot: 10, shrooms: 0,
      weapons: ['chitin'], tools: [], armor: [], chests: 0,
      wood: 0, iron: 0, meat: 0, hide: 0, feathers: 0,
    };
    await agent.put('/api/save').send(saveAtLayer(2, 0, [oldBag]));
    const next = saveAtLayer(1, 0, []);

    const death = await agent.post('/api/save/death').send({ save: next, forfeitBagIds: [oldBag.id, 'bag-invented-0002'] });
    expect(death.status).toBe(200);
    expect(death.body).toMatchObject({
      contributed: 0,
      split: { layer1: 0, layer5: 0 },
      forfeitedBagIds: [],
    });
    expect(death.body.save.bags).toEqual([]);

    const totals = await request(app).get('/api/vault');
    expect(totals.body.layer1).toBe(0);
    expect(totals.body.layer5).toBe(0);

    // Network retry: the consumed bag no longer exists, so no second credit.
    const retry = await agent.post('/api/save/death').send({ save: next, forfeitBagIds: [oldBag.id] });
    expect(retry.body.contributed).toBe(0);
    const afterRetry = await request(app).get('/api/vault');
    expect(afterRetry.body.layer1).toBe(0);
    expect(afterRetry.body.layer5).toBe(0);
  });

  it('rejects a malformed claim body', async () => {
    const agent = await loggedInAgent();
    const res = await agent.post('/api/vault/claim').send({ layer: 3 });
    expect(res.status).toBe(400);
  });
});
