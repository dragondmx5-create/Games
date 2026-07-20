import { TILE, PLAYER, WEAPONS, WeaponId, ToolId, ArmorId, AnimalKind, ANIMALS, EnemyKind, ENEMY_DEFS } from './config';
import { World, isWalkable, NpcSpawn, AnimalSpawn } from './world';

export type FacingDir = 'down' | 'up' | 'side';

export interface Player {
  x: number; // px, center
  y: number;
  hp: number;
  maxHp: number; // starts at PLAYER.maxHp, raised by leveling (see config.ts LEVELING)
  xp: number;
  level: number;
  light: number; // 0..100
  facing: number; // radians — attack direction
  dir: FacingDir; // sprite direction
  flipX: boolean; // side sprite mirrored (facing left)
  animTime: number; // walk cycle clock
  attackTimer: number; // cooldown
  swingT: number; // 0..1 swing animation progress (1 = just started)
  swingPower: 1 | 2; // 1 = basic attack, 2 = weapon ability (bigger/brighter swing)
  swingArc: number; // actual arc of the attack/ability just thrown, for the swing visual
  swingRange: number; // actual range of the attack/ability just thrown, for the swing visual
  abilityTimer: number; // per-weapon special-move cooldown
  invulnTimer: number;
  running: boolean;
  moving: boolean;
  loot: number; // crystals — all of it drops on death
  shrooms: number; // stored shrooms (food/light)
  weapons: WeaponId[]; // owned, in pickup order; bone shiv is the starter
  weaponIdx: number;
  tools: ToolId[]; // owned gathering tools (axe, pickaxe) — unlock, no combat stats
  armor: ArmorId[]; // owned armor — damagePlayer() applies the best-reduction piece owned
  chests: number; // unopened Supply Crates (bought or crafted) — see game.ts openInventoryChest()
  wood: number; // chopped from trees
  iron: number; // mined from ore
  meat: number; // from killing livestock
  hide: number; // bonus material from killing cows
  feathers: number; // bonus material from killing chickens
}

export function currentWeapon(p: Player) {
  return WEAPONS[p.weapons[p.weaponIdx]];
}

export type { EnemyKind };

export interface Enemy {
  id?: string;
  serverOwned?: boolean;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  aggro: boolean;
  wanderAngle: number;
  wanderTimer: number;
  attackTimer: number;
  hitFlash: number;
  hpBarTimer: number; // health bar shows briefly after taking damage
  animTime: number;
  emergeTimer: number; // for worms tunneling out of walls
  telegraph: number; // ranged kinds only: counts down a wind-up before the hit lands, 0 = idle
}

export interface Npc {
  id?: string;
  serverOwned?: boolean;
  role?: 'merchant' | 'archivist' | 'scout';
  name?: string;
  behavior?: 'stationary' | 'patrol';
  kind: 'shopkeeper' | 'wanderer';
  x: number;
  y: number;
  homeX: number; // wander anchor — never strays past wanderRadius from here
  homeY: number;
  wanderRadius: number;
  wanderAngle: number;
  wanderTimer: number;
  moving: boolean;
  dir: FacingDir;
  flipX: boolean;
  animTime: number;
}

export interface Animal {
  id?: string;
  serverOwned?: boolean;
  readyAt?: string | null;
  kind: AnimalKind;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  wanderRadius: number;
  wanderAngle: number;
  wanderTimer: number;
  moving: boolean;
  dir: FacingDir;
  flipX: boolean;
  animTime: number;
  readyTimer: number; // <=0 means ready to collect
  hp: number;
  maxHp: number;
  hitFlash: number;
  dead: boolean; // killed in combat — hidden and un-interactable until respawnTimer runs out
  respawnTimer: number; // seconds remaining while dead
}

export interface Pet {
  x: number;
  y: number;
  dir: FacingDir;
  flipX: boolean;
  moving: boolean;
  animTime: number;
}

export interface LootBag {
  id: string;
  serverOwned?: boolean; // stable across cloud saves; used for idempotent server-side forfeiture
  layer: number; // dungeon layer the bag fell on; 1 for surface bags
  regionKey?: string; // set for surface bags — which overworld region holds it
  x: number;
  y: number;
  loot: number;
  shrooms: number;
  weapons: WeaponId[];
  tools: ToolId[];
  armor: ArmorId[];
  chests: number;
  wood: number;
  iron: number;
  meat: number;
  hide: number;
  feathers: number;
}


