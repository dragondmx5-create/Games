import type { Player } from './entities';
import type { ArmorId, ToolId, WeaponId } from './config';
import type { ServerInventorySnapshot, ServerItemId } from './api';

export const WEAPON_ITEMS: Array<[ServerItemId, WeaponId]> = [
  ['weapon.bone', 'bone'], ['weapon.chitin', 'chitin'], ['weapon.crystal', 'crystal'],
  ['weapon.wood_club', 'wood_club'], ['weapon.iron_falchion', 'iron_falchion'],
  ['weapon.hide_warclub', 'hide_warclub'], ['weapon.feather_javelin', 'feather_javelin'],
  ['weapon.prism_halberd', 'prism_halberd'],
];
export const TOOL_ITEMS: Array<[ServerItemId, ToolId]> = [['tool.axe', 'axe'], ['tool.pickaxe', 'pickaxe']];
export const ARMOR_ITEMS: Array<[ServerItemId, ArmorId]> = [['armor.leather', 'leather'], ['armor.iron', 'iron'], ['armor.hideVest', 'hideVest']];

function quantity(snapshot: ServerInventorySnapshot, itemId: ServerItemId): number {
  return snapshot.stacks[itemId] ?? 0;
}

/** Applies the canonical account inventory to the legacy Player projection.
 * Player remains the renderer/gameplay view while the backend inventory is
 * progressively becoming the economic source of truth. */
export function applyServerInventorySnapshot(player: Player, snapshot: ServerInventorySnapshot): { hasPet: boolean } {
  player.loot = quantity(snapshot, 'currency.crystal');
  player.shrooms = quantity(snapshot, 'consumable.shroom');
  player.wood = quantity(snapshot, 'material.wood');
  player.iron = quantity(snapshot, 'material.iron');
  player.meat = quantity(snapshot, 'material.meat');
  player.hide = quantity(snapshot, 'material.hide');
  player.feathers = quantity(snapshot, 'material.feathers');
  player.chests = quantity(snapshot, 'container.supply_crate');
  player.weapons = WEAPON_ITEMS.filter(([itemId]) => quantity(snapshot, itemId) > 0).map(([, weapon]) => weapon);
  if (!player.weapons.includes('bone')) player.weapons.unshift('bone');
  player.tools = TOOL_ITEMS.filter(([itemId]) => quantity(snapshot, itemId) > 0).map(([, tool]) => tool);
  player.armor = ARMOR_ITEMS.filter(([itemId]) => quantity(snapshot, itemId) > 0).map(([, armor]) => armor);
  const equipped = snapshot.equippedWeapon.startsWith('weapon.') ? snapshot.equippedWeapon.slice('weapon.'.length) as WeaponId : 'bone';
  player.weaponIdx = Math.max(0, player.weapons.indexOf(equipped));
  player.level = Math.max(player.level, snapshot.progressionLevel);
  return { hasPet: snapshot.hasPet || quantity(snapshot, 'companion.cave_pup') > 0 };
}


export interface LegacyProjectedItems {
  loot: number;
  shrooms: number;
  wood: number;
  iron: number;
  meat: number;
  hide: number;
  feathers: number;
  chests: number;
  weapons: WeaponId[];
  tools: ToolId[];
  armor: ArmorId[];
}

export function projectServerItemStacks(items: Partial<Record<ServerItemId, number>>): LegacyProjectedItems {
  const amount = (itemId: ServerItemId): number => items[itemId] ?? 0;
  return {
    loot: amount('currency.crystal'),
    shrooms: amount('consumable.shroom'),
    wood: amount('material.wood'),
    iron: amount('material.iron'),
    meat: amount('material.meat'),
    hide: amount('material.hide'),
    feathers: amount('material.feathers'),
    chests: amount('container.supply_crate'),
    weapons: WEAPON_ITEMS.filter(([itemId]) => amount(itemId) > 0).map(([, weapon]) => weapon),
    tools: TOOL_ITEMS.filter(([itemId]) => amount(itemId) > 0).map(([, tool]) => tool),
    armor: ARMOR_ITEMS.filter(([itemId]) => amount(itemId) > 0).map(([, armor]) => armor),
  };
}
