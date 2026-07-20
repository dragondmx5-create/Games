export const ITEM_IDS = [
  'currency.crystal',
  'consumable.shroom',
  'material.wood',
  'material.iron',
  'material.meat',
  'material.hide',
  'material.feathers',
  'weapon.bone',
  'weapon.chitin',
  'weapon.crystal',
  'weapon.wood_club',
  'weapon.iron_falchion',
  'weapon.hide_warclub',
  'weapon.feather_javelin',
  'weapon.prism_halberd',
  'tool.axe',
  'tool.pickaxe',
  'armor.leather',
  'armor.iron',
  'armor.hideVest',
  'container.supply_crate',
  'companion.cave_pup',
] as const;

export type ItemId = (typeof ITEM_IDS)[number];
export type ItemCategory = 'currency' | 'consumable' | 'material' | 'weapon' | 'tool' | 'armor' | 'container' | 'companion';

export interface ItemDefinition {
  id: ItemId;
  category: ItemCategory;
  maxStack: number;
  unique: boolean;
}

function item(id: ItemId, category: ItemCategory, maxStack: number, unique = false): ItemDefinition {
  return { id, category, maxStack, unique };
}

export const ITEM_CATALOG: Readonly<Record<ItemId, ItemDefinition>> = Object.freeze({
  'currency.crystal': item('currency.crystal', 'currency', 1_000_000),
  'consumable.shroom': item('consumable.shroom', 'consumable', 1_000_000),
  'material.wood': item('material.wood', 'material', 1_000_000),
  'material.iron': item('material.iron', 'material', 1_000_000),
  'material.meat': item('material.meat', 'material', 1_000_000),
  'material.hide': item('material.hide', 'material', 1_000_000),
  'material.feathers': item('material.feathers', 'material', 1_000_000),
  'weapon.bone': item('weapon.bone', 'weapon', 1, true),
  'weapon.chitin': item('weapon.chitin', 'weapon', 1, true),
  'weapon.crystal': item('weapon.crystal', 'weapon', 1, true),
  'weapon.wood_club': item('weapon.wood_club', 'weapon', 1, true),
  'weapon.iron_falchion': item('weapon.iron_falchion', 'weapon', 1, true),
  'weapon.hide_warclub': item('weapon.hide_warclub', 'weapon', 1, true),
  'weapon.feather_javelin': item('weapon.feather_javelin', 'weapon', 1, true),
  'weapon.prism_halberd': item('weapon.prism_halberd', 'weapon', 1, true),
  'tool.axe': item('tool.axe', 'tool', 1, true),
  'tool.pickaxe': item('tool.pickaxe', 'tool', 1, true),
  'armor.leather': item('armor.leather', 'armor', 1, true),
  'armor.iron': item('armor.iron', 'armor', 1, true),
  'armor.hideVest': item('armor.hideVest', 'armor', 1, true),
  'container.supply_crate': item('container.supply_crate', 'container', 10_000),
  'companion.cave_pup': item('companion.cave_pup', 'companion', 1, true),
});

export interface RecipeDefinition {
  id: string;
  minLevel: number;
  costs: Partial<Record<ItemId, number>>;
  outputs: Partial<Record<ItemId, number>>;
}

export const RECIPES: Readonly<Record<string, RecipeDefinition>> = Object.freeze({
  craft_wood_club: { id: 'craft_wood_club', minLevel: 1, costs: { 'material.wood': 6 }, outputs: { 'weapon.wood_club': 1 } },
  craft_iron_falchion: { id: 'craft_iron_falchion', minLevel: 1, costs: { 'material.iron': 5, 'material.wood': 2 }, outputs: { 'weapon.iron_falchion': 1 } },
  craft_hide_warclub: { id: 'craft_hide_warclub', minLevel: 1, costs: { 'material.hide': 4, 'material.wood': 4 }, outputs: { 'weapon.hide_warclub': 1 } },
  craft_feather_javelin: { id: 'craft_feather_javelin', minLevel: 1, costs: { 'material.feathers': 4, 'material.wood': 3 }, outputs: { 'weapon.feather_javelin': 1 } },
  craft_prism_halberd: { id: 'craft_prism_halberd', minLevel: 5, costs: { 'currency.crystal': 8, 'material.iron': 4 }, outputs: { 'weapon.prism_halberd': 1 } },
  craft_hide_vest: { id: 'craft_hide_vest', minLevel: 1, costs: { 'material.hide': 5 }, outputs: { 'armor.hideVest': 1 } },
  craft_supply_crate: { id: 'craft_supply_crate', minLevel: 1, costs: { 'material.wood': 4, 'material.iron': 2 }, outputs: { 'container.supply_crate': 1 } },
});

export interface ShopOfferDefinition {
  id: string;
  crystalCost: number;
  outputs: Partial<Record<ItemId, number>>;
}

export const SHOP_OFFERS: Readonly<Record<string, ShopOfferDefinition>> = Object.freeze({
  buy_chitin: { id: 'buy_chitin', crystalCost: 10, outputs: { 'weapon.chitin': 1 } },
  buy_crystal: { id: 'buy_crystal', crystalCost: 22, outputs: { 'weapon.crystal': 1 } },
  buy_shrooms: { id: 'buy_shrooms', crystalCost: 4, outputs: { 'consumable.shroom': 5 } },
  buy_pet: { id: 'buy_pet', crystalCost: 15, outputs: { 'companion.cave_pup': 1 } },
  buy_axe: { id: 'buy_axe', crystalCost: 6, outputs: { 'tool.axe': 1 } },
  buy_pickaxe: { id: 'buy_pickaxe', crystalCost: 8, outputs: { 'tool.pickaxe': 1 } },
  buy_leather_armor: { id: 'buy_leather_armor', crystalCost: 12, outputs: { 'armor.leather': 1 } },
  buy_iron_armor: { id: 'buy_iron_armor', crystalCost: 26, outputs: { 'armor.iron': 1 } },
  buy_chest: { id: 'buy_chest', crystalCost: 18, outputs: { 'container.supply_crate': 1 } },
});

export function isItemId(value: string): value is ItemId {
  return Object.prototype.hasOwnProperty.call(ITEM_CATALOG, value);
}
