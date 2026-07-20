// All game-balance numbers live here — rebalancing means editing this file,
// not the system code.
//
// type-only — entities.ts imports from this file, so a value import here
// would be circular; LootBag is erased at compile time either way.
import type { LootBag } from './entities';
import type { LandId } from './overworld/types';
import { OVERWORLD_WORLD_RADIUS } from '../server/src/world/worldBounds';

// TILE was briefly 24 to match a 24x24 tileset natively, then reverted to 16
// to match a richer, more complete 16x16 pack instead (see packAssets.ts) —
// every other pixel-based number below moves with it so speeds, ranges and
// radii still cover the same number of tiles either way.
export const TILE = 16;
// Internal render resolution. Mutable (not const): Renderer recomputes these
// to match the actual device's aspect ratio on load/resize/fullscreen-toggle
// (see resizeToViewport() in render.ts), so the camera fills the whole
// screen instead of being letterboxed to a fixed 640x384 shape — a phone in
// landscape is usually much wider than that ratio, and the fixed shape used
// to leave big black gutters on both sides with the HUD lost inside them.
// Every module below reads these live (ES module bindings), so nothing
// downstream needs to know the values ever change.
export let VIEW_W = 640;
export let VIEW_H = 384;
export function setViewSize(w: number, h: number): void {
  VIEW_W = w;
  VIEW_H = h;
}
// Internal supersampling: the scene renders at RENDER_SCALE× the logical
// world resolution, so high-res painterly sprites (trees, grass) can show
// real sub-world-pixel detail while tile art keeps its chunky pixel look.
export const RENDER_SCALE = 3;

// 3/4 view: walls rise this many px above their footprint. Set equal to TILE
// (not a fraction of it) so a standard tileset's wall-face art — usually
// drawn to fill one full cell — drops in with zero cropping or resizing.
export const WALL_H = TILE;

// dungeon layers keep the original big single-map size
export const MAP_W = 220;
export const MAP_H = 220;
// the surface overworld (docs/REGION_WORLD_PLAN.md) is a bounded grid of
// smaller regions: coordinates -WORLD_RADIUS..WORLD_RADIUS on both axes,
// all generated from ONE global server-issued world seed so every player
// walks the same world (docs/ONLINE_CRYPTO_ROADMAP.md, Phase 1)
export const WORLD_RADIUS = OVERWORLD_WORLD_RADIUS; // 11x11 regions spanning six authored lands
export const REGION_SIZE = 160; // tiles per side, per region
const BASELINE_MAP_TILES = 80 * 80; // enemy counts below were tuned against the original 80x80 map

export const PLAYER = {
  speed: 62, // px/s
  runSpeed: 105,
  maxHp: 10,
  hurtInvuln: 0.8,
};

export type WeaponId = 'bone' | 'chitin' | 'crystal' | 'wood_club' | 'iron_falchion' | 'hide_warclub' | 'feather_javelin' | 'prism_halberd';

// each weapon's ability resolves through one shared archetype implementation
// in game.ts's useAbility() instead of one bespoke case per weapon — adding
// a weapon means picking (or reusing) an archetype and tuning its
// multipliers here, not writing new ability-resolution code. All multiplier
// fields default to 1 (i.e. "same as the weapon's basic attack") when unset;
// knockback/dashDist/invulnSec have per-archetype defaults in useAbility().
export type AbilityArchetype = 'flurry' | 'cleave' | 'lunge' | 'pierce' | 'slam';

export interface AbilityDef {
  name: string;
  cooldown: number; // seconds
  archetype: AbilityArchetype;
  arcMul?: number; // multiplies the weapon's base arc
  rangeMul?: number; // multiplies the weapon's base range
  damageMul?: number; // multiplies the weapon's base damage
  knockback?: number; // overrides the archetype's default knockback
  dashDist?: number; // lunge only: how far the player physically moves
  invulnSec?: number; // lunge only: brief i-frames during the dash
}

export interface WeaponDef {
  name: string;
  damage: number;
  range: number;
  arc: number;
  cooldown: number;
  sprite: string; // sprite key (asset-overridable)
  color: string; // swing-trail / HUD-icon tint
  ability: AbilityDef;
}

