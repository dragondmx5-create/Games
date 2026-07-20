import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { detectSaveAnomalies } from '../save/audit.js';
import type { SaveData } from '../save/schema.js';
import { createApp } from '../app.js';

function baseSave(overrides: { loot?: number; stats?: Partial<SaveData['stats']> } = {}): SaveData {
  return {
    version: 3,
    worldSeed: 1,
    mode: 'surface',
    currentRegion: { rx: 0, ry: 0 },
    pos: { x: 10, y: 10 },
    dungeon: undefined,
    market: undefined,
    underworld: { reputation: 0, discoveredRoutes: ['green-land'], forbiddenDungeonKeys: 0, activeContracts: 0, inspectionProtection: 0 },
    player: {
      hp: 10, maxHp: 10, xp: 0, level: 1, light: 100,
      loot: overrides.loot ?? 0, shrooms: 0,
      weapons: ['bone'], weaponIdx: 0, tools: [], armor: [], chests: 0,
      wood: 0, iron: 0, meat: 0, hide: 0, feathers: 0,
    },
    hasPet: false,
    bags: [],
    regions: {},
    visited: ['0,0'],
    stats: {
      deaths: 1, kills: 10, totalPlaySeconds: 500, deepestLayer: 1,
      itemsFound: 5, lootLostForever: 0, sessions: 3, deathSpots: {},
      ...overrides.stats,
    },
    savedAt: new Date().toISOString(),
  };
}

describe('detectSaveAnomalies', () => {
  it('is silent for a normal transition', () => {
    const prev = baseSave({ loot: 10 });
    const next = baseSave({ loot: 40, stats: { kills: 12, totalPlaySeconds: 700 } });
    expect(detectSaveAnomalies(prev, next, 200)).toEqual([]);
  });

  it('flags lifetime stats going backwards', () => {
    const prev = baseSave();
    const next = baseSave({ stats: { kills: 2, totalPlaySeconds: 100 } });
    const entries = detectSaveAnomalies(prev, next, 60);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('stats_regression');
    const regressions = entries[0].detail.regressions as Record<string, { from: number; to: number }>;
    expect(regressions.kills).toEqual({ from: 10, to: 2 });
    expect(regressions.totalPlaySeconds).toEqual({ from: 500, to: 100 });
  });

  it('flags implausibly fast wealth growth, but only over a sustained window', () => {
    const prev = baseSave({ loot: 0 });
    const next = baseSave({ loot: 50_000 });
    // 60s window at ~833 crystals/s — flagged
    expect(detectSaveAnomalies(prev, next, 60).map((e) => e.kind)).toContain('implausible_gain');
    // 5s window — below MIN_WINDOW_SECONDS, a vault jackpot can look like this
    expect(detectSaveAnomalies(prev, next, 5)).toEqual([]);
  });

  it('does not flag wealth going down (spending, dying)', () => {
    const prev = baseSave({ loot: 500 });
    const next = baseSave({ loot: 0 });
    expect(detectSaveAnomalies(prev, next, 60)).toEqual([]);
  });
});

describe('health check', () => {
  it('reports ok with a live database', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });
});
