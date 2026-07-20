import { dungeonOverworldEntrance } from '../dungeon/overworldEntrance.js';
import { hashText32 } from './layoutRandom.js';
import { RESOURCE_REGION_SIZE } from './worldDimensions.js';

export type OverworldPortalKind = 'dungeon' | 'black-market' | 'red-gate' | 'black-gate';

export interface OverworldFeatureDefinition {
  id: string;
  kind: OverworldPortalKind;
  name: string;
  description: string;
  rx: number;
  ry: number;
  dungeonId?: string;
}

export const OVERWORLD_FEATURES: readonly OverworldFeatureDefinition[] = Object.freeze([
  { id: 'witch-red-gate', kind: 'red-gate', name: 'The Briar Breach', description: 'A guarded passage into the Blood Moors.', rx: -2, ry: -4 },
  { id: 'witch-black-gate', kind: 'black-gate', name: 'The Unspoken Door', description: 'A one-way threshold into a lost territory.', rx: -1, ry: -5 },
  { id: 'witch-market-route', kind: 'black-market', name: 'Gravewater Passage', description: 'A flooded crypt route to the Black Market.', rx: -5, ry: -5 },
  { id: 'witch-dungeon-1', kind: 'dungeon', name: 'Hagspire Cellars', description: 'A layered witch-tower dungeon.', rx: -3, ry: -4, dungeonId: 'hagspire-cellars' },
  { id: 'witch-dungeon-2', kind: 'dungeon', name: 'The Bone Orchard', description: 'A root-choked ossuary beneath dead trees.', rx: -2, ry: -3, dungeonId: 'bone-orchard' },

  { id: 'green-red-gate', kind: 'red-gate', name: 'Broken Vale Crossing', description: 'The last patrolled road before the Fracture.', rx: 0, ry: -3 },
  { id: 'green-black-gate', kind: 'black-gate', name: 'The Root Below', description: 'A living root tunnel into lost territory.', rx: 0, ry: -4 },
  { id: 'green-market-route', kind: 'black-market', name: 'Mill Tunnel', description: 'A sealed mill race leading to the Black Market.', rx: -1, ry: -2 },
  { id: 'green-dungeon-1', kind: 'dungeon', name: 'Old Crown Mine', description: 'A multi-floor iron mine beneath the hills.', rx: 1, ry: -1, dungeonId: 'old-crown-mine' },
  { id: 'green-dungeon-2', kind: 'dungeon', name: 'Briarhold Keep', description: 'A ruined keep reclaimed by thorn and beast.', rx: -1, ry: -1, dungeonId: 'briarhold-keep' },

  { id: 'rain-red-gate', kind: 'red-gate', name: 'Predator Causeway', description: 'An overgrown causeway where hunting law no longer applies.', rx: 2, ry: -4 },
  { id: 'rain-black-gate', kind: 'black-gate', name: 'The Drowned Mouth', description: 'A submerged path into the deepest jungle.', rx: 3, ry: -5 },
  { id: 'rain-market-route', kind: 'black-market', name: 'Falls Behind the Falls', description: 'A hidden cavern route to the Black Market.', rx: 5, ry: -5 },
  { id: 'rain-dungeon-1', kind: 'dungeon', name: 'Sunken Temple', description: 'A flooded temple of rotating chambers.', rx: 3, ry: -4, dungeonId: 'sunken-temple' },
  { id: 'rain-dungeon-2', kind: 'dungeon', name: 'Serpent Observatory', description: 'A vine-bound observatory above a sinkhole.', rx: 5, ry: -3, dungeonId: 'serpent-observatory' },

  { id: 'frost-red-gate', kind: 'red-gate', name: 'Rimebreak Pass', description: 'A storm pass beyond the rescue beacons.', rx: -2, ry: 4 },
  { id: 'frost-black-gate', kind: 'black-gate', name: 'The Blue Scar', description: 'A glacial rift that swallows compasses.', rx: -1, ry: 5 },
  { id: 'frost-market-route', kind: 'black-market', name: 'Underice Run', description: 'A tunnel beneath the lake leading to the Black Market.', rx: -5, ry: 5 },
  { id: 'frost-dungeon-1', kind: 'dungeon', name: 'Aurora Vault', description: 'An ice dungeon built around a fallen star.', rx: -3, ry: 4, dungeonId: 'aurora-vault' },
  { id: 'frost-dungeon-2', kind: 'dungeon', name: 'Mammoth Grave', description: 'A buried necropolis of ancient beasts.', rx: -5, ry: 4, dungeonId: 'mammoth-grave' },

  { id: 'desert-red-gate', kind: 'red-gate', name: 'The Shattered Mile', description: 'An abandoned caravan road controlled by raiders.', rx: -1, ry: 5 },
  { id: 'desert-black-gate', kind: 'black-gate', name: 'The Starless Dune', description: 'A dune that opens only when the sun disappears.', rx: 1, ry: 5 },
  { id: 'desert-market-route', kind: 'black-market', name: 'Cistern Drop', description: 'A dry well descending to the Black Market.', rx: 1, ry: 2 },
  { id: 'desert-dungeon-1', kind: 'dungeon', name: 'Kingless Tomb', description: 'A trap-filled royal tomb beneath moving sand.', rx: -1, ry: 4, dungeonId: 'kingless-tomb' },
  { id: 'desert-dungeon-2', kind: 'dungeon', name: 'Glass Furnace', description: 'A buried forge still hot after centuries.', rx: 1, ry: 3, dungeonId: 'glass-furnace' },

  { id: 'coast-red-gate', kind: 'red-gate', name: 'Burnt Anchorage', description: 'A lawless harbor at the edge of volcanic waters.', rx: 2, ry: 4 },
  { id: 'coast-black-gate', kind: 'black-gate', name: 'The Obsidian Wake', description: 'A sea-rift crossed by chained wrecks.', rx: 3, ry: 5 },
  { id: 'coast-market-route', kind: 'black-market', name: 'Smuggler Hulk', description: 'A grounded ship hiding a Black Market lift.', rx: 5, ry: 5 },
  { id: 'coast-dungeon-1', kind: 'dungeon', name: 'Caldera Foundry', description: 'A layered forge complex inside an active volcano.', rx: 3, ry: 4, dungeonId: 'caldera-foundry' },
  { id: 'coast-dungeon-2', kind: 'dungeon', name: 'Drowned Arsenal', description: 'A flooded military storehouse beneath the harbor.', rx: 5, ry: 3, dungeonId: 'drowned-arsenal' },
]);

export function overworldFeaturesAt(rx: number, ry: number): readonly OverworldFeatureDefinition[] {
  return OVERWORLD_FEATURES.filter((feature) => feature.rx === rx && feature.ry === ry);
}

export function overworldFeatureSpot(
  worldSeed: number,
  feature: OverworldFeatureDefinition,
): { tx: number; ty: number } {
  if (feature.kind === 'dungeon' && feature.dungeonId) {
    const entrance = dungeonOverworldEntrance(worldSeed, feature.dungeonId);
    return { tx: entrance.tx, ty: entrance.ty };
  }
  const margin = 14;
  const span = RESOURCE_REGION_SIZE - margin * 2;
  const hash = hashText32(`overworld-feature:${worldSeed}:${feature.id}`);
  return {
    tx: margin + (hash % span),
    ty: margin + (((hash >>> 8) ^ Math.imul(hash, 0x45d9f3b)) >>> 0) % span,
  };
}