// underground materials only for the original 3 — bone, chitin, crystal (see
// design doc §14.7); the other 5 are craft-only (see CRAFTING_RECIPES) and
// give every gatherable material a weapon-tier reason to exist. ranges
// bumped ~40% over the original values (enemy melee reach is 12px) so the
// player can land a hit before something closes to biting distance.
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  bone: {
    name: 'Bone Shiv',
    damage: 1,
    range: 28,
    arc: Math.PI * 0.8,
    cooldown: 0.32,
    sprite: 'weapon.bone',
    color: '#d8cfae',
    ability: { name: 'Flurry', cooldown: 5, archetype: 'flurry', arcMul: 1.25, damageMul: 3, knockback: 10 },
  },
  chitin: {
    name: 'Chitin Blade',
    damage: 2,
    range: 33,
    arc: Math.PI * 0.9,
    cooldown: 0.44,
    sprite: 'weapon.chitin',
    color: '#8fae5a',
    ability: { name: 'Wide Cleave', cooldown: 7, archetype: 'cleave', knockback: 8 },
  },
  crystal: {
    name: 'Crystal Edge',
    damage: 3,
    range: 39,
    arc: Math.PI,
    cooldown: 0.58,
    sprite: 'weapon.crystal',
    color: '#7ad4e8',
    ability: { name: 'Lunge', cooldown: 9, archetype: 'lunge', rangeMul: 1.3, arcMul: 0.6, damageMul: 2, knockback: 14, dashDist: 46, invulnSec: 0.3 },
  },
  wood_club: {
    name: 'Wood Club',
    damage: 1,
    range: 27,
    arc: Math.PI * 0.75,
    cooldown: 0.36,
    sprite: 'weapon.wood_club',
    color: '#a97c50',
    ability: { name: 'Roundhouse', cooldown: 6, archetype: 'cleave', knockback: 9 },
  },
  iron_falchion: {
    name: 'Iron Falchion',
    damage: 2,
    range: 31,
    arc: Math.PI * 0.85,
    cooldown: 0.4,
    sprite: 'weapon.iron_falchion',
    color: '#c9ccd6',
    ability: { name: 'Whirl', cooldown: 5.5, archetype: 'flurry', arcMul: 1.3, damageMul: 2.6, knockback: 10 },
  },
  hide_warclub: {
    name: 'Hide Warclub',
    damage: 3,
    range: 26,
    arc: Math.PI * 0.7,
    cooldown: 0.62,
    sprite: 'weapon.hide_warclub',
    color: '#8a5a3c',
    ability: { name: 'Ground Slam', cooldown: 7.5, archetype: 'slam', damageMul: 3, rangeMul: 0.85, knockback: 26 },
  },
  feather_javelin: {
    name: 'Feathered Javelin',
    damage: 2,
    range: 36,
    arc: Math.PI * 0.6,
    cooldown: 0.5,
    sprite: 'weapon.feather_javelin',
    color: '#e8dfa0',
    ability: { name: 'Skewer', cooldown: 6.5, archetype: 'pierce', rangeMul: 1.5, arcMul: 0.4, damageMul: 2.8, knockback: 7 },
  },
  prism_halberd: {
    name: 'Prism Halberd',
    damage: 4,
    range: 42,
    arc: Math.PI * 0.85,
    cooldown: 0.66,
    sprite: 'weapon.prism_halberd',
    color: '#b98af0',
    ability: { name: 'Prism Lunge', cooldown: 8.5, archetype: 'lunge', rangeMul: 1.35, arcMul: 0.55, damageMul: 2.2, knockback: 16, dashDist: 50, invulnSec: 0.35 },
  },
};

export const LIGHT = {
  max: 100,
  drainPerSec: 0.55, // light behaves like HP
  radiusMax: 105,
  radiusMin: 18,
  glowshroomRefill: 22,
  shroomLightRadius: 34,
};

export const NOISE = {
  walkRadius: 55, // enemies hear you within this radius
  runRadius: 130,
  attackRadius: 150,
};

export const AMBUSH = {
  // deeper = faster ambushes
  baseInterval: 26, // seconds, layer 1
  perLayerFactor: 0.72,
  lingerSeconds: 8, // staying put brings them sooner
};

export const LAYER_NAMES = ['Ashveil', 'Irondeep', 'The Rot', 'Emberscar', 'The Hollow'];

