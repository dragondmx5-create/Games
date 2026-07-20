// Cloud-save serialize/deserialize, format v3.
//
// The overworld is deterministic from (worldSeed, region coordinates). Dungeon
// topology is never reconstructed from Cloud Save: only a live server snapshot
// may restore an instance. The Black Market remains a generated hub whose return
// point is stored separately. Saves persist presentation checkpoints and legacy
// metadata, not Dungeon authority.
import { TILE, WeaponId, ToolId, ArmorId, CropId } from './config';
import {
  World,
  Tile,
  generateRegion,
  generateBlackMarketHub,
  regionKey,
  inWorldBounds,
  isWalkable,
  tileAt,
} from './world';
import { LootBag, Player, newPlayer } from './entities';
import { Stats } from './stats';
import type { LandId } from './overworld/types';

export interface RegionMutations {
  openedChests: { x: number; y: number }[];
  gatheredTiles: { tx: number; ty: number }[];
  choppedTrees: { x: number; y: number }[];
  farmPlots: { tx: number; ty: number; crop: CropId; stage: 0 | 1 | 2 | 3; timer: number }[];
}

export interface SavePlayer {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  light: number;
  loot: number;
  shrooms: number;
  weapons: WeaponId[];
  weaponIdx: number;
  tools: ToolId[];
  armor: ArmorId[];
  chests: number;
  wood: number;
  iron: number;
  meat: number;
  hide: number;
  feathers: number;
}

export interface SavedDungeonState {
  id: string;
  floor: number;
  /** Compatibility alias used by older server-side vault logic. */
  layer: number;
  seed: number;
  returnRegion: { rx: number; ry: number };
  returnPos: { x: number; y: number };
  mutations: RegionMutations;
}

export interface SavedMarketState {
  sourceLandId: LandId;
  returnRegion: { rx: number; ry: number };
  returnPos: { x: number; y: number };
}

export interface SavedUnderworldState {
  reputation: number;
  discoveredRoutes: LandId[];
  forbiddenDungeonKeys: number;
  activeContracts: number;
  inspectionProtection: number;
}

export interface SaveData {
  version: 3;
  worldSeed: number;
  mode: 'surface' | 'dungeon' | 'black-market';
  /** Last/returning overworld region while inside an instance. */
  currentRegion: { rx: number; ry: number };
  /** Player position in the currently loaded world. */
  pos: { x: number; y: number };
  dungeon?: SavedDungeonState;
  market?: SavedMarketState;
  underworld: SavedUnderworldState;
  player: SavePlayer;
  hasPet: boolean;
  bags: LootBag[];
  regions: Record<string, RegionMutations>;
  visited: string[];
  stats: Stats;
  savedAt: string;
}

/** Region-overworld format used before the six-land architecture. */
interface SaveDataV2 {
  version: 2;
  worldSeed: number;
  mode: 'surface' | 'dungeon';
  currentRegion: { rx: number; ry: number };
  pos: { x: number; y: number };
  dungeon?: { layer: number; seed: number; mutations: RegionMutations };
  player: SavePlayer;
  hasPet: boolean;
  bags?: LootBag[];
  regions: Record<string, RegionMutations>;
  visited: string[];
  stats: Stats;
  savedAt: string;
}

/** Original single-map format, kept only for migration. */
interface SaveDataV1 {
  version: 1;
  seed: number;
  layer: number;
  player: SavePlayer;
  hasPet: boolean;
  mutations: RegionMutations;
  stats: Stats;
  savedAt: string;
}

export type AnySaveData = SaveData | SaveDataV2 | SaveDataV1;

export function emptyMutations(): RegionMutations {
  return { openedChests: [], gatheredTiles: [], choppedTrees: [], farmPlots: [] };
}

export function captureMutations(
  world: World,
  choppedTrees: { x: number; y: number }[],
  gatheredTiles: { tx: number; ty: number }[],
): RegionMutations {
  return {
    openedChests: world.chests.filter((c) => c.opened && !c.serverOwned).map((c) => ({ x: c.x, y: c.y })),
    gatheredTiles: gatheredTiles.map((t) => ({ ...t })),
    choppedTrees: choppedTrees.map((t) => ({ ...t })),
    farmPlots: world.farmPlots.filter((f) => !f.serverOwned).map((f) => ({ tx: f.tx, ty: f.ty, crop: f.crop, stage: f.stage, timer: f.timer })),
  };
}

