import { describe, it, expect } from 'vitest';
import { generateRegion, generateWorld, regionKey, Tile, tileAt } from '../world';
import { newPlayer } from '../entities';
import { TILE } from '../config';
import { SaveData, RegionMutations, buildSaveData, reconstructFromSave, migrateSave, captureMutations, emptyMutations } from '../save';
import { Stats } from '../stats';

const WORLD_SEED = 424242;

// The home region is deterministic from the world seed, so unlike the old
// per-save-seed suite we don't have to hunt seeds — but assert the fixture
// assumptions so a future generation change fails loudly here.
function homeRegionFixture() {
  const world = generateRegion(0, 0, WORLD_SEED);
  const tree = world.props.find((p) => p.kind === 'tree');
  const gatherIdx = world.tiles.findIndex((t) => t === Tile.Glowshroom || t === Tile.Crystal || t === Tile.IronOre);
  if (!(world.chests.length > 0 && tree && gatherIdx >= 0)) {
    throw new Error('home region fixture lacks a chest/tree/gatherable — adjust WORLD_SEED');
  }
  return { world, tree, gatherIdx };
}

const stats: Stats = {
  deaths: 2,
  kills: 5,
  totalPlaySeconds: 120,
  deepestLayer: 1,
  itemsFound: 3,
  lootLostForever: 0,
  sessions: 4,
  deathSpots: { '1:2:3': 1 },
};

function buildV3(overrides: Partial<Parameters<typeof buildSaveData>[0]> = {}): SaveData {
  const { world } = homeRegionFixture();
  const player = newPlayer(world);
  return buildSaveData({
    worldSeed: WORLD_SEED,
    mode: 'surface',
    currentRegion: { rx: 0, ry: 0 },
    world,
    player,
    dungeonSeed: 777,
    hasPet: false,
    bags: [],
    choppedTrees: [],
    gatheredTiles: [],
    regionStore: new Map<string, RegionMutations>(),
    visited: new Set([regionKey(0, 0)]),
    stats,
    ...overrides,
  });
}