// Farm plots (see world.ts carveFarmPlots / game.ts farming). A plot goes
// empty(0) -> sprout(1) -> budding(2) -> ripe(3), one growStageTime (per its
// assigned crop) per step, then sits ripe until harvested. seedCost/
// plotsPerLayer stay shared across crops — shrooms are the universal "seed"
// resource, so there's no need for a separate sink per crop.
export const FARMING = {
  seedCost: 1, // shrooms consumed to plant an empty plot
  plotsPerLayer: 5,
};

export type CropId = 'glowshroom' | 'caveberry';

export interface CropDef {
  growStageTime: number; // seconds per growth stage
  harvestYieldMin: number;
  harvestYieldMax: number; // inclusive
  grants: 'shrooms' | 'crystals'; // what harvesting actually pays out
  minLayer: number; // lowest layer this crop can be assigned to a plot on
}

// caveberry grants crystals rather than more shrooms — gives farming a
// second, distinct purpose (money vs. light) instead of two crops producing
// the same resource.
export const CROPS: Record<CropId, CropDef> = {
  glowshroom: { growStageTime: 25, harvestYieldMin: 3, harvestYieldMax: 3, grants: 'shrooms', minLayer: 1 },
  caveberry: { growStageTime: 30, harvestYieldMin: 1, harvestYieldMax: 2, grants: 'crystals', minLayer: 2 },
};

/** `tiles` defaults to the dungeon map size; surface regions pass their own
 * (smaller) tile count so enemy density stays constant per area */
export function enemyCountFor(layer: number, tiles: number = MAP_W * MAP_H): number {
  const base = 10 + layer * 6;
  return Math.round(base * (tiles / BASELINE_MAP_TILES));
}

export type EnemyKind = 'bug' | 'shellbug' | 'wallworm' | 'spitter';

export interface EnemyDef {
  hp: number;
  speed: number; // px/s at layer 1; newEnemy() still applies the per-layer depthMul on top
  damage: number;
  emergesFromWall: boolean; // ambush-spawned (tunnels out near the player) vs a roaming pre-placed spawn
  minLayer: number; // lowest layer this kind is eligible to appear on
  weight: number; // relative pick weight among kinds eligible for the current layer/spawn-mechanism
  ranged?: boolean; // holds preferredRange and telegraphs instead of always closing to melee
  preferredRange?: number; // px — only used when ranged
  telegraphTime?: number; // seconds of wind-up before a ranged hit lands
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  bug: { hp: 2, speed: 38, damage: 1, emergesFromWall: false, minLayer: 1, weight: 3 },
  shellbug: { hp: 5, speed: 22, damage: 1, emergesFromWall: false, minLayer: 2, weight: 1 },
  wallworm: { hp: 3, speed: 48, damage: 1, emergesFromWall: true, minLayer: 1, weight: 3 },
  spitter: {
    hp: 2, speed: 30, damage: 1, emergesFromWall: true, minLayer: 3, weight: 1,
    ranged: true, preferredRange: 70, telegraphTime: 0.9,
  },
};

/** weighted-random enemy kind for a given layer + spawn mechanism (roaming vs. wall-ambush) */
export function pickEnemyKind(layer: number, emergesFromWall: boolean, rand: () => number = Math.random): EnemyKind {
  const candidates = (Object.entries(ENEMY_DEFS) as [EnemyKind, EnemyDef][]).filter(
    ([, def]) => def.emergesFromWall === emergesFromWall && layer >= def.minLayer,
  );
  const total = candidates.reduce((s, [, def]) => s + def.weight, 0);
  let r = rand() * total;
  for (const [kind, def] of candidates) {
    r -= def.weight;
    if (r <= 0) return kind;
  }
  return candidates[candidates.length - 1][0];
}

// shared shape for any "roll a bundle of stuff" table — enemy kills, and
// chests (see CHEST_LOOT below). Each entry rolls independently (not a
// single weighted pick), matching the original single hardcoded wallworm
// roll's semantics, just generalized to a list.
export type MaterialKind = 'crystal' | 'shroom' | 'wood' | 'iron' | 'meat' | 'hide' | 'feathers';
export const MATERIAL_KINDS: MaterialKind[] = ['crystal', 'shroom', 'wood', 'iron', 'meat', 'hide', 'feathers'];

