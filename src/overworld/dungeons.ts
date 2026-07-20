import type { LandId } from './types';

export interface DungeonDefinition {
  id: string;
  name: string;
  landId: LandId;
  floors: number;
  recommendedLevel: number;
  floorNames: readonly string[];
  signatureMechanic: string;
  boss: string;
}

export const DUNGEONS: readonly DungeonDefinition[] = [
  { id: 'hagspire-cellars', name: 'Hagspire Cellars', landId: 'witchlands', floors: 5, recommendedLevel: 2, floorNames: ['Charm Cellar', 'Candle Crypt', 'Mirror Hall', 'Briar Furnace', 'The Crone Room'], signatureMechanic: 'curse seals and false exits', boss: 'Mother Bramble' },
  { id: 'bone-orchard', name: 'The Bone Orchard', landId: 'witchlands', floors: 4, recommendedLevel: 4, floorNames: ['Root Gate', 'White Grove', 'Marrow Wells', 'The Hanging Tree'], signatureMechanic: 'living roots move corpses and loot bags', boss: 'The Orchard Widow' },
  { id: 'old-crown-mine', name: 'Old Crown Mine', landId: 'green-land', floors: 5, recommendedLevel: 1, floorNames: ['Company Road', 'Iron Galleries', 'Flooded Cut', 'Royal Seam', 'The Crown Engine'], signatureMechanic: 'mine carts, cave-ins, and ore pressure', boss: 'The Crown Engine' },
  { id: 'briarhold-keep', name: 'Briarhold Keep', landId: 'green-land', floors: 4, recommendedLevel: 3, floorNames: ['Outer Ward', 'Thorn Court', 'Sunken Chapel', 'Briar Throne'], signatureMechanic: 'doors reclaimed by growing thorn walls', boss: 'The Briar Castellan' },
  { id: 'sunken-temple', name: 'Sunken Temple', landId: 'rainforest', floors: 6, recommendedLevel: 4, floorNames: ['Flood Gate', 'Jaguar Court', 'Rain Cistern', 'Serpent Calendar', 'Drowned Archive', 'Eye of the Monsoon'], signatureMechanic: 'water levels alter routes between rooms', boss: 'The Monsoon Idol' },
  { id: 'serpent-observatory', name: 'Serpent Observatory', landId: 'rainforest', floors: 4, recommendedLevel: 5, floorNames: ['Vine Lift', 'Star Chamber', 'Venom Lens', 'Sky Coil'], signatureMechanic: 'rotating rooms and poison constellations', boss: 'The Sky Coil' },
  { id: 'aurora-vault', name: 'Aurora Vault', landId: 'frostlands', floors: 5, recommendedLevel: 5, floorNames: ['Blue Door', 'Frozen Choir', 'Star Ice Gallery', 'Silent Reactor', 'Aurora Heart'], signatureMechanic: 'heat zones and whiteout visibility', boss: 'The Aurora Heart' },
  { id: 'mammoth-grave', name: 'Mammoth Grave', landId: 'frostlands', floors: 4, recommendedLevel: 4, floorNames: ['Tusk Gate', 'Burial Snow', 'Bone Cathedral', 'Ancestor Pit'], signatureMechanic: 'moving ice shelves and collapsing snow', boss: 'The First Tusk' },
  { id: 'kingless-tomb', name: 'Kingless Tomb', landId: 'sunscorched-desert', floors: 6, recommendedLevel: 5, floorNames: ['Thief Stair', 'Salt Court', 'Mirror Crypt', 'Scorpion Vault', 'Empty Throne', 'The Nameless Crown'], signatureMechanic: 'light, mirrors, and pressure traps', boss: 'The Nameless Crown' },
  { id: 'glass-furnace', name: 'Glass Furnace', landId: 'sunscorched-desert', floors: 4, recommendedLevel: 4, floorNames: ['Cold Kiln', 'Molten Run', 'Lens Foundry', 'Solar Crucible'], signatureMechanic: 'heat cycles reshape walkable ground', boss: 'The Solar Crucible' },
  { id: 'caldera-foundry', name: 'Caldera Foundry', landId: 'cinder-coast', floors: 5, recommendedLevel: 5, floorNames: ['Chain Dock', 'Slag Works', 'Pressure Hall', 'Red Crucible', 'Caldera Core'], signatureMechanic: 'lava pressure and moving industrial lifts', boss: 'The Caldera Core' },
  { id: 'drowned-arsenal', name: 'Drowned Arsenal', landId: 'cinder-coast', floors: 4, recommendedLevel: 4, floorNames: ['Tide Lock', 'Powder Vault', 'Sunken Barracks', 'Admiral Below'], signatureMechanic: 'tides reveal and conceal weapon caches', boss: 'The Drowned Admiral' },
] as const;

const DUNGEON_BY_ID = new Map(DUNGEONS.map((item) => [item.id, item]));

export function getDungeon(id: string): DungeonDefinition {
  const dungeon = DUNGEON_BY_ID.get(id);
  if (!dungeon) throw new Error(`Unknown dungeon: ${id}`);
  return dungeon;
}
