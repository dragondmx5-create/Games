import { z } from 'zod';
import { OVERWORLD_REGION_COUNT, OVERWORLD_WORLD_RADIUS } from '../world/worldBounds.js';

// Server validation for client SaveData v3. A narrow v2 schema remains only
// so existing persisted saves can be normalized when vault/death services read
// them. All newly written rows are stored as v3.

const weaponId = z.enum(['bone', 'chitin', 'crystal', 'wood_club', 'iron_falchion', 'hide_warclub', 'feather_javelin', 'prism_halberd']);
const toolId = z.enum(['axe', 'pickaxe']);
const armorId = z.enum(['leather', 'iron', 'hideVest']);
const cropId = z.enum(['glowshroom', 'caveberry']);
const landId = z.enum(['witchlands', 'green-land', 'rainforest', 'frostlands', 'sunscorched-desert', 'cinder-coast']);

const WORLD_RADIUS = OVERWORLD_WORLD_RADIUS;
const MAX_REGIONS = OVERWORLD_REGION_COUNT;
const REGION_KEY = /^-?\d+,-?\d+$/;
const MAX_SAVE_BYTES = 900 * 1024;

function regionKeyInBounds(key: string): boolean {
  if (!REGION_KEY.test(key)) return false;
  const [rx, ry] = key.split(',').map(Number);
  return Math.abs(rx) <= WORLD_RADIUS && Math.abs(ry) <= WORLD_RADIUS;
}

const nonNegativeInt = z.number().int().min(0).max(1_000_000);
const regionCoord = z.object({
  rx: z.number().int().min(-WORLD_RADIUS).max(WORLD_RADIUS),
  ry: z.number().int().min(-WORLD_RADIUS).max(WORLD_RADIUS),
});
const worldPos = z.object({ x: z.number().min(-64).max(4_096), y: z.number().min(-64).max(4_096) });

const statsSchema = z.object({
  deaths: z.number().int().min(0),
  kills: z.number().int().min(0),
  totalPlaySeconds: z.number().min(0),
  deepestLayer: z.number().int().min(1).max(20),
  itemsFound: z.number().int().min(0),
  lootLostForever: z.number().int().min(0),
  sessions: z.number().int().min(0),
  deathSpots: z.record(z.string().max(64), z.number().int().min(0).max(1_000_000))
    .refine((spots) => Object.keys(spots).length <= 5_000, { message: 'too many death spots' }),
});

const tileCoord = z.number().int().min(0).max(219);
const pixelCoord = z.number().min(-64).max(4_096);

const mutationsSchema = z.object({
  openedChests: z.array(z.object({ x: pixelCoord, y: pixelCoord })).max(512),
  gatheredTiles: z.array(z.object({ tx: tileCoord, ty: tileCoord })).max(50_000),
  choppedTrees: z.array(z.object({ x: pixelCoord, y: pixelCoord })).max(12_000),
  farmPlots: z.array(z.object({
    tx: tileCoord,
    ty: tileCoord,
    crop: cropId,
    stage: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    timer: z.number().min(0).max(1_000_000),
  })).max(1_024),
});

const playerSchema = z.object({
  hp: z.number().min(0).max(1_000),
  maxHp: z.number().min(1).max(1_000),
  xp: z.number().min(0).max(1_000_000),
  level: z.number().int().min(1).max(200),
  light: z.number().min(0).max(100),
  loot: nonNegativeInt,
  shrooms: nonNegativeInt,
  weapons: z.array(weaponId).min(1).max(16),
  weaponIdx: z.number().int().min(0),
  tools: z.array(toolId).max(8),
  armor: z.array(armorId).max(8),
  chests: z.number().int().min(0).max(10_000).default(0),
  wood: nonNegativeInt,
  iron: nonNegativeInt,
  meat: nonNegativeInt,
  hide: nonNegativeInt,
  feathers: nonNegativeInt,
}).refine((player) => player.weaponIdx < player.weapons.length, { message: 'weaponIdx out of range' });

export const lootBagSchema = z.object({
  id: z.string().min(8).max(80),
  layer: z.number().int().min(1).max(20),
  regionKey: z.string().refine(regionKeyInBounds, { message: 'bag region outside world bounds' }).optional(),
  x: pixelCoord,
  y: pixelCoord,
  loot: nonNegativeInt,
  shrooms: nonNegativeInt,
  weapons: z.array(weaponId).max(16),
  tools: z.array(toolId).max(8),
  armor: z.array(armorId).max(8),
  chests: z.number().int().min(0).max(10_000),
  wood: nonNegativeInt,
  iron: nonNegativeInt,
  meat: nonNegativeInt,
  hide: nonNegativeInt,
  feathers: nonNegativeInt,
});

const regionsSchema = z.record(z.string(), mutationsSchema)
  .refine((regions) => Object.keys(regions).length <= MAX_REGIONS, { message: 'too many region entries' })
  .refine((regions) => Object.keys(regions).every(regionKeyInBounds), { message: 'region key outside world bounds' });
