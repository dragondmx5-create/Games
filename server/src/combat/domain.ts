import { ITEM_CATALOG, type ItemId } from '../economy/catalog.js';
import type { InventorySnapshot, InventoryStacks } from '../inventory/types.js';
import {
  ARMOR_REDUCTION,
  COMBAT_DROP_TABLES,
  COMBAT_WEAPONS,
  maxHpForLevel,
  xpRequiredForLevel,
  type CombatEnemyKind,
  type CombatRiskTier,
} from './catalog.js';

export interface AttackProfile {
  damage: number;
  range: number;
  arc: number;
  cooldownMs: number;
}

export interface ProgressionResult {
  level: number;
  xp: number;
  maxHp: number;
  leveledUp: boolean;
}

export interface DeathLossPlan {
  dropped: InventoryStacks;
  retained: InventoryStacks;
  progressionLevel: number;
  equippedWeapon: ItemId;
}

const UNIQUE_DROP_PRIORITY: readonly ItemId[] = [
  'weapon.prism_halberd',
  'weapon.crystal',
  'weapon.hide_warclub',
  'weapon.iron_falchion',
  'weapon.feather_javelin',
  'weapon.chitin',
  'weapon.wood_club',
];

export function attackProfile(weaponId: ItemId, ability: boolean): AttackProfile {
  const weapon = COMBAT_WEAPONS[weaponId];
  if (!weapon) throw new Error(`unsupported combat weapon: ${weaponId}`);
  if (!ability) return { damage: weapon.damage, range: weapon.range, arc: weapon.arc, cooldownMs: weapon.cooldownMs };
  return {
    damage: Math.max(1, Math.round(weapon.damage * weapon.ability.damageMultiplier)),
    range: weapon.range * weapon.ability.rangeMultiplier,
    arc: Math.min(Math.PI * 2, weapon.arc * weapon.ability.arcMultiplier),
    cooldownMs: weapon.ability.cooldownMs,
  };
}

export function targetInsideAttackArc(
  playerX: number,
  playerY: number,
  facing: number,
  targetX: number,
  targetY: number,
  range: number,
  arc: number,
): boolean {
  if (Math.hypot(targetX - playerX, targetY - playerY) > range) return false;
  if (arc >= Math.PI * 2 - 0.001) return true;
  const angle = Math.atan2(targetY - playerY, targetX - playerX);
  let difference = Math.abs(angle - facing) % (Math.PI * 2);
  if (difference > Math.PI) difference = Math.PI * 2 - difference;
  return difference <= arc / 2;
}

export function rollEnemyDrops(kind: CombatEnemyKind, rand: () => number = Math.random): InventoryStacks {
  const result: InventoryStacks = {};
  for (const entry of COMBAT_DROP_TABLES[kind]) {
    if (rand() >= entry.chance) continue;
    const amount = entry.min + Math.floor(rand() * (entry.max - entry.min + 1));
    result[entry.itemId] = (result[entry.itemId] ?? 0) + amount;
  }
  return result;
}

export function applyProgression(level: number, xp: number, gainedXp: number): ProgressionResult {
  let nextLevel = Math.max(1, level);
  let nextXp = Math.max(0, xp) + Math.max(0, gainedXp);
  let leveledUp = false;
  while (nextXp >= xpRequiredForLevel(nextLevel)) {
    nextXp -= xpRequiredForLevel(nextLevel);
    nextLevel += 1;
    leveledUp = true;
  }
  return { level: nextLevel, xp: nextXp, maxHp: maxHpForLevel(nextLevel), leveledUp };
}

export function bestArmorReduction(snapshot: InventorySnapshot): number {
  let reduction = 0;
  for (const [itemId, value] of Object.entries(ARMOR_REDUCTION) as Array<[ItemId, number]>) {
    if ((snapshot.stacks[itemId] ?? 0) > 0) reduction = Math.max(reduction, value);
  }
  return reduction;
}

export function reduceIncomingDamage(rawDamage: number, reduction: number): number {
  return Math.max(1, Math.round(Math.max(0, rawDamage) * (1 - Math.max(0, Math.min(0.9, reduction)))));
}

function lossRatio(riskTier: CombatRiskTier): number {
  if (riskTier === 'frontier') return 0.25;
  if (riskTier === 'fracture') return 0.6;
  if (riskTier === 'lost') return 1;
  return 0;
}

export function planDeathLoss(snapshot: InventorySnapshot, riskTier: CombatRiskTier): DeathLossPlan {
  const ratio = lossRatio(riskTier);
  const dropped: InventoryStacks = {};
  const retained: InventoryStacks = { ...snapshot.stacks };
  if (ratio <= 0) {
    return { dropped, retained, progressionLevel: snapshot.progressionLevel, equippedWeapon: snapshot.equippedWeapon };
  }

  for (const [itemId, quantity] of Object.entries(snapshot.stacks) as Array<[ItemId, number]>) {
    const definition = ITEM_CATALOG[itemId];
    if (definition.unique || itemId === 'weapon.bone') continue;
    const amount = Math.floor(quantity * ratio);
    if (amount <= 0) continue;
    dropped[itemId] = amount;
    const left = quantity - amount;
    if (left > 0) retained[itemId] = left;
    else delete retained[itemId];
  }

  if (riskTier === 'fracture') {
    const unique = UNIQUE_DROP_PRIORITY.find((itemId) => (snapshot.stacks[itemId] ?? 0) > 0);
    if (unique) {
      dropped[unique] = 1;
      delete retained[unique];
    }
  } else if (riskTier === 'lost') {
    for (const [itemId, quantity] of Object.entries(snapshot.stacks) as Array<[ItemId, number]>) {
      if (!ITEM_CATALOG[itemId].unique || itemId === 'weapon.bone' || itemId === 'companion.cave_pup' || quantity <= 0) continue;
      dropped[itemId] = quantity;
      delete retained[itemId];
    }
  }

  retained['weapon.bone'] = 1;
  const equippedWeapon = (retained[snapshot.equippedWeapon] ?? 0) > 0 ? snapshot.equippedWeapon : 'weapon.bone';
  return {
    dropped,
    retained,
    progressionLevel: riskTier === 'lost' ? 1 : snapshot.progressionLevel,
    equippedWeapon,
  };
}

export function negativeDeltas(stacks: InventoryStacks): InventoryStacks {
  return Object.fromEntries(Object.entries(stacks).map(([itemId, quantity]) => [itemId, -(quantity ?? 0)])) as InventoryStacks;
}
