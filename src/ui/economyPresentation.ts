import type { ServerInventoryCatalog, ServerItemId } from '../api';


export const CROWNS_PER_CRYSTAL = 25;

/** A presentation-only denomination. Canonical merchant commands continue to
 * spend server-owned Crystals; Crowns never become a client-authored balance. */
export function crownValue(crystals: number): number {
  return Math.max(0, Math.floor(crystals)) * CROWNS_PER_CRYSTAL;
}

export interface ItemPresentation {
  label: string;
  shortLabel: string;
  sprite: string;
  description: string;
}

const ITEM_PRESENTATION: Record<ServerItemId, ItemPresentation> = {
  'currency.crystal': { label: 'Crystals', shortLabel: 'crystals', sprite: 'crystal', description: 'Realm currency used by merchants and forbidden exchanges.' },
  'consumable.shroom': { label: 'Glowshrooms', shortLabel: 'shrooms', sprite: 'glowshroom', description: 'Bioluminescent provisions carried between expeditions.' },
  'material.wood': { label: 'Seasoned Wood', shortLabel: 'wood', sprite: 'wood', description: 'Structural material gathered from server-owned resource nodes.' },
  'material.iron': { label: 'Iron Ore', shortLabel: 'iron', sprite: 'ironOre', description: 'Dense ore used for weapons, tools and reinforced supplies.' },
  'material.meat': { label: 'Preserved Meat', shortLabel: 'meat', sprite: 'meat', description: 'Settlement produce and expedition provisions.' },
  'material.hide': { label: 'Treated Hide', shortLabel: 'hide', sprite: 'hide', description: 'Durable material used for armor and heavy weapons.' },
  'material.feathers': { label: 'Flight Feathers', shortLabel: 'feathers', sprite: 'feathers', description: 'Balanced feathers used in long-reach crafted weapons.' },
  'weapon.bone': { label: 'Bone Shiv', shortLabel: 'Bone Shiv', sprite: 'weaponBone', description: 'A fast close-range starter weapon.' },
  'weapon.chitin': { label: 'Chitin Blade', shortLabel: 'Chitin Blade', sprite: 'weaponChitin', description: 'A serrated merchant weapon cut from hardened shell.' },
  'weapon.crystal': { label: 'Crystal Edge', shortLabel: 'Crystal Edge', sprite: 'weaponCrystal', description: 'A rare blade tuned to volatile crystal energy.' },
  'weapon.wood_club': { label: 'Wood Club', shortLabel: 'Wood Club', sprite: 'weaponWoodClub', description: 'A dependable crafted impact weapon.' },
  'weapon.iron_falchion': { label: 'Iron Falchion', shortLabel: 'Iron Falchion', sprite: 'weaponIronFalchion', description: 'A forged blade with a broad cutting arc.' },
  'weapon.hide_warclub': { label: 'Hide Warclub', shortLabel: 'Hide Warclub', sprite: 'weaponHideWarclub', description: 'A wrapped heavy club built for knockback.' },
  'weapon.feather_javelin': { label: 'Feathered Javelin', shortLabel: 'Javelin', sprite: 'weaponFeatherJavelin', description: 'A balanced reach weapon made for precise strikes.' },
  'weapon.prism_halberd': { label: 'Prism Halberd', shortLabel: 'Prism Halberd', sprite: 'weaponPrismHalberd', description: 'A high-level crystal polearm for veteran explorers.' },
  'tool.axe': { label: 'Expedition Axe', shortLabel: 'axe', sprite: 'tool.axe', description: 'Unlocks authoritative timber harvesting.' },
  'tool.pickaxe': { label: 'Mining Pick', shortLabel: 'pickaxe', sprite: 'tool.pickaxe', description: 'Unlocks authoritative ore and seam extraction.' },
  'armor.leather': { label: 'Leather Armor', shortLabel: 'Leather Armor', sprite: 'armor.leather', description: 'Light protection for early frontier routes.' },
  'armor.iron': { label: 'Iron Armor', shortLabel: 'Iron Armor', sprite: 'armor.iron', description: 'Heavy protection for dangerous territories.' },
  'armor.hideVest': { label: 'Hide Vest', shortLabel: 'Hide Vest', sprite: 'armor.hideVest', description: 'Crafted protection made from treated hides.' },
  'container.supply_crate': { label: 'Supply Crate', shortLabel: 'crate', sprite: 'chestClosed', description: 'A sealed server-rolled cache of expedition supplies.' },
  'companion.cave_pup': { label: 'Cave Pup', shortLabel: 'Cave Pup', sprite: 'pet', description: 'A loyal companion that follows your expedition.' },
};

export function itemPresentation(itemId: ServerItemId): ItemPresentation {
  return ITEM_PRESENTATION[itemId];
}

export function formatStackMap(stacks: Partial<Record<ServerItemId, number>>, separator = ' · '): string {
  return Object.entries(stacks)
    .filter((entry): entry is [ServerItemId, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([id, amount]) => `${amount} ${itemPresentation(id).shortLabel}`)
    .join(separator);
}

export function primaryOutput(stacks: Partial<Record<ServerItemId, number>>): ServerItemId | null {
  return (Object.keys(stacks) as ServerItemId[]).find((id) => (stacks[id] ?? 0) > 0) ?? null;
}

export function catalogRecipe(catalog: ServerInventoryCatalog | null, id: string) {
  return catalog?.recipes.find((recipe) => recipe.id === id) ?? null;
}

export function catalogOffer(catalog: ServerInventoryCatalog | null, id: string) {
  return catalog?.shopOffers.find((offer) => offer.id === id) ?? null;
}