describe('save v3 round-trip', () => {
  it('reconstructs chest/tree/tile/farm-plot mutations, inventory, and position', () => {
    const { world, tree, gatherIdx } = homeRegionFixture();
    const player = newPlayer(world);

    // mutate exactly the way game.ts's interact()/openChest do
    const chest = world.chests[0];
    chest.opened = true;
    const gatherTx = gatherIdx % world.w;
    const gatherTy = Math.floor(gatherIdx / world.w);
    world.tiles[gatherIdx] = Tile.Floor;
    world.props.splice(world.props.indexOf(tree), 1);
    player.loot = 42;
    player.wood = 3;
    player.weapons = ['bone', 'chitin', 'iron_falchion'];
    player.weaponIdx = 1;
    player.armor = ['hideVest'];
    player.chests = 2;
    player.level = 4;
    player.xp = 17;
    player.maxHp = 16;
    // stand somewhere specific and walkable, away from the entrance
    const standIdx = world.tiles.findIndex((t, i) => t === Tile.Floor && i > world.w * 20);
    player.x = (standIdx % world.w) * TILE + TILE / 2;
    player.y = Math.floor(standIdx / world.w) * TILE + TILE / 2;

    // a second, already-left region with a stored mutation
    const other = generateRegion(1, 0, WORLD_SEED);
    const otherChest = other.chests[0];
    const store = new Map<string, RegionMutations>();
    if (otherChest) {
      otherChest.opened = true;
      store.set(regionKey(1, 0), captureMutations(other, [], []));
    }

    const data = buildSaveData({
      worldSeed: WORLD_SEED,
      mode: 'surface',
      currentRegion: { rx: 0, ry: 0 },
      world,
      player,
      dungeonSeed: 777,
      hasPet: true,
      bags: [{ id: 'bag-test', layer: 1, regionKey: regionKey(0, 0), x: 80, y: 96, loot: 7, shrooms: 1, weapons: ['chitin'], tools: ['axe'], armor: [], chests: 0, wood: 2, iron: 0, meat: 0, hide: 0, feathers: 0 }],
      choppedTrees: [{ x: tree.x, y: tree.y }],
      gatheredTiles: [{ tx: gatherTx, ty: gatherTy }],
      regionStore: store,
      visited: new Set([regionKey(0, 0), regionKey(1, 0)]),
      stats,
    });

    const r = reconstructFromSave(data);
    expect(r.hasPet).toBe(true);
    expect(r.bags).toHaveLength(1);
    expect(r.bags[0]).toMatchObject({ id: 'bag-test', loot: 7, weapons: ['chitin'] });
    expect(r.world.region).toEqual({ rx: 0, ry: 0 });
    expect(r.world.chests.find((c) => c.x === chest.x && c.y === chest.y)?.opened).toBe(true);
    expect(tileAt(r.world, gatherTx, gatherTy)).toBe(Tile.Floor);
    expect(r.world.props.some((p) => p.kind === 'tree' && p.x === tree.x && p.y === tree.y)).toBe(false);
    expect(r.player.loot).toBe(42);
    expect(r.player.weapons).toEqual(['bone', 'chitin', 'iron_falchion']);
    expect(r.player.weaponIdx).toBe(1);
    expect(r.player.x).toBe(player.x);
    expect(r.player.y).toBe(player.y);
    expect(r.currentLogs.choppedTrees).toEqual([{ x: tree.x, y: tree.y }]);

    // the other region's snapshot survives in the store, not the live world
    if (otherChest) {
      expect(r.regionStore.get(regionKey(1, 0))?.openedChests).toEqual([{ x: otherChest.x, y: otherChest.y }]);
    }
    expect(r.regionStore.has(regionKey(0, 0))).toBe(false); // loaded world owns its own mutations
    expect(r.visited.has(regionKey(1, 0))).toBe(true);
  });

  it('keeps legacy Dungeon metadata but reconstructs only the surface return checkpoint', () => {
    const dungeon = generateWorld(3, 999);
    const player = newPlayer(dungeon);
    player.loot = 9;
    const data = buildSaveData({
      worldSeed: WORLD_SEED,
      mode: 'dungeon',
      currentRegion: { rx: 0, ry: 0 },
      world: dungeon,
      player,
      dungeonSeed: 999,
      hasPet: false,
      bags: [],
      choppedTrees: [],
      gatheredTiles: [],
      regionStore: new Map(),
      visited: new Set([regionKey(0, 0)]),
      stats,
    });
    expect(data.mode).toBe('dungeon');
    expect(data.dungeon?.layer).toBe(3);
    const r = reconstructFromSave(data);
    expect(r.world.layer).toBe(1);
    expect(r.world.region).toEqual({ rx: 0, ry: 0 });
    expect(r.activeDungeon).toMatchObject({ floor: 3, seed: 999, returnRegion: { rx: 0, ry: 0 } });
    expect(r.player.loot).toBe(9);
  });

  it('falls back to the entrance when the saved position is not standable', () => {
    const data = buildV3();
    const fixture = homeRegionFixture().world;
    const solid = fixture.tiles.findIndex((tile) => tile === Tile.Brick || tile === Tile.Rock);
    expect(solid).toBeGreaterThanOrEqual(0);
    data.pos = { x: (solid % fixture.w + 0.5) * TILE, y: (Math.floor(solid / fixture.w) + 0.5) * TILE };
    const r = reconstructFromSave(data);
    expect(r.player.x).toBe((r.world.entrance.x + 0.5) * TILE);
    expect(r.player.y).toBe((r.world.entrance.y + 0.5) * TILE);
  });

  it('revives a death-screen save (hp 0) at full hp on load', () => {
    const data = buildV3();
    data.player.hp = 0;
    data.player.maxHp = 14;
    const r = reconstructFromSave(data);
    expect(r.player.hp).toBe(14);
  });

  it('clamps an out-of-range weaponIdx instead of loading a broken run', () => {
    const data = buildV3();
    data.player.weapons = ['bone', 'chitin'];
    data.player.weaponIdx = 7; // hand-edited / corrupt save
    const r = reconstructFromSave(data);
    expect(r.player.weaponIdx).toBe(1);
    expect(r.player.weapons[r.player.weaponIdx]).toBe('chitin');
  });
});

describe('migrateSave', () => {
  it('normalizes a matching v3 save without changing its data', () => {
    const data = buildV3();
    expect(migrateSave(data, WORLD_SEED)).toStrictEqual(data);
  });

  it('migrates a v1 save: inventory and stats survive, world mutations are dropped', () => {
    const v1 = {
      version: 1 as const,
      seed: 12345,
      layer: 3,
      player: { ...buildV3().player, loot: 77, weapons: ['bone', 'crystal'] as SaveData['player']['weapons'], weaponIdx: 1 },
      hasPet: true,
      mutations: { ...emptyMutations(), gatheredTiles: [{ tx: 5, ty: 6 }] },
      stats,
      savedAt: new Date().toISOString(),
    };
    const v3 = migrateSave(v1, WORLD_SEED);
    expect(v3.version).toBe(3);
    expect(v3.worldSeed).toBe(WORLD_SEED);
    expect(v3.mode).toBe('surface');
    expect(v3.currentRegion).toEqual({ rx: 0, ry: 0 });
    expect(v3.player.loot).toBe(77);
    expect(v3.hasPet).toBe(true);
    expect(v3.regions).toEqual({}); // the v1 per-account world no longer exists
    // and it loads: fresh home region, entrance spawn, inventory intact
    const r = reconstructFromSave(v3);
    expect(r.player.loot).toBe(77);
    expect(r.world.region).toEqual({ rx: 0, ry: 0 });
  });

  it('resets regions (but keeps the player) when the global world seed changed', () => {
    const data = buildV3();
    data.regions[regionKey(2, 2)] = emptyMutations();
    data.player.loot = 31;
    const migrated = migrateSave(data, WORLD_SEED + 1);
    expect(migrated.worldSeed).toBe(WORLD_SEED + 1);
    expect(migrated.regions).toEqual({});
    expect(migrated.player.loot).toBe(31);
    expect(migrated.mode).toBe('surface');
  });
});