export interface DropEntry {
  kind: MaterialKind | WeaponId;
  chance: number; // 0..1
  amount: [number, number]; // inclusive min/max — ignored for weapon drops (always 1 pickup)
}

export const DROP_TABLES: Record<EnemyKind, DropEntry[]> = {
  bug: [{ kind: 'crystal', chance: 0.08, amount: [1, 1] }],
  shellbug: [
    { kind: 'crystal', chance: 0.2, amount: [1, 2] },
    { kind: 'shroom', chance: 0.15, amount: [1, 2] },
    { kind: 'meat', chance: 0.12, amount: [1, 2] },
  ],
  wallworm: [
    { kind: 'chitin', chance: 0.06, amount: [1, 1] }, // the original drop, unchanged
    { kind: 'shroom', chance: 0.15, amount: [1, 1] },
    { kind: 'iron', chance: 0.1, amount: [1, 1] },
  ],
  spitter: [
    { kind: 'crystal', chance: 0.18, amount: [1, 2] },
    { kind: 'wood', chance: 0.1, amount: [1, 2] },
  ],
};

// opened via E at a chest (see world.ts Chest / carveRuins) — a bigger,
// more varied bundle than any single kill, but one-time per chest
export const CHEST_LOOT: DropEntry[] = [
  { kind: 'crystal', chance: 0.65, amount: [2, 5] },
  { kind: 'shroom', chance: 0.4, amount: [2, 4] },
  { kind: 'wood', chance: 0.35, amount: [2, 5] },
  { kind: 'iron', chance: 0.3, amount: [1, 3] },
  { kind: 'meat', chance: 0.25, amount: [2, 4] },
  { kind: 'hide', chance: 0.15, amount: [1, 2] },
  { kind: 'feathers', chance: 0.15, amount: [1, 2] },
  { kind: 'chitin', chance: 0.1, amount: [1, 1] },
];

export type ArmorId = 'leather' | 'iron' | 'hideVest';

export interface ArmorDef {
  name: string;
  reduction: number; // 0..1 — fraction of incoming damage absorbed (see game.ts damagePlayer)
}

export const ARMOR: Record<ArmorId, ArmorDef> = {
  leather: { name: 'Leather Armor', reduction: 0.2 },
  iron: { name: 'Iron Armor', reduction: 0.4 },
  hideVest: { name: 'Hide Vest', reduction: 0.25 }, // craft-only, see CRAFTING_RECIPES
};

// Legacy town geometry retained for generated settlement layouts (see
// world.ts carveTown) — a safe zone: no enemy spawns, no ambushes inside it.
export const TOWN = {
  minW: 20,
  minH: 16,
  maxW: 26,
  maxH: 20,
  wanderers: 3, // ambient NPCs with nothing to sell, just foot traffic
  maxDistFromEntrance: 75, // tiles — keeps it findable on the (now bigger, MAP_W x MAP_H) map instead of a needle in a haystack
};

// a big, distinct, rubble-strewn road connecting the entrance to the exit —
// see world.ts carveRoad
export const ROAD = {
  width: 3, // tiles, corridor cleared to floor on each side of the centerline
  rubbleEvery: 4, // tiles along the path between rubble decorations, roughly
};

export type ShopItemId =
  | 'buy_chitin' | 'buy_crystal' | 'buy_shrooms' | 'buy_pet' | 'buy_axe' | 'buy_pickaxe'
  | 'buy_leather_armor' | 'buy_iron_armor' | 'buy_chest';

export interface ShopItem {
  id: ShopItemId;
  label: string;
  cost: number; // crystals
  kind: 'weapon' | 'shrooms' | 'pet' | 'tool' | 'armor' | 'chest';
  weapon?: WeaponId;
  shroomAmount?: number;
  tool?: ToolId;
  armor?: ArmorId;
}

