export interface VaultLootBag {
  loot: number;
  shrooms: number;
  weapons: string[];
  tools: string[];
  armor: string[];
  chests: number;
  wood: number;
  iron: number;
  meat: number;
  hide: number;
  feathers: number;
}

const MATERIAL_VALUE = { wood: 1, iron: 2, meat: 2, hide: 3, feathers: 3 } as const;
const WEAPON_VALUE: Record<string, number> = {
  bone: 0,
  chitin: 10,
  crystal: 22,
  wood_club: 6,
  iron_falchion: 12,
  hide_warclub: 16,
  feather_javelin: 15,
  prism_halberd: 16,
};
const TOOL_VALUE: Record<string, number> = { axe: 6, pickaxe: 8 };
const ARMOR_VALUE: Record<string, number> = { leather: 12, iron: 26, hideVest: 15 };
const CHEST_VALUE = 18;

/** Server-owned mirror of the client balance table used for lost death bags. */
export function lootBagValue(bag: VaultLootBag): number {
  let total = bag.loot + bag.shrooms;
  total += bag.wood * MATERIAL_VALUE.wood;
  total += bag.iron * MATERIAL_VALUE.iron;
  total += bag.meat * MATERIAL_VALUE.meat;
  total += bag.hide * MATERIAL_VALUE.hide;
  total += bag.feathers * MATERIAL_VALUE.feathers;
  for (const weapon of bag.weapons) total += WEAPON_VALUE[weapon] ?? 0;
  for (const tool of bag.tools) total += TOOL_VALUE[tool] ?? 0;
  for (const armor of bag.armor) total += ARMOR_VALUE[armor] ?? 0;
  total += bag.chests * CHEST_VALUE;
  return total;
}

export function splitVaultContribution(total: number): { layer1: number; layer5: number } {
  if (!Number.isSafeInteger(total) || total <= 0) return { layer1: 0, layer5: 0 };
  const layer1 = Math.round(total * 0.8);
  return { layer1, layer5: total - layer1 };
}
