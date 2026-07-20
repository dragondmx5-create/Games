import type { Prisma } from '@prisma/client';
import type { SaveData } from './schema.js';
import { ensureStarterAccountState } from '../account/bootstrap.js';

interface InventoryRow {
  progressionLevel: number;
  equippedWeapon: string;
  hasPet: boolean;
}
interface StackRow { itemId: string; quantity: number }
interface CombatRow { hp: number; maxHp: number; xp: number; level: number }
interface PositionRow { rx: number; ry: number; x: number; y: number }
interface UnderworldRow {
  reputation: number;
  discoveredRoutes: unknown;
  forbiddenDungeonKeys: number;
  activeContracts: number;
  inspectionProtection: number;
}

const WEAPONS = ['bone', 'chitin', 'crystal', 'wood_club', 'iron_falchion', 'hide_warclub', 'feather_javelin', 'prism_halberd'] as const;
const TOOLS = ['axe', 'pickaxe'] as const;
const ARMOR = ['leather', 'iron', 'hideVest'] as const;
const LANDS = ['witchlands', 'green-land', 'rainforest', 'frostlands', 'sunscorched-desert', 'cinder-coast'] as const;

function amount(stacks: ReadonlyMap<string, number>, itemId: string): number {
  return stacks.get(itemId) ?? 0;
}

function routes(value: unknown): SaveData['underworld']['discoveredRoutes'] {
  if (!Array.isArray(value)) return ['green-land'];
  const result = value.filter((entry): entry is typeof LANDS[number] => typeof entry === 'string' && LANDS.includes(entry as typeof LANDS[number]));
  return [...new Set(result)];
}

/**
 * Demotes SaveGame to a presentation/checkpoint document. Once canonical rows
 * exist, all value-bearing and progression fields are projected from the
 * database and client-provided copies are ignored.
 */
export async function canonicalizeSaveData(
  tx: Prisma.TransactionClient,
  userId: string,
  input: SaveData,
): Promise<SaveData> {
  await ensureStarterAccountState(tx, userId);
  const inventoryRows = await tx.$queryRaw<InventoryRow[]>`
    SELECT "progressionLevel", "equippedWeapon", "hasPet"
    FROM "PlayerInventory" WHERE "userId" = ${userId}
  `;
  const inventory = inventoryRows[0];
  if (!inventory) throw new Error('canonical account bootstrap failed');

  const [stackRows, combatRows, underworldRows, positionRows] = await Promise.all([
    tx.$queryRaw<StackRow[]>`SELECT "itemId", "quantity" FROM "InventoryStack" WHERE "userId" = ${userId}`,
    tx.$queryRaw<CombatRow[]>`SELECT "hp", "maxHp", "xp", "level" FROM "PlayerCombatState" WHERE "userId" = ${userId}`,
    tx.$queryRaw<UnderworldRow[]>`
      SELECT "reputation", "discoveredRoutes", "forbiddenDungeonKeys", "activeContracts", "inspectionProtection"
      FROM "PlayerUnderworldState" WHERE "userId" = ${userId}
    `,
    tx.$queryRaw<PositionRow[]>`SELECT "rx", "ry", "x", "y" FROM "PlayerWorldPosition" WHERE "userId" = ${userId}`,
  ]);
  const stacks = new Map(stackRows.map((row: StackRow) => [row.itemId, row.quantity]));
  const weapons = WEAPONS.filter((weapon) => amount(stacks, `weapon.${weapon}`) > 0);
  if (!weapons.includes('bone')) weapons.unshift('bone');
  const equipped = inventory.equippedWeapon.startsWith('weapon.') ? inventory.equippedWeapon.slice(7) : 'bone';
  const combat = combatRows[0];
  const underworld = underworldRows[0];
  const position = positionRows[0];

  return {
    ...input,
    currentRegion: position ? { rx: position.rx, ry: position.ry } : input.currentRegion,
    pos: position ? { x: position.x, y: position.y } : input.pos,
    player: {
      ...input.player,
      hp: combat?.hp ?? input.player.hp,
      maxHp: combat?.maxHp ?? input.player.maxHp,
      xp: combat?.xp ?? input.player.xp,
      level: combat?.level ?? inventory.progressionLevel,
      loot: amount(stacks, 'currency.crystal'),
      shrooms: amount(stacks, 'consumable.shroom'),
      wood: amount(stacks, 'material.wood'),
      iron: amount(stacks, 'material.iron'),
      meat: amount(stacks, 'material.meat'),
      hide: amount(stacks, 'material.hide'),
      feathers: amount(stacks, 'material.feathers'),
      chests: amount(stacks, 'container.supply_crate'),
      weapons: [...weapons],
      weaponIdx: Math.max(0, weapons.indexOf(equipped as typeof WEAPONS[number])),
      tools: TOOLS.filter((tool) => amount(stacks, `tool.${tool}`) > 0),
      armor: ARMOR.filter((armor) => amount(stacks, `armor.${armor}`) > 0),
    },
    hasPet: inventory.hasPet || amount(stacks, 'companion.cave_pup') > 0,
    bags: [],
    underworld: underworld ? {
      reputation: underworld.reputation,
      discoveredRoutes: routes(underworld.discoveredRoutes),
      forbiddenDungeonKeys: underworld.forbiddenDungeonKeys,
      activeContracts: underworld.activeContracts,
      inspectionProtection: underworld.inspectionProtection,
    } : input.underworld,
    savedAt: new Date().toISOString(),
  };
}