// a fellow survivor who trades salvaged gear for crystals
export const SHOP_ITEMS: ShopItem[] = [
  { id: 'buy_chitin', label: 'Chitin Blade', cost: 10, kind: 'weapon', weapon: 'chitin' },
  { id: 'buy_crystal', label: 'Crystal Edge', cost: 22, kind: 'weapon', weapon: 'crystal' },
  { id: 'buy_shrooms', label: '5 Shrooms', cost: 4, kind: 'shrooms', shroomAmount: 5 },
  { id: 'buy_pet', label: 'Cave Pup (companion)', cost: 15, kind: 'pet' },
  { id: 'buy_axe', label: 'Axe (chop trees)', cost: 6, kind: 'tool', tool: 'axe' },
  { id: 'buy_pickaxe', label: 'Pickaxe (mine iron)', cost: 8, kind: 'tool', tool: 'pickaxe' },
  { id: 'buy_leather_armor', label: 'Leather Armor', cost: 12, kind: 'armor', armor: 'leather' },
  { id: 'buy_iron_armor', label: 'Iron Armor', cost: 26, kind: 'armor', armor: 'iron' },
  { id: 'buy_chest', label: 'Supply Crate', cost: 18, kind: 'chest' },
];

// ------------------------------------------------------------- crafting
// turns gathered materials into gear — see game.ts craftItem()/renderCraftList()
// and the CRAFT tab on #shop-panel. Every material kind except crystal/meat
// gets its first real consumption sink here (previously only the 1-shroom
// farm-plot seed cost and lootBagValue()'s vault-loss valuation touched them).
export type CraftOutputKind = 'weapon' | 'armor' | 'chest';

export interface CraftingRecipe {
  id: string;
  label: string;
  outputKind: CraftOutputKind;
  weapon?: WeaponId; // set when outputKind === 'weapon'
  armor?: ArmorId; // set when outputKind === 'armor'
  materials: Partial<Record<MaterialKind, number>>;
  crystalCost?: number; // optional, on top of materials
  minLevel?: number; // gates late recipes behind LEVELING
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  { id: 'craft_wood_club', label: 'Wood Club', outputKind: 'weapon', weapon: 'wood_club', materials: { wood: 6 } },
  { id: 'craft_iron_falchion', label: 'Iron Falchion', outputKind: 'weapon', weapon: 'iron_falchion', materials: { iron: 5, wood: 2 } },
  { id: 'craft_hide_warclub', label: 'Hide Warclub', outputKind: 'weapon', weapon: 'hide_warclub', materials: { hide: 4, wood: 4 } },
  { id: 'craft_feather_javelin', label: 'Feathered Javelin', outputKind: 'weapon', weapon: 'feather_javelin', materials: { feathers: 4, wood: 3 } },
  { id: 'craft_prism_halberd', label: 'Prism Halberd', outputKind: 'weapon', weapon: 'prism_halberd', materials: { crystal: 8, iron: 4 }, minLevel: 5 },
  { id: 'craft_hide_vest', label: 'Hide Vest', outputKind: 'armor', armor: 'hideVest', materials: { hide: 5 } },
  { id: 'craft_supply_crate', label: 'Supply Crate', outputKind: 'chest', materials: { wood: 4, iron: 2 } },
];

// gathering tools — owning one unlocks the matching E-interact (see game.ts
// tendFarmPlot-style handlers for trees/iron ore). Not weapons: no combat
// stats, just a boolean unlock, bought once and kept forever.
export type ToolId = 'axe' | 'pickaxe';

// livestock in the town pen — wander, then have something to collect on a
// timer (see game.ts updateAnimals/collectAnimal); a renewable, safer income
// than dungeon-diving for it. Can also be killed in combat for meat (+ a
// kind-specific material) — same renewable philosophy, just a slower,
// bigger payout via a respawn timer instead of the passive collect timer.
export type AnimalKind =
  | 'cow'
  | 'chicken'
  | 'black_goat'
  | 'moth_deer'
  | 'red_deer'
  | 'wild_boar'
  | 'tapir'
  | 'capybara'
  | 'reindeer'
  | 'musk_ox'
  | 'camel'
  | 'gazelle'
  | 'shore_goat'
  | 'reef_turtle';

export interface AnimalDef {
  name: string;
  spriteFamily: 'cow' | 'chicken'; // temporary visual family until final biome assets arrive
  readyTime: number; // seconds between harvests
  yieldKind: 'shrooms' | 'loot';
  yieldAmount: number;
  hp: number; // combat hp — animals can be killed, not just collected from
  material: 'hide' | 'feathers'; // kind-specific bonus material on a kill
  meatAmount: [number, number]; // inclusive min/max
  respawnTime: number; // seconds before a killed animal reappears at its home spot
}