export function createLootBagId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for older embedded browsers. The timestamp + random suffix is
  // sufficient for a per-account gameplay identifier; the server still
  // deduplicates and validates ids against the persisted save.
  return `bag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface WeaponPickup {
  x: number;
  y: number;
  weapon: WeaponId;
}

export function newPlayer(world: World): Player {
  return {
    x: (world.entrance.x + 0.5) * TILE,
    y: (world.entrance.y + 0.5) * TILE,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    xp: 0,
    level: 1,
    light: 100,
    facing: 0,
    dir: 'down',
    flipX: false,
    animTime: 0,
    attackTimer: 0,
    swingT: 0,
    swingPower: 1,
    swingArc: WEAPONS.bone.arc,
    swingRange: WEAPONS.bone.range,
    abilityTimer: 0,
    invulnTimer: 0,
    running: false,
    moving: false,
    loot: 0,
    shrooms: 0,
    weapons: ['bone'],
    weaponIdx: 0,
    tools: [],
    armor: [],
    chests: 0,
    wood: 0,
    iron: 0,
    meat: 0,
    hide: 0,
    feathers: 0,
  };
}

export function newEnemy(kind: EnemyKind, x: number, y: number, layer: number): Enemy {
  const def = ENEMY_DEFS[kind];
  const depthMul = 1 + (layer - 1) * 0.25;
  return {
    kind,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed * depthMul,
    damage: def.damage,
    aggro: false,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    attackTimer: 0,
    hitFlash: 0,
    hpBarTimer: 0,
    animTime: Math.random() * 10,
    emergeTimer: def.emergesFromWall ? 0.9 : 0,
    telegraph: 0,
  };
}

export function newNpc(spawn: NpcSpawn): Npc {
  return {
    id: spawn.id,
    serverOwned: spawn.serverOwned,
    role: spawn.role,
    name: spawn.name,
    behavior: spawn.behavior,
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    homeX: spawn.x,
    homeY: spawn.y,
    wanderRadius: spawn.wanderRadius,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: Math.random() * 2,
    moving: false,
    dir: 'down',
    flipX: false,
    animTime: Math.random() * 10,
  };
}

export function newAnimal(spawn: AnimalSpawn): Animal {
  return {
    id: spawn.id,
    serverOwned: spawn.serverOwned,
    readyAt: spawn.readyAt,
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    homeX: spawn.x,
    homeY: spawn.y,
    wanderRadius: spawn.wanderRadius,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: Math.random() * 2,
    moving: false,
    dir: 'down',
    flipX: false,
    animTime: Math.random() * 10,
    readyTimer: ANIMALS[spawn.kind].readyTime * (0.3 + Math.random() * 0.7), // staggered so they don't all ping at once
    hp: ANIMALS[spawn.kind].hp,
    maxHp: ANIMALS[spawn.kind].hp,
    hitFlash: 0,
    dead: false,
    respawnTimer: 0,
  };
}

export function newPet(x: number, y: number): Pet {
  return { x, y, dir: 'down', flipX: false, moving: false, animTime: 0 };
}

/** axis-by-axis movement with wall collision */
export function moveWithCollision(world: World, e: { x: number; y: number }, dx: number, dy: number, radius: number): void {
  const canStand = (px: number, py: number): boolean => {
    for (const [ox, oy] of [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]] as const) {
      if (!isWalkable(world, Math.floor((px + ox) / TILE), Math.floor((py + oy) / TILE))) return false;
    }
    return true;
  };
  if (dx !== 0 && canStand(e.x + dx, e.y)) e.x += dx;
  if (dy !== 0 && canStand(e.x, e.y + dy)) e.y += dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

interface Wanderer {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  wanderRadius: number;
  wanderAngle: number;
  wanderTimer: number;
  moving: boolean;
  dir: FacingDir;
  flipX: boolean;
}

/** shared amble-in-place-then-turn-home logic for Npc and Animal */
export function wanderStep(world: World, w: Wanderer, dt: number, speed: number): void {
  if (w.wanderRadius <= 0) {
    w.moving = false; // e.g. the shopkeeper, parked at their stall
    return;
  }
  w.wanderTimer -= dt;
  if (w.wanderTimer <= 0) {
    w.wanderTimer = 1.5 + Math.random() * 2.5;
    w.wanderAngle = Math.random() * Math.PI * 2;
  }
  const mx = Math.cos(w.wanderAngle) * speed * dt;
  const my = Math.sin(w.wanderAngle) * speed * dt;
  if (dist(w.x + mx, w.y + my, w.homeX, w.homeY) > w.wanderRadius) {
    w.wanderAngle = Math.atan2(w.homeY - w.y, w.homeX - w.x); // turn back home
    w.wanderTimer = 1;
    w.moving = false;
    return;
  }
  const before = { x: w.x, y: w.y };
  moveWithCollision(world, w, mx, my, 4);
  w.moving = w.x !== before.x || w.y !== before.y;
  if (w.moving) {
    if (Math.abs(my) >= Math.abs(mx)) w.dir = my >= 0 ? 'down' : 'up';
    else {
      w.dir = 'side';
      w.flipX = mx < 0;
    }
  }
}