const visitedSchema = z.array(z.string()).max(MAX_REGIONS)
  .refine((visited) => visited.every(regionKeyInBounds), { message: 'visited key outside world bounds' });

const dungeonV3Schema = z.object({
  id: z.string().min(3).max(80),
  floor: z.number().int().min(1).max(20),
  layer: z.number().int().min(1).max(20),
  seed: z.number().int(),
  returnRegion: regionCoord,
  returnPos: worldPos,
  mutations: mutationsSchema,
}).refine((dungeon) => dungeon.floor === dungeon.layer, { message: 'floor/layer mismatch' });

const marketSchema = z.object({
  sourceLandId: landId,
  returnRegion: regionCoord,
  returnPos: worldPos,
});

const underworldSchema = z.object({
  reputation: nonNegativeInt,
  discoveredRoutes: z.array(landId).max(6),
  forbiddenDungeonKeys: z.number().int().min(0).max(1_000),
  activeContracts: z.number().int().min(0).max(1_000),
  inspectionProtection: z.number().int().min(0).max(1_000),
});

const saveDataV3Schema = z.object({
  version: z.literal(3),
  worldSeed: z.number().int(),
  mode: z.enum(['surface', 'dungeon', 'black-market']),
  currentRegion: regionCoord,
  pos: worldPos,
  dungeon: dungeonV3Schema.optional(),
  market: marketSchema.optional(),
  underworld: underworldSchema,
  player: playerSchema,
  hasPet: z.boolean(),
  bags: z.array(lootBagSchema).max(32).default([]),
  regions: regionsSchema,
  visited: visitedSchema,
  stats: statsSchema,
  savedAt: z.string().datetime(),
}).superRefine((save, ctx) => {
  if (Buffer.byteLength(JSON.stringify(save), 'utf8') > MAX_SAVE_BYTES) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'save payload is too large' });
  }
  if (save.mode === 'dungeon' && !save.dungeon) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dungeon'], message: 'dungeon state required in dungeon mode' });
  }
  if (save.mode === 'black-market' && !save.market) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['market'], message: 'market return state required in black-market mode' });
  }
  const bagIds = new Set(save.bags.map((bag) => bag.id));
  if (bagIds.size !== save.bags.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bags'], message: 'duplicate bag id' });
  }
  const routes = new Set(save.underworld.discoveredRoutes);
  if (routes.size !== save.underworld.discoveredRoutes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['underworld', 'discoveredRoutes'], message: 'duplicate discovered route' });
  }
});

const saveDataV2Schema = z.object({
  version: z.literal(2),
  worldSeed: z.number().int(),
  mode: z.enum(['surface', 'dungeon']),
  currentRegion: regionCoord,
  pos: worldPos,
  dungeon: z.object({
    layer: z.number().int().min(1).max(5),
    seed: z.number().int(),
    mutations: mutationsSchema,
  }).optional(),
  player: playerSchema,
  hasPet: z.boolean(),
  bags: z.array(lootBagSchema).max(32).default([]),
  regions: regionsSchema,
  visited: visitedSchema,
  stats: statsSchema,
  savedAt: z.string().datetime(),
}).superRefine((save, ctx) => {
  if (Buffer.byteLength(JSON.stringify(save), 'utf8') > MAX_SAVE_BYTES) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'save payload is too large' });
  }
  if (save.mode === 'dungeon' && !save.dungeon) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dungeon'], message: 'dungeon state required in dungeon mode' });
  }
  const bagIds = new Set(save.bags.map((bag) => bag.id));
  if (bagIds.size !== save.bags.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bags'], message: 'duplicate bag id' });
  }
});

type SaveV3 = z.infer<typeof saveDataV3Schema>;
type SaveV2 = z.infer<typeof saveDataV2Schema>;

function migrateV2(save: SaveV2): SaveV3 {
  const layer = save.dungeon?.layer ?? 1;
  return {
    version: 3,
    worldSeed: save.worldSeed,
    mode: save.mode,
    currentRegion: save.currentRegion,
    pos: save.pos,
    dungeon: save.mode === 'dungeon' && save.dungeon ? {
      id: 'old-crown-mine',
      floor: layer,
      layer,
      seed: save.dungeon.seed,
      returnRegion: save.currentRegion,
      returnPos: { x: -1, y: -1 },
      mutations: save.dungeon.mutations,
    } : undefined,
    market: undefined,
    underworld: {
      reputation: 0,
      discoveredRoutes: ['green-land'],
      forbiddenDungeonKeys: 0,
      activeContracts: 0,
      inspectionProtection: 0,
    },
    player: save.player,
    hasPet: save.hasPet,
    bags: save.bags,
    regions: save.regions,
    visited: save.visited,
    stats: save.stats,
    savedAt: save.savedAt,
  };
}

export const saveDataSchema = z.union([saveDataV3Schema, saveDataV2Schema]).transform((save): SaveV3 =>
  save.version === 3 ? save : migrateV2(save),
);

export type SaveData = z.output<typeof saveDataSchema>;