const herd = (
  name: string,
  readyTime: number,
  yieldAmount: number,
  hp: number,
  meatAmount: [number, number],
  respawnTime: number,
): AnimalDef => ({ name, spriteFamily: 'cow', readyTime, yieldKind: 'loot', yieldAmount, hp, material: 'hide', meatAmount, respawnTime });

const bird = (
  name: string,
  readyTime: number,
  yieldAmount: number,
  hp: number,
  meatAmount: [number, number],
  respawnTime: number,
): AnimalDef => ({ name, spriteFamily: 'chicken', readyTime, yieldKind: 'shrooms', yieldAmount, hp, material: 'feathers', meatAmount, respawnTime });

export const ANIMALS: Record<AnimalKind, AnimalDef> = {
  cow: herd('Cow', 55, 2, 4, [3, 5], 150),
  chicken: bird('Chicken', 35, 2, 2, [1, 2], 90),
  black_goat: herd('Black Goat', 48, 2, 3, [2, 4], 120),
  moth_deer: herd('Moth Deer', 70, 3, 4, [2, 4], 180),
  red_deer: herd('Red Deer', 65, 3, 4, [2, 4], 170),
  wild_boar: herd('Wild Boar', 60, 2, 5, [3, 5], 165),
  tapir: herd('Tapir', 58, 2, 5, [3, 5], 165),
  capybara: herd('Capybara', 45, 2, 3, [2, 3], 120),
  reindeer: herd('Reindeer', 68, 3, 5, [3, 5], 180),
  musk_ox: herd('Musk Ox', 80, 4, 7, [4, 6], 220),
  camel: herd('Camel', 75, 3, 6, [4, 6], 210),
  gazelle: herd('Gazelle', 50, 2, 3, [2, 3], 130),
  shore_goat: herd('Shore Goat', 50, 2, 4, [2, 4], 140),
  reef_turtle: herd('Reef Turtle', 85, 3, 8, [2, 4], 240),
};

export const TOWN_ANIMALS: { kind: AnimalKind; count: number }[] = [
  { kind: 'cow', count: 2 },
  { kind: 'chicken', count: 3 },
];

export const LAND_TOWN_ANIMALS: Record<LandId, readonly { kind: AnimalKind; count: number }[]> = {
  witchlands: [
    { kind: 'black_goat', count: 2 },
    { kind: 'moth_deer', count: 1 },
    { kind: 'chicken', count: 2 },
  ],
  'green-land': [
    { kind: 'cow', count: 2 },
    { kind: 'chicken', count: 3 },
    { kind: 'red_deer', count: 1 },
  ],
  rainforest: [
    { kind: 'tapir', count: 2 },
    { kind: 'capybara', count: 2 },
    { kind: 'chicken', count: 2 },
  ],
  frostlands: [
    { kind: 'reindeer', count: 2 },
    { kind: 'musk_ox', count: 1 },
    { kind: 'chicken', count: 2 },
  ],
  'sunscorched-desert': [
    { kind: 'camel', count: 2 },
    { kind: 'gazelle', count: 2 },
    { kind: 'chicken', count: 1 },
  ],
  'cinder-coast': [
    { kind: 'shore_goat', count: 2 },
    { kind: 'reef_turtle', count: 2 },
    { kind: 'chicken', count: 2 },
  ],
};

// woodcutting — trees (see world.ts scatterProps) are a one-time resource,
// same philosophy as crystal/glowshroom tiles: chop it and it's gone for
// that map, no respawn within a run.
export const WOODCUTTING = {
  yieldMin: 2,
  yieldMax: 4,
  interactRadius: 26, // px — how close you need to be to a tree prop to chop it
};

// iron ore mining — a mineable tile like Tile.Crystal, requires a pickaxe
export const MINING = {
  yieldMin: 1,
  yieldMax: 2,
};

// player leveling — xp is earned from most reward moments (kills, chests,
// harvests, gathering); a level-up fully heals and raises maxHp so it reads
// as a real reward, not just a bar filling up. Deliberately one flat xp
// amount per reward category rather than per-enemy-kind tuning, to keep
// the system easy to reason about.
export const LEVELING = {
  baseXp: 20, // xp needed to clear level 1
  xpPerLevel: 12, // extra xp needed per level beyond that
  hpPerLevel: 2, // player.maxHp gain on level-up
  xpKill: 3,
  xpChest: 4,
  xpHarvest: 2,
  xpGather: 1, // glowshroom/crystal/ironOre tile pickups, wood chopping
  xpAnimal: 2, // collecting from or killing livestock
};

