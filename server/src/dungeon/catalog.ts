import type { ResourceLandId } from '../world/regionResourceProfiles.js';

export interface DungeonDefinition {
  id: string;
  name: string;
  landId: ResourceLandId;
  floors: number;
  recommendedLevel: number;
  entranceRegion: { rx: number; ry: number };
}

export const DUNGEON_DEFINITIONS: readonly DungeonDefinition[] = [
  { id: 'hagspire-cellars', name: 'Hagspire Cellars', landId: 'witchlands', floors: 5, recommendedLevel: 2, entranceRegion: { rx: -3, ry: -4 } },
  { id: 'bone-orchard', name: 'The Bone Orchard', landId: 'witchlands', floors: 4, recommendedLevel: 4, entranceRegion: { rx: -2, ry: -3 } },
  { id: 'old-crown-mine', name: 'Old Crown Mine', landId: 'green-land', floors: 5, recommendedLevel: 1, entranceRegion: { rx: 1, ry: -1 } },
  { id: 'briarhold-keep', name: 'Briarhold Keep', landId: 'green-land', floors: 4, recommendedLevel: 3, entranceRegion: { rx: -1, ry: -1 } },
  { id: 'sunken-temple', name: 'Sunken Temple', landId: 'rainforest', floors: 6, recommendedLevel: 4, entranceRegion: { rx: 3, ry: -4 } },
  { id: 'serpent-observatory', name: 'Serpent Observatory', landId: 'rainforest', floors: 4, recommendedLevel: 5, entranceRegion: { rx: 5, ry: -3 } },
  { id: 'aurora-vault', name: 'Aurora Vault', landId: 'frostlands', floors: 5, recommendedLevel: 5, entranceRegion: { rx: -3, ry: 4 } },
  { id: 'mammoth-grave', name: 'Mammoth Grave', landId: 'frostlands', floors: 4, recommendedLevel: 4, entranceRegion: { rx: -5, ry: 4 } },
  { id: 'kingless-tomb', name: 'Kingless Tomb', landId: 'sunscorched-desert', floors: 6, recommendedLevel: 5, entranceRegion: { rx: -1, ry: 4 } },
  { id: 'glass-furnace', name: 'Glass Furnace', landId: 'sunscorched-desert', floors: 4, recommendedLevel: 4, entranceRegion: { rx: 1, ry: 3 } },
  { id: 'caldera-foundry', name: 'Caldera Foundry', landId: 'cinder-coast', floors: 5, recommendedLevel: 5, entranceRegion: { rx: 3, ry: 4 } },
  { id: 'drowned-arsenal', name: 'Drowned Arsenal', landId: 'cinder-coast', floors: 4, recommendedLevel: 4, entranceRegion: { rx: 5, ry: 3 } },
] as const;

const BY_ID = new Map(DUNGEON_DEFINITIONS.map((definition) => [definition.id, definition]));

export function dungeonDefinition(id: string): DungeonDefinition | undefined {
  return BY_ID.get(id);
}