export function applyMutations(world: World, m: RegionMutations): void {
  for (const { x, y } of m.openedChests) {
    const chest = world.chests.find((c) => c.x === x && c.y === y);
    if (chest) chest.opened = true;
  }
  for (const { tx, ty } of m.gatheredTiles) {
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) continue;
    if (tileAt(world, tx, ty) !== Tile.Floor) world.tiles[ty * world.w + tx] = Tile.Floor;
  }
  const chopped = new Set(m.choppedTrees.map(({ x, y }) => `${x},${y}`));
  world.props = world.props.filter((prop) => prop.kind !== 'tree' || !chopped.has(`${prop.x},${prop.y}`));
  for (const saved of m.farmPlots) {
    const plot = world.farmPlots.find((f) => f.tx === saved.tx && f.ty === saved.ty);
    if (!plot) continue;
    plot.crop = saved.crop;
    plot.stage = saved.stage;
    plot.timer = saved.timer;
  }
}

function cloneLootBag(bag: LootBag): LootBag {
  return { ...bag, weapons: [...bag.weapons], tools: [...bag.tools], armor: [...bag.armor] };
}

export interface BuildSaveDataParams {
  worldSeed: number;
  mode: SaveData['mode'];
  currentRegion: { rx: number; ry: number };
  world: World;
  player: Player;
  activeDungeon?: Omit<SavedDungeonState, 'mutations' | 'layer'> | null;
  /** Legacy test/caller compatibility; used to synthesize a default dungeon run. */
  dungeonSeed?: number;
  marketReturn?: SavedMarketState | null;
  underworld?: SavedUnderworldState;
  hasPet: boolean;
  bags: LootBag[];
  choppedTrees: { x: number; y: number }[];
  gatheredTiles: { tx: number; ty: number }[];
  regionStore: Map<string, RegionMutations>;
  visited: Set<string>;
  stats: Stats;
}

export function buildSaveData(params: BuildSaveDataParams): SaveData {
  const {
    worldSeed,
    mode,
    currentRegion,
    world,
    player: p,
    activeDungeon: suppliedDungeon,
    dungeonSeed,
    marketReturn = null,
    underworld = { reputation: 0, discoveredRoutes: ['green-land'], forbiddenDungeonKeys: 0, activeContracts: 0, inspectionProtection: 0 },
    hasPet,
    bags,
    choppedTrees,
    gatheredTiles,
    regionStore,
    visited,
    stats,
  } = params;

  const regions: Record<string, RegionMutations> = {};
  for (const [key, mutations] of regionStore) regions[key] = mutations;

  const activeDungeon = suppliedDungeon ?? (mode === 'dungeon' ? {
    id: 'old-crown-mine',
    floor: world.layer,
    seed: dungeonSeed ?? 0,
    returnRegion: { ...currentRegion },
    returnPos: { x: -1, y: -1 },
  } : null);

  let dungeon: SavedDungeonState | undefined;
  if (mode === 'dungeon' && activeDungeon) {
    dungeon = {
      ...activeDungeon,
      floor: activeDungeon.floor,
      layer: activeDungeon.floor,
      mutations: captureMutations(world, choppedTrees, gatheredTiles),
    };
  } else if (mode === 'surface') {
    regions[regionKey(currentRegion.rx, currentRegion.ry)] = captureMutations(world, choppedTrees, gatheredTiles);
  }

  return {
    version: 3,
    worldSeed,
    mode,
    currentRegion: { ...currentRegion },
    pos: { x: p.x, y: p.y },
    dungeon,
    market: mode === 'black-market' && marketReturn ? { ...marketReturn, returnRegion: { ...marketReturn.returnRegion }, returnPos: { ...marketReturn.returnPos } } : undefined,
    underworld: {
      reputation: Math.max(0, Math.floor(underworld.reputation)),
      discoveredRoutes: [...new Set(underworld.discoveredRoutes)],
      forbiddenDungeonKeys: Math.max(0, Math.floor(underworld.forbiddenDungeonKeys ?? 0)),
      activeContracts: Math.max(0, Math.floor(underworld.activeContracts ?? 0)),
      inspectionProtection: Math.max(0, Math.floor(underworld.inspectionProtection ?? 0)),
    },
    player: {
      hp: p.hp,
      maxHp: p.maxHp,
      xp: p.xp,
      level: p.level,
      light: p.light,
      loot: p.loot,
      shrooms: p.shrooms,
      weapons: [...p.weapons],
      weaponIdx: p.weaponIdx,
      tools: [...p.tools],
      armor: [...p.armor],
      chests: p.chests,
      wood: p.wood,
      iron: p.iron,
      meat: p.meat,
      hide: p.hide,
      feathers: p.feathers,
    },
    hasPet,
    bags: bags.map(cloneLootBag),
    regions,
    visited: [...visited],
    stats,
    savedAt: new Date().toISOString(),
  };
}

