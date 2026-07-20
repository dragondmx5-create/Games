import { COMBAT_ENEMIES, type CombatEnemyKind } from '../combat/catalog.js';
import { reduceIncomingDamage } from '../combat/domain.js';
import type { InventoryStacks } from '../inventory/types.js';
import {
  DUNGEON_TILE_SIZE,
  DUNGEON_PLAYER_RADIUS,
  deterministicShuffle,
  dungeonSpawnCandidates,
  moveInDungeon,
  tileCenter,
  type DungeonChestState,
  type DungeonEnemyAffix,
  type DungeonEnemyState,
  type DungeonTopology,
} from './topology.js';

const ENEMY_KINDS: readonly CombatEnemyKind[] = ['bug', 'shellbug', 'wallworm', 'spitter'];
const THEME_ENEMIES: Readonly<Record<DungeonTopology['theme'], readonly CombatEnemyKind[]>> = {
  crypt: ['wallworm', 'shellbug', 'bug'],
  flooded: ['spitter', 'bug', 'shellbug'],
  crystal: ['spitter', 'shellbug', 'wallworm'],
  foundry: ['shellbug', 'spitter', 'bug'],
  frost: ['wallworm', 'spitter', 'shellbug'],
  thorn: ['bug', 'wallworm', 'spitter'],
};
const AFFIXES: readonly DungeonEnemyAffix[] = ['swift', 'armored', 'venomous'];

export interface DungeonTickResult {
  enemies: DungeonEnemyState[];
  playerHp: number;
  damageTaken: number;
}

export function spawnDungeonEntities(
  topology: DungeonTopology,
  difficulty: number,
  finalFloor: boolean,
  forbiddenKeyConsumed: boolean,
): { enemies: DungeonEnemyState[]; chests: DungeonChestState[] } {
  const candidates = deterministicShuffle(dungeonSpawnCandidates(topology), topology.floorSeed ^ 0x4f1bbcdc);
  const enemyCount = Math.min(candidates.length, 6 + topology.floor * 2);
  const enemies: DungeonEnemyState[] = [];

  for (let index = 0; index < enemyCount; index += 1) {
    const point = tileCenter(candidates[index]);
    const pool = THEME_ENEMIES[topology.theme] ?? ENEMY_KINDS;
    const kind = pool[Math.abs(topology.floorSeed + index * 17) % pool.length];
    const definition = COMBAT_ENEMIES[kind];
    const elite = topology.floor >= 3 && Math.abs(topology.floorSeed + index * 31) % 5 === 0;
    const affix: DungeonEnemyAffix = elite ? AFFIXES[Math.abs(topology.floorSeed + index * 11) % AFFIXES.length] : 'none';
    const scale = (1 + Math.max(0, difficulty - 1) * 0.16) * (elite ? 1.6 : 1);
    enemies.push({
      id: `dungeon:${topology.checksum}:enemy:${index}`,
      kind,
      boss: false,
      elite,
      affix,
      x: point.x,
      y: point.y,
      hp: Math.max(1, Math.round(definition.hp * scale)),
      maxHp: Math.max(1, Math.round(definition.hp * scale)),
      damage: Math.max(1, Math.round(definition.damage * (1 + Math.max(0, difficulty - 1) * 0.08) * (affix === 'venomous' ? 1.35 : 1))),
      speed: definition.speed * Math.min(1.65, 1 + Math.max(0, topology.floor - 1) * 0.06) * (affix === 'swift' ? 1.35 : 1),
      attackReadyAt: 0,
      alive: true,
    });
  }

  if (finalFloor && candidates.length > enemyCount) {
    const point = tileCenter(candidates[enemyCount]);
    const hp = 14 + difficulty * 4;
    const bossKinds: Readonly<Record<DungeonTopology['theme'], CombatEnemyKind>> = {
      crypt: 'wallworm', flooded: 'spitter', crystal: 'shellbug', foundry: 'shellbug', frost: 'wallworm', thorn: 'spitter',
    };
    enemies.push({
      id: `dungeon:${topology.checksum}:boss`,
      kind: bossKinds[topology.theme],
      boss: true,
      elite: true,
      affix: AFFIXES[Math.abs(topology.floorSeed) % AFFIXES.length],
      x: point.x,
      y: point.y,
      hp,
      maxHp: hp,
      damage: Math.max(2, 1 + Math.floor(difficulty / 2)),
      speed: 26 + Math.min(18, difficulty * 2),
      attackReadyAt: 0,
      alive: true,
    });
  }

  const chestCandidates = candidates.slice(enemyCount + (finalFloor ? 1 : 0));
  const chests: DungeonChestState[] = chestCandidates.slice(0, 2).map((point, index) => {
    const center = tileCenter(point);
    return { id: `dungeon:${topology.checksum}:chest:${index}`, kind: 'standard', x: center.x, y: center.y, opened: false };
  });
  if (forbiddenKeyConsumed && finalFloor && chestCandidates[2]) {
    const center = tileCenter(chestCandidates[2]);
    chests.push({ id: `dungeon:${topology.checksum}:forbidden`, kind: 'forbidden', x: center.x, y: center.y, opened: false });
  }
  return { enemies, chests };
}

