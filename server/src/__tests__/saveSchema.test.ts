import { describe, expect, it } from 'vitest';
import { saveDataSchema } from '../save/schema.js';

const emptyMutations = { openedChests: [], gatheredTiles: [], choppedTrees: [], farmPlots: [] };

function baseSave() {
  return {
    version: 2,
    worldSeed: 1,
    mode: 'surface',
    currentRegion: { rx: 0, ry: 0 },
    pos: { x: 10, y: 10 },
    player: {
      hp: 10, maxHp: 10, xp: 0, level: 1, light: 100, loot: 0, shrooms: 0,
      weapons: ['bone'], weaponIdx: 0, tools: [], armor: [],
      wood: 0, iron: 0, meat: 0, hide: 0, feathers: 0,
    },
    hasPet: false,
    regions: { '0,0': emptyMutations },
    visited: ['0,0'],
    stats: {
      deaths: 0, kills: 0, totalPlaySeconds: 0, deepestLayer: 1,
      itemsFound: 0, lootLostForever: 0, sessions: 1, deathSpots: {},
    },
    savedAt: new Date().toISOString(),
  };
}

describe('saveDataSchema hardening', () => {
  it('defaults legacy v2 chests and bags', () => {
    const parsed = saveDataSchema.parse(baseSave());
    expect(parsed.player.chests).toBe(0);
    expect(parsed.bags).toEqual([]);
  });

  it('requires dungeon details when mode is dungeon', () => {
    expect(saveDataSchema.safeParse({ ...baseSave(), mode: 'dungeon' }).success).toBe(false);
  });

  it('rejects duplicate persisted bag ids', () => {
    const bag = {
      id: 'bag-duplicate-01', layer: 1, regionKey: '0,0', x: 10, y: 10,
      loot: 1, shrooms: 0, weapons: [], tools: [], armor: [], chests: 0,
      wood: 0, iron: 0, meat: 0, hide: 0, feathers: 0,
    };
    expect(saveDataSchema.safeParse({ ...baseSave(), bags: [bag, bag] }).success).toBe(false);
  });

  it('rejects a schema-valid object whose serialized payload exceeds the save route budget', () => {
    const gatheredTiles = Array.from({ length: 50_000 }, () => ({ tx: 219, ty: 219 }));
    const oversized = { ...baseSave(), regions: { '0,0': { ...emptyMutations, gatheredTiles } } };
    expect(saveDataSchema.safeParse(oversized).success).toBe(false);
  });

  it('rejects mutation coordinates outside every supported map', () => {
    const mutations = { ...emptyMutations, gatheredTiles: [{ tx: 1_000_000, ty: 0 }] };
    expect(saveDataSchema.safeParse({ ...baseSave(), regions: { '0,0': mutations } }).success).toBe(false);
  });
});
