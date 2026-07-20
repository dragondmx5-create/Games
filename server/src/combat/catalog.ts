import type { ItemId } from '../economy/catalog.js';

export type CombatEnemyKind = 'bug' | 'shellbug' | 'wallworm' | 'spitter';
export type CombatRiskTier = 'sanctuary' | 'frontier' | 'fracture' | 'lost';

export interface CombatWeaponDefinition {
  itemId: ItemId;
  damage: number;
  range: number;
  arc: number;
  cooldownMs: number;
  ability: {
    damageMultiplier: number;
    rangeMultiplier: number;
    arcMultiplier: number;
    cooldownMs: number;
  };
}

export interface CombatEnemyDefinition {
  kind: CombatEnemyKind;
  hp: number;
  speed: number;
  damage: number;
  attackCooldownMs: number;
  aggroRange: number;
  attackRange: number;
  respawnMs: number;
  xp: number;
}

export interface CombatDropEntry {
  itemId: ItemId;
  chance: number;
  min: number;
  max: number;
}

const weapon = (
  itemId: ItemId,
  damage: number,
  range: number,
  arc: number,
  cooldownMs: number,
  ability: CombatWeaponDefinition['ability'],
): CombatWeaponDefinition => ({ itemId, damage, range, arc, cooldownMs, ability });

export const COMBAT_WEAPONS: Readonly<Record<string, CombatWeaponDefinition>> = Object.freeze({
  'weapon.bone': weapon('weapon.bone', 1, 28, Math.PI * 0.8, 320, {
    damageMultiplier: 3,
    rangeMultiplier: 1,
    arcMultiplier: 1.25,
    cooldownMs: 5_000,
  }),
  'weapon.chitin': weapon('weapon.chitin', 2, 33, Math.PI * 0.9, 440, {
    damageMultiplier: 1,
    rangeMultiplier: 1,
    arcMultiplier: (Math.PI * 2) / (Math.PI * 0.9),
    cooldownMs: 7_000,
  }),
  'weapon.crystal': weapon('weapon.crystal', 3, 39, Math.PI, 580, {
    damageMultiplier: 2,
    rangeMultiplier: 1.3,
    arcMultiplier: 0.6,
    cooldownMs: 9_000,
  }),
  'weapon.wood_club': weapon('weapon.wood_club', 1, 27, Math.PI * 0.75, 360, {
    damageMultiplier: 1,
    rangeMultiplier: 1,
    arcMultiplier: (Math.PI * 2) / (Math.PI * 0.75),
    cooldownMs: 6_000,
  }),
  'weapon.iron_falchion': weapon('weapon.iron_falchion', 2, 31, Math.PI * 0.85, 400, {
    damageMultiplier: 2.6,
    rangeMultiplier: 1,
    arcMultiplier: 1.3,
    cooldownMs: 5_500,
  }),
  'weapon.hide_warclub': weapon('weapon.hide_warclub', 3, 26, Math.PI * 0.7, 620, {
    damageMultiplier: 3,
    rangeMultiplier: 0.85,
    arcMultiplier: 1,
    cooldownMs: 7_500,
  }),
  'weapon.feather_javelin': weapon('weapon.feather_javelin', 2, 36, Math.PI * 0.6, 500, {
    damageMultiplier: 2.8,
    rangeMultiplier: 1.5,
    arcMultiplier: 0.4,
    cooldownMs: 6_500,
  }),
  'weapon.prism_halberd': weapon('weapon.prism_halberd', 4, 42, Math.PI * 0.85, 660, {
    damageMultiplier: 2.2,
    rangeMultiplier: 1.35,
    arcMultiplier: 0.55,
    cooldownMs: 8_500,
  }),
});

export const COMBAT_ENEMIES: Readonly<Record<CombatEnemyKind, CombatEnemyDefinition>> = Object.freeze({
  bug: { kind: 'bug', hp: 2, speed: 38, damage: 1, attackCooldownMs: 700, aggroRange: 180, attackRange: 14, respawnMs: 35_000, xp: 3 },
  shellbug: { kind: 'shellbug', hp: 5, speed: 22, damage: 1, attackCooldownMs: 900, aggroRange: 170, attackRange: 14, respawnMs: 55_000, xp: 4 },
  wallworm: { kind: 'wallworm', hp: 3, speed: 48, damage: 1, attackCooldownMs: 800, aggroRange: 200, attackRange: 15, respawnMs: 45_000, xp: 4 },
  spitter: { kind: 'spitter', hp: 2, speed: 30, damage: 1, attackCooldownMs: 1_400, aggroRange: 220, attackRange: 76, respawnMs: 50_000, xp: 5 },
});

export const COMBAT_DROP_TABLES: Readonly<Record<CombatEnemyKind, readonly CombatDropEntry[]>> = Object.freeze({
  bug: [{ itemId: 'currency.crystal', chance: 0.08, min: 1, max: 1 }],
  shellbug: [
    { itemId: 'currency.crystal', chance: 0.2, min: 1, max: 2 },
    { itemId: 'consumable.shroom', chance: 0.15, min: 1, max: 2 },
    { itemId: 'material.meat', chance: 0.12, min: 1, max: 2 },
  ],
  wallworm: [
    { itemId: 'weapon.chitin', chance: 0.06, min: 1, max: 1 },
    { itemId: 'consumable.shroom', chance: 0.15, min: 1, max: 1 },
    { itemId: 'material.iron', chance: 0.1, min: 1, max: 1 },
  ],
  spitter: [
    { itemId: 'currency.crystal', chance: 0.18, min: 1, max: 2 },
    { itemId: 'material.wood', chance: 0.1, min: 1, max: 2 },
  ],
});

export const ARMOR_REDUCTION: Readonly<Partial<Record<ItemId, number>>> = Object.freeze({
  'armor.leather': 0.2,
  'armor.iron': 0.4,
  'armor.hideVest': 0.25,
});

export const PLAYER_BASE_HP = 10;
export const PLAYER_HP_PER_LEVEL = 2;
export const BASE_XP_PER_LEVEL = 20;
export const XP_PER_LEVEL_STEP = 12;

export function xpRequiredForLevel(level: number): number {
  return BASE_XP_PER_LEVEL + (Math.max(1, level) - 1) * XP_PER_LEVEL_STEP;
}

export function maxHpForLevel(level: number): number {
  return PLAYER_BASE_HP + (Math.max(1, level) - 1) * PLAYER_HP_PER_LEVEL;
}
