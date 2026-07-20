// World data model: the Tile enum and every world/region/prop interface.
import type { AnimalKind, WeaponId, CropId } from '../config';
import type { RegionProfile } from '../overworld/types';
import type { WorldResourceNodeDefinition } from '../../server/src/world/resourceLayout';
import type { DungeonHazard } from '../../server/src/dungeon/topology';
import type { SettlementHouseDefinition } from '../../server/src/world/settlementLayout';

export type EdgeDir = 'n' | 's' | 'e' | 'w';

export enum Tile {
  Rock = 0,
  Floor = 1,
  Water = 2,
  Glowshroom = 3, // light source pickup
  Crystal = 4, // loot
  Exit = 5, // hatch down
  Entrance = 6,
  Brick = 7, // ruin walls — solid, man-made
  Farmland = 8, // tilled soil — plantable, see FarmPlot
  IronOre = 9, // mineable, needs a pickaxe — see game.ts mineIronOre
}

export interface FarmPlot {
  id?: string;
  serverOwned?: boolean;
  plantedAt?: string | null;
  readyAt?: string | null;
  growMs?: number;
  tx: number;
  ty: number;
  crop: CropId; // assigned once, when the plot is carved (see carveFarmPlots)
  stage: 0 | 1 | 2 | 3; // 0 empty/tilled, 1 sprout, 2 budding, 3 ripe (harvestable)
  timer: number; // seconds until the next stage; unused while stage is 0 or 3
}

export interface NpcSpawn {
  id?: string;
  serverOwned?: boolean;
  role?: 'merchant' | 'archivist' | 'scout';
  name?: string;
  behavior?: 'stationary' | 'patrol';
  kind: 'shopkeeper' | 'wanderer';
  x: number; // px
  y: number;
  wanderRadius: number; // px, 0 = stands still
}

export interface AnimalSpawn {
  id?: string;
  serverOwned?: boolean;
  readyAt?: string | null;
  kind: AnimalKind;
  x: number; // px
  y: number;
  wanderRadius: number;
}

export interface TownBounds {
  x0: number; // tile coords, inclusive
  y0: number;
  x1: number;
  y1: number;
}

export type WorldPortalKind = 'dungeon' | 'black-market' | 'market-exit' | 'red-gate' | 'black-gate';

export interface WorldPortal {
  id: string;
  kind: WorldPortalKind;
  name: string;
  description: string;
  x: number; // px, center
  y: number; // px, feet/base
  dungeonId?: string;
}

export type RectBounds = TownBounds; // same shape, reused for farmBounds below

export type PropKind =
  | 'stalagmite'
  | 'rock'
  | 'bones'
  | 'skull'
  | 'rubble'
  | 'root'
  | 'shrooms'
  | 'pillar'
  | 'brokenPillar'
  | 'bigCrystal'
  | 'statue'
  | 'tree'
  | 'ancientTree'
  | 'pineTree'
  | 'boulder'
  | 'cliffOutcrop'
  | 'flowerPatch'
  | 'reedCluster'
  | 'stump' // remains where a harvested canonical tree stood
  | 'cairn'
  | 'lanternPost'
  | 'shrub'
  | 'townWell'
  | 'marketStall'
  | 'handCart'
  | 'townBench'
  | 'flowerPlanter'
  | 'wallSection'
  | 'wallTower'
  | 'gatehouse'
  | 'keep'
  | 'bridge'
  | 'dock'
  | 'roadMarker'
  | 'monument'
  | 'ruinedTower'
  | 'cityFountain'
  | 'clockTower'
  | 'parkGazebo'
  | 'lighthouse'
  | 'cafeTerrace'
  | 'dungeonPillar'
  | 'dungeonBrazier'
  | 'dungeonRubble';

export interface Prop {
  kind: PropKind;
  x: number; // px, base center
  y: number; // px, base line (feet)
  seed: number;
  length?: number; // world units for modular walls, bridges, docks, and gates
  rotationY?: number; // optional authored orientation for composed scenery
  resourceNodeId?: string;
}

export interface WorldResourceNode extends WorldResourceNodeDefinition {
  available: boolean;
  availableAt: string | null;
}

export interface WorldMiningNode {
  id: string;
  kind: 'iron_vein' | 'crystal_geode' | 'ancient_seam';
  tx: number;
  ty: number;
  x: number;
  y: number;
  maxIntegrity: number;
  integrity: number;
  available: boolean;
  availableAt: string | null;
  extractionCount: number;
}

export interface Chest {
  id?: string;
  x: number;
  y: number;
  opened: boolean;
  serverOwned?: boolean;
  availableAt?: string | null;
}

export interface World {
  layer: number; // dungeon floor; surface worlds use 1 and carry a RegionProfile
  visualLayer?: number; // temporary art/shader palette until final biome assets land
  dangerLevel?: number; // normalized content difficulty input for surface regions
  region?: { rx: number; ry: number }; // set only for surface overworld regions — see generateRegion()
  profile?: RegionProfile;
  w: number;
  h: number;
  tiles: Uint8Array;
  floorVariant: Uint8Array; // 0..3 per tile
  props: Prop[];
  weaponSpots: { x: number; y: number; weapon: WeaponId }[]; // px positions
  chests: Chest[]; // one per ruin — see carveRuins / game.ts openChest
  farmPlots: FarmPlot[]; // crop farm — see carveFarmPlots
  npcSpawns: NpcSpawn[]; // town residents — only populated on layer 1
  animalSpawns: AnimalSpawn[]; // settlement livestock/wildlife staging
  portals: WorldPortal[]; // dungeon, danger-route, and Black Market entry points
  resourceNodes: WorldResourceNode[]; // canonical shared overworld nodes; empty in dungeons/market
  miningNodes: WorldMiningNode[]; // canonical multi-strike veins; mutable state comes from the server
  dungeonHazards?: DungeonHazard[]; // presentation-only projection of server-authored floor mechanics
  townBounds?: TownBounds; // safe settlement footprint
  farmBounds?: RectBounds; // the farm patch's footprint (+1 tile padding) — same safe/lit treatment as town
  houses?: SettlementHouseDefinition[]; // shared house rects — renderer draws roofs/doormats over them
  campAnchor?: { tx: number; ty: number }; // wilderness resting-spot clearing — renderer draws tent/fire over it
  pens?: RectBounds[]; // livestock pen footprints (tile coords) — renderer rings them with cosmetic fence art when the manifest provides it
  gates?: {
    edge: EdgeDir;
    tx: number;
    ty: number;
    /** the neighboring region across this gate — for the waypost signpost */
    destLandName: string;
    destRegionName: string;
  }[]; // border-gate anchors for wayposts/lights/signposts
  entrance: { x: number; y: number }; // tile coords
  exit: { x: number; y: number };
}