function resetForWorldSeed(data: SaveData, worldSeed: number): SaveData {
  return {
    ...data,
    worldSeed,
    mode: 'surface',
    currentRegion: { rx: 0, ry: 0 },
    pos: { x: -1, y: -1 },
    dungeon: undefined,
    market: undefined,
    regions: {},
    visited: [regionKey(0, 0)],
  };
}

/** Accepts v1-v3 and always returns normalized v3. */
export function migrateSave(raw: AnySaveData, worldSeed: number): SaveData {
  if (raw.version === 3) {
    const normalized: SaveData = {
      ...raw,
      bags: Array.isArray(raw.bags) ? raw.bags : [],
      underworld: {
        reputation: Math.max(0, raw.underworld?.reputation ?? 0),
        discoveredRoutes: [...new Set(raw.underworld?.discoveredRoutes ?? ['green-land'])],
        forbiddenDungeonKeys: Math.max(0, raw.underworld?.forbiddenDungeonKeys ?? 0),
        activeContracts: Math.max(0, raw.underworld?.activeContracts ?? 0),
        inspectionProtection: Math.max(0, raw.underworld?.inspectionProtection ?? 0),
      },
    };
    return normalized.worldSeed === worldSeed ? normalized : resetForWorldSeed(normalized, worldSeed);
  }

  if (raw.version === 2) {
    const layer = raw.dungeon?.layer ?? 1;
    const migrated: SaveData = {
      version: 3,
      worldSeed: raw.worldSeed,
      mode: raw.mode,
      currentRegion: { ...raw.currentRegion },
      pos: { ...raw.pos },
      dungeon: raw.mode === 'dungeon' && raw.dungeon
        ? {
            id: 'old-crown-mine',
            floor: layer,
            layer,
            seed: raw.dungeon.seed,
            returnRegion: { ...raw.currentRegion },
            returnPos: { x: -1, y: -1 },
            mutations: raw.dungeon.mutations,
          }
        : undefined,
      market: undefined,
      underworld: { reputation: 0, discoveredRoutes: ['green-land'], forbiddenDungeonKeys: 0, activeContracts: 0, inspectionProtection: 0 },
      player: { ...raw.player, chests: raw.player.chests ?? 0 },
      hasPet: raw.hasPet,
      bags: (raw.bags ?? []).map(cloneLootBag),
      regions: raw.regions ?? {},
      visited: raw.visited?.length ? [...raw.visited] : [regionKey(0, 0)],
      stats: raw.stats,
      savedAt: raw.savedAt,
    };
    return migrated.worldSeed === worldSeed ? migrated : resetForWorldSeed(migrated, worldSeed);
  }

  const migrated: SaveData = {
    version: 3,
    worldSeed,
    mode: 'surface',
    currentRegion: { rx: 0, ry: 0 },
    pos: { x: -1, y: -1 },
    dungeon: undefined,
    market: undefined,
    underworld: { reputation: 0, discoveredRoutes: ['green-land'], forbiddenDungeonKeys: 0, activeContracts: 0, inspectionProtection: 0 },
    player: { ...raw.player, chests: raw.player.chests ?? 0 },
    hasPet: raw.hasPet,
    bags: [],
    regions: {},
    visited: [regionKey(0, 0)],
    stats: raw.stats,
    savedAt: raw.savedAt,
  };
  return migrated;
}

export interface ReconstructedSave {
  world: World;
  player: Player;
  hasPet: boolean;
  bags: LootBag[];
  regionStore: Map<string, RegionMutations>;
  visited: Set<string>;
  activeDungeon: Omit<SavedDungeonState, 'mutations' | 'layer'> | null;
  marketReturn: SavedMarketState | null;
  underworld: SavedUnderworldState;
  currentLogs: { choppedTrees: { x: number; y: number }[]; gatheredTiles: { tx: number; ty: number }[] };
}

