import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db.js';

const app = createApp();

async function resetDb() {
  await prisma.saveAudit.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.saveGame.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(resetDb);
afterEach(resetDb);
afterAll(async () => prisma.$disconnect());

const creds = { email: 'bob@example.com', username: 'bob', password: 'hunter2222' };

const emptyMutations = { openedChests: [], gatheredTiles: [], choppedTrees: [], farmPlots: [] };

const validSave = {
  version: 2,
  worldSeed: 424242,
  mode: 'surface',
  currentRegion: { rx: 0, ry: 0 },
  pos: { x: 100, y: 100 },
  player: {
    hp: 10,
    maxHp: 10,
    xp: 0,
    level: 1,
    light: 100,
    loot: 5,
    shrooms: 2,
    weapons: ['bone'],
    weaponIdx: 0,
    tools: [],
    armor: [],
    wood: 0,
    iron: 0,
    meat: 0,
    hide: 0,
    feathers: 0,
  },
  hasPet: false,
  bags: [],
  regions: { '0,0': emptyMutations },
  visited: ['0,0'],
  stats: {
    deaths: 0,
    kills: 0,
    totalPlaySeconds: 12,
    deepestLayer: 1,
    itemsFound: 0,
    lootLostForever: 0,
    sessions: 1,
    deathSpots: {},
  },
  savedAt: new Date().toISOString(),
};

async function loggedInAgent() {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send(creds);
  return agent;
}

describe('save routes', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/save');
    expect(res.status).toBe(401);
  });

  it('returns null for a fresh account', async () => {
    const agent = await loggedInAgent();
    const res = await agent.get('/api/save');
    expect(res.status).toBe(200);
    expect(res.body.save).toBeNull();
  });

  it('rejects a malformed save body', async () => {
    const agent = await loggedInAgent();
    const res = await agent.put('/api/save').send({ ...validSave, player: { ...validSave.player, weapons: [] } });
    expect(res.status).toBe(400);
  });

  it('rejects a weaponIdx pointing past the end of the weapons list', async () => {
    const agent = await loggedInAgent();
    const res = await agent.put('/api/save').send({ ...validSave, player: { ...validSave.player, weaponIdx: 3 } });
    expect(res.status).toBe(400);
  });

  it('accepts a save carrying craft-only gear and supply crates (schema stays in sync with src/config.ts)', async () => {
    const agent = await loggedInAgent();
    const res = await agent.put('/api/save').send({
      ...validSave,
      player: {
        ...validSave.player,
        weapons: ['bone', 'iron_falchion', 'prism_halberd'],
        armor: ['hideVest'],
        chests: 3,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.save.player.weapons).toContain('prism_halberd');
    expect(res.body.save.player.chests).toBe(3);
  });

  it('defaults chests to 0 when an old client omits it', async () => {
    const agent = await loggedInAgent();
    const res = await agent.put('/api/save').send(validSave); // validSave has no chests field
    expect(res.status).toBe(200);
    expect(res.body.save.player.chests).toBe(0);
  });

  it('rejects a region key outside the bounded world', async () => {
    const agent = await loggedInAgent();
    const res = await agent.put('/api/save').send({ ...validSave, regions: { ...validSave.regions, '9,0': emptyMutations } });
    expect(res.status).toBe(400);
  });

  it('accepts bounded legacy Dungeon presentation cache but does not treat it as authority', async () => {
    const agent = await loggedInAgent();
    const good = await agent.put('/api/save').send({
      ...validSave,
      mode: 'dungeon',
      dungeon: { layer: 3, seed: 999, mutations: emptyMutations },
    });
    expect(good.status).toBe(200);
    const bad = await agent.put('/api/save').send({
      ...validSave,
      mode: 'dungeon',
      dungeon: { layer: 6, seed: 999, mutations: emptyMutations },
    });
    expect(bad.status).toBe(400);
  });

  it('records a SaveAudit row when lifetime stats regress, without rejecting the save', async () => {
    const agent = await loggedInAgent();
    await agent.put('/api/save').send(validSave);
    const regressed = {
      ...validSave,
      stats: { ...validSave.stats, sessions: 0 }, // below the stored save's sessions: 1
    };
    const res = await agent.put('/api/save').send(regressed);
    expect(res.status).toBe(200); // trust-but-record: never a rejection
    const audits = await prisma.saveAudit.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0].kind).toBe('stats_regression');
  });

  it('rejects wealth beyond the hard schema ceiling outright', async () => {
    const agent = await loggedInAgent();
    const res = await agent.put('/api/save').send({ ...validSave, player: { ...validSave.player, loot: 2_000_000 } });
    expect(res.status).toBe(400);
  });

  it('upserts and round-trips a valid save', async () => {
    const agent = await loggedInAgent();
    const put = await agent.put('/api/save').send(validSave);
    expect(put.status).toBe(200);
    expect(put.body.save.worldSeed).toBe(validSave.worldSeed);

    const get = await agent.get('/api/save');
    expect(get.status).toBe(200);
    expect(get.body.save.player.loot).toBe(5);

    // a second PUT overwrites rather than creating a second row (one save slot per account)
    const put2 = await agent.put('/api/save').send({ ...validSave, player: { ...validSave.player, loot: 99 } });
    expect(put2.status).toBe(200);
    const rows = await prisma.saveGame.findMany();
    expect(rows).toHaveLength(1);
    expect((rows[0].data as typeof validSave).player.loot).toBe(99);
  });
});