export function tickDungeonEnemies(
  topology: DungeonTopology,
  enemies: readonly DungeonEnemyState[],
  player: { x: number; y: number; hp: number },
  elapsedMs: number,
  armorReduction: number,
  nowMs: number,
): DungeonTickResult {
  const dt = Math.max(0, Math.min(250, elapsedMs)) / 1000;
  let playerHp = player.hp;
  let damageTaken = 0;
  const next = enemies.map((enemy) => ({ ...enemy }));

  for (const enemy of next) {
    if (!enemy.alive || playerHp <= 0) continue;
    const definition = COMBAT_ENEMIES[enemy.kind];
    let distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    const aggroRange = enemy.boss ? Math.max(definition.aggroRange, 260) : definition.aggroRange;
    if (distance <= aggroRange && distance > definition.attackRange * (enemy.boss ? 1.35 : 1)) {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const maxStep = enemy.speed * dt;
      const moved = moveInDungeon(topology, enemy, Math.cos(angle) * maxStep, Math.sin(angle) * maxStep, 4);
      enemy.x = moved.x;
      enemy.y = moved.y;
      distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    }

    const attackRange = definition.attackRange * (enemy.boss ? 1.35 : 1);
    if (distance <= attackRange && enemy.attackReadyAt <= nowMs) {
      const damage = reduceIncomingDamage(enemy.damage, armorReduction);
      playerHp = Math.max(0, playerHp - damage);
      damageTaken += damage;
      enemy.attackReadyAt = nowMs + Math.round(definition.attackCooldownMs * (enemy.affix === 'swift' ? 0.72 : 1));
    }
  }

  return { enemies: next, playerHp, damageTaken };
}

export function dungeonMovementMultiplier(topology: DungeonTopology, x: number, y: number): number {
  let multiplier = 1;
  for (const hazard of topology.hazards) {
    if (Math.hypot(x - hazard.x, y - hazard.y) <= hazard.radius) multiplier = Math.min(multiplier, hazard.slowMultiplier);
  }
  return multiplier;
}

/** Integrates server-owned floor slow effects along the whole swept path.
 * Checking only the starting or ending point would let a large movement intent
 * skip across a narrow water/frost field at full speed. */
export function moveDungeonWithMechanics(
  topology: DungeonTopology,
  position: { x: number; y: number },
  dx: number,
  dy: number,
  radius = DUNGEON_PLAYER_RADIUS,
): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) return { ...position };
  const directionX = dx / distance;
  const directionY = dy / distance;
  const steps = Math.max(1, Math.ceil(distance / Math.max(2, radius * 0.75)));
  const baseStep = distance / steps;
  let current = { ...position };
  for (let step = 0; step < steps; step += 1) {
    const multiplier = dungeonMovementMultiplier(topology, current.x, current.y);
    current = moveInDungeon(
      topology,
      current,
      directionX * baseStep * multiplier,
      directionY * baseStep * multiplier,
      radius,
    );
  }
  return current;
}

export interface DungeonHazardTickResult {
  playerHp: number;
  damageTaken: number;
  readyAt: number | null;
  hazardId: string | null;
}