export function reconstructFromSave(data: SaveData): ReconstructedSave {
  const fallbackRegion = { rx: 0, ry: 0 };
  const { rx, ry } = inWorldBounds(data.currentRegion.rx, data.currentRegion.ry) ? data.currentRegion : fallbackRegion;
  const regionStore = new Map<string, RegionMutations>();
  for (const [key, mutations] of Object.entries(data.regions)) regionStore.set(key, mutations);
  const visited = new Set<string>(data.visited.length ? data.visited : [regionKey(0, 0)]);

  let world: World;
  let current = emptyMutations();
  let activeDungeon: ReconstructedSave['activeDungeon'] = null;
  let marketReturn: SavedMarketState | null = null;

  if (data.mode === 'dungeon' && data.dungeon) {
    const floor = data.dungeon.floor ?? data.dungeon.layer;
    const returnRegion = inWorldBounds(data.dungeon.returnRegion.rx, data.dungeon.returnRegion.ry)
      ? data.dungeon.returnRegion
      : fallbackRegion;
    world = generateRegion(returnRegion.rx, returnRegion.ry, data.worldSeed);
    const mutations = regionStore.get(regionKey(returnRegion.rx, returnRegion.ry));
    if (mutations) {
      applyMutations(world, mutations);
      current = mutations;
    }
    regionStore.delete(regionKey(returnRegion.rx, returnRegion.ry));
    activeDungeon = {
      id: data.dungeon.id,
      floor,
      seed: data.dungeon.seed,
      returnRegion: { ...returnRegion },
      returnPos: { ...data.dungeon.returnPos },
    };
  } else if (data.mode === 'black-market' && data.market) {
    world = generateBlackMarketHub(data.market.sourceLandId, data.worldSeed);
    marketReturn = {
      sourceLandId: data.market.sourceLandId,
      returnRegion: { ...data.market.returnRegion },
      returnPos: { ...data.market.returnPos },
    };
  } else {
    world = generateRegion(rx, ry, data.worldSeed);
    const mutations = regionStore.get(regionKey(rx, ry));
    if (mutations) {
      applyMutations(world, mutations);
      current = mutations;
    }
    regionStore.delete(regionKey(rx, ry));
  }

  const player = newPlayer(world);
  const weapons = data.player.weapons.length > 0 ? [...data.player.weapons] : ['bone'];
  Object.assign(player, {
    ...data.player,
    weapons,
    weaponIdx: Math.min(Math.max(0, data.player.weaponIdx), weapons.length - 1),
    tools: [...data.player.tools],
    armor: [...data.player.armor],
    chests: data.player.chests ?? 0,
  });

  const candidatePosition = activeDungeon?.returnPos ?? data.pos;
  const tx = Math.floor(candidatePosition.x / TILE);
  const ty = Math.floor(candidatePosition.y / TILE);
  if (candidatePosition.x >= 0 && isWalkable(world, tx, ty)) {
    player.x = candidatePosition.x;
    player.y = candidatePosition.y;
  } else {
    player.x = (world.entrance.x + 0.5) * TILE;
    player.y = (world.entrance.y + 0.5) * TILE;
  }
  if (player.hp <= 0) player.hp = player.maxHp;

  return {
    world,
    player,
    hasPet: data.hasPet,
    bags: (data.bags ?? []).map(cloneLootBag),
    regionStore,
    visited,
    activeDungeon,
    marketReturn,
    underworld: {
      reputation: Math.max(0, data.underworld?.reputation ?? 0),
      discoveredRoutes: [...new Set(data.underworld?.discoveredRoutes ?? ['green-land'])],
      forbiddenDungeonKeys: Math.max(0, data.underworld?.forbiddenDungeonKeys ?? 0),
      activeContracts: Math.max(0, data.underworld?.activeContracts ?? 0),
      inspectionProtection: Math.max(0, data.underworld?.inspectionProtection ?? 0),
    },
    currentLogs: {
      choppedTrees: current.choppedTrees.map((t) => ({ ...t })),
      gatheredTiles: current.gatheredTiles.map((t) => ({ ...t })),
    },
  };
}