export function xpForLevel(level: number): number {
  return LEVELING.baseXp + (level - 1) * LEVELING.xpPerLevel;
}

// session-scoped objectives — 3 are picked at random (no repeats) when a
// run starts, tracked live, and rewarded once. Not part of cloud save: like
// the rest of a run's transient state, they reset on a fresh game.
export type QuestTrack = 'kills' | 'wood' | 'iron' | 'harvest' | 'chests' | 'layer';

export interface QuestDef {
  id: string;
  label: (n: number) => string;
  track: QuestTrack;
  target: number;
  rewardCrystals: number;
  rewardXp: number;
}

export const QUEST_POOL: QuestDef[] = [
  { id: 'kill5', label: (n) => `Kill ${n} creatures`, track: 'kills', target: 5, rewardCrystals: 6, rewardXp: 8 },
  { id: 'wood10', label: (n) => `Chop ${n} wood`, track: 'wood', target: 10, rewardCrystals: 4, rewardXp: 6 },
  { id: 'iron6', label: (n) => `Mine ${n} iron`, track: 'iron', target: 6, rewardCrystals: 5, rewardXp: 6 },
  { id: 'harvest3', label: (n) => `Harvest ${n} crops`, track: 'harvest', target: 3, rewardCrystals: 4, rewardXp: 5 },
  { id: 'chests2', label: (n) => `Open ${n} chests`, track: 'chests', target: 2, rewardCrystals: 8, rewardXp: 10 },
  { id: 'layer3', label: () => 'Reach Layer 3', track: 'layer', target: 3, rewardCrystals: 10, rewardXp: 12 },
];

// Legacy valuation constants retained for save/test compatibility only.
// Client-authored death bags no longer contribute to shared Vaults; active
// Dungeon Vault claims require server-authored proof receipts.
export const VAULT_SPLIT = { toLayer1: 0.8, toLayer5: 0.2 };

// flat crystal-equivalent value for raw materials that have no shop price
// of their own (weapons/tools/armor use their real SHOP_ITEMS cost below) —
// roughly ordered by how scarce/late-game each material is
const MATERIAL_VALUE: Record<MaterialKind, number> = { crystal: 1, shroom: 1, wood: 1, iron: 2, meat: 2, hide: 3, feathers: 3 };

/** crystal-equivalent worth of a craft-only item: what its recipe's
 * materials (plus any crystal surcharge) would have been worth — keeps the
 * historical crystal-equivalent valuation for gear without a shop price */
function craftedValue(find: (r: CraftingRecipe) => boolean): number {
  const recipe = CRAFTING_RECIPES.find(find);
  if (!recipe) return 0;
  let total = recipe.crystalCost ?? 0;
  for (const [mat, amount] of Object.entries(recipe.materials)) {
    total += MATERIAL_VALUE[mat as MaterialKind] * (amount ?? 0);
  }
  return total;
}

/** Historical crystal-equivalent LootBag valuation. Not accepted by the
 * authoritative Vault service and retained only for compatibility/tests. */
export function lootBagValue(bag: LootBag): number {
  let total = bag.loot + bag.shrooms;
  total += bag.wood * MATERIAL_VALUE.wood;
  total += bag.iron * MATERIAL_VALUE.iron;
  total += bag.meat * MATERIAL_VALUE.meat;
  total += bag.hide * MATERIAL_VALUE.hide;
  total += bag.feathers * MATERIAL_VALUE.feathers;
  for (const w of bag.weapons) total += SHOP_ITEMS.find((i) => i.weapon === w)?.cost ?? craftedValue((r) => r.weapon === w);
  for (const t of bag.tools) total += SHOP_ITEMS.find((i) => i.tool === t)?.cost ?? 0;
  for (const a of bag.armor) total += SHOP_ITEMS.find((i) => i.armor === a)?.cost ?? craftedValue((r) => r.armor === a);
  total += bag.chests * (SHOP_ITEMS.find((i) => i.kind === 'chest')?.cost ?? 0);
  return total;
}