export function tickDungeonHazards(
  topology: DungeonTopology,
  player: { x: number; y: number; hp: number },
  armorReduction: number,
  activeHazardId: string | null,
  readyAtMs: number | null,
  nowMs: number,
): DungeonHazardTickResult {
  const touching = topology.hazards
    .filter((hazard) => hazard.damage > 0 && Math.hypot(player.x - hazard.x, player.y - hazard.y) <= hazard.radius)
    .sort((a, b) => b.damage - a.damage)[0];
  // Leaving a damaging hazard clears its cadence. This is important for both
  // correctness and security: an old cooldown may never be carried into an
  // unrelated hazard, while a player who remains parked in danger can be
  // charged for every elapsed server-owned tick on the next command.
  if (!touching) {
    return { playerHp: player.hp, damageTaken: 0, readyAt: null, hazardId: null };
  }
  const effectiveReadyAt = activeHazardId === touching.id ? readyAtMs : null;
  if (effectiveReadyAt != null && effectiveReadyAt > nowMs) {
    return { playerHp: player.hp, damageTaken: 0, readyAt: effectiveReadyAt, hazardId: touching.id };
  }

  const damagePerTick = reduceIncomingDamage(touching.damage, armorReduction);
  if (damagePerTick <= 0) {
    return { playerHp: player.hp, damageTaken: 0, readyAt: nowMs + touching.cooldownMs, hazardId: touching.id };
  }

  const elapsedTicks = effectiveReadyAt == null
    ? 1
    : 1 + Math.floor(Math.max(0, nowMs - effectiveReadyAt) / touching.cooldownMs);
  // We only need enough ticks to reach zero HP; bounding by current HP avoids
  // unbounded work after a long disconnect without forgiving elapsed danger.
  const lethalTickCount = Math.ceil(player.hp / damagePerTick);
  const tickCount = Math.max(1, Math.min(elapsedTicks, lethalTickCount));
  const damage = Math.min(player.hp, damagePerTick * tickCount);
  const nextReadyAt = effectiveReadyAt == null
    ? nowMs + touching.cooldownMs
    : effectiveReadyAt + tickCount * touching.cooldownMs;
  return {
    playerHp: Math.max(0, player.hp - damage),
    damageTaken: damage,
    readyAt: nextReadyAt,
    hazardId: touching.id,
  };
}

function seededUnit(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 4294967296;
}

export function dungeonEnemyReward(enemy: DungeonEnemyState, floor: number): { deltas: InventoryStacks; xp: number } {
  const deltas: InventoryStacks = {};
  const roll = seededUnit(enemy.id);
  if (enemy.boss) {
    deltas['currency.crystal'] = 6 + floor * 3;
    deltas['container.supply_crate'] = 1;
  } else if (roll < 0.72) {
    deltas['currency.crystal'] = 1 + (roll < 0.18 ? 1 : 0);
    if (roll > 0.52 && roll < 0.62) deltas['consumable.shroom'] = 1;
  }
  if (enemy.elite && !enemy.boss) deltas['currency.crystal'] = (deltas['currency.crystal'] ?? 0) + 2;
  return { deltas, xp: COMBAT_ENEMIES[enemy.kind].xp + (enemy.boss ? floor * 5 : 0) + (enemy.elite ? 3 : 0) };
}

export function dungeonChestReward(chest: DungeonChestState, floor: number): InventoryStacks {
  if (chest.kind === 'forbidden') {
    return { 'currency.crystal': 18 + floor * 3, 'container.supply_crate': 1 };
  }
  const roll = seededUnit(chest.id);
  return {
    'currency.crystal': 2 + floor + Math.floor(roll * 3),
    ...(roll > 0.65 ? { 'consumable.shroom': 1 + Math.floor(roll * 2) } : {}),
  };
}

export function dungeonContractReward(floor: number): InventoryStacks {
  return { 'currency.crystal': 10 + floor * 2, 'container.supply_crate': 1 };
}

export function entrancePixel(topology: DungeonTopology): { x: number; y: number } {
  return { x: (topology.entrance.x + 0.5) * DUNGEON_TILE_SIZE, y: (topology.entrance.y + 0.5) * DUNGEON_TILE_SIZE };
}

export function exitPixel(topology: DungeonTopology): { x: number; y: number } {
  return { x: (topology.exit.x + 0.5) * DUNGEON_TILE_SIZE, y: (topology.exit.y + 0.5) * DUNGEON_TILE_SIZE };
}
