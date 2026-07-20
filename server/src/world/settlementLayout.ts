import { RESOURCE_TILE_SIZE } from './resourceLayout.js';
import { SAFE_SPAWN_TILE } from './landLocations.js';
import { hashText32 } from './layoutRandom.js';
import type { ResourceLandId } from './regionResourceProfiles.js';

export type SettlementCrop = 'glowshroom' | 'caveberry';
export type SettlementAnimalKind =
  | 'cow' | 'chicken' | 'black_goat' | 'moth_deer' | 'red_deer' | 'wild_boar'
  | 'tapir' | 'capybara' | 'reindeer' | 'musk_ox' | 'camel' | 'gazelle'
  | 'shore_goat' | 'reef_turtle';

export type SettlementBuildingRole =
  | 'residential-small'
  | 'residential-medium'
  | 'residential-luxury'
  | 'quest-house'
  | 'shop'
  | 'market-hall'
  | 'cafe'
  | 'office'
  | 'guild-hall'
  | 'civic'
  | 'workshop';

export type SettlementBuildingStyle = 'timber' | 'stone' | 'plaster' | 'brick' | 'canal' | 'garden' | 'mercantile';
export type SettlementArchitectureTheme =
  | 'witch-crooked'
  | 'green-homestead'
  | 'rainforest-stilt'
  | 'frost-steep'
  | 'desert-courtyard'
  | 'cinder-industrial';

export interface SettlementLocation {
  id: string;
  landId: ResourceLandId;
  rx: number;
  ry: number;
  farming: boolean;
  name: string;
  kind: 'capital' | 'town' | 'outpost' | 'hidden';
}

const SETTLEMENTS: readonly SettlementLocation[] = Object.freeze([
  { id: 'morrowfen', name: 'Morrowfen', landId: 'witchlands', rx: -4, ry: -3, farming: true, kind: 'capital' },
  { id: 'crow-rest', name: "Crow's Rest", landId: 'witchlands', rx: -5, ry: -2, farming: false, kind: 'town' },
  { id: 'bog-lantern', name: 'Bog Lantern', landId: 'witchlands', rx: -3, ry: -3, farming: false, kind: 'town' },
  { id: 'thorn-vigil', name: 'Thorn Vigil', landId: 'witchlands', rx: -4, ry: -4, farming: false, kind: 'outpost' },
  { id: 'veil-hollow', name: 'Veil Hollow', landId: 'witchlands', rx: -5, ry: -5, farming: false, kind: 'hidden' },
  { id: 'evergrove', name: 'Evergrove', landId: 'green-land', rx: 0, ry: 0, farming: true, kind: 'capital' },
  { id: 'millhaven', name: 'Millhaven', landId: 'green-land', rx: -1, ry: 0, farming: true, kind: 'town' },
  { id: 'rivercross', name: 'Rivercross', landId: 'green-land', rx: 1, ry: 0, farming: false, kind: 'town' },
  { id: 'hunters-rest', name: "Hunter's Rest", landId: 'green-land', rx: 0, ry: -1, farming: false, kind: 'outpost' },
  { id: 'rootcellar', name: 'The Rootcellar', landId: 'green-land', rx: -1, ry: -2, farming: false, kind: 'hidden' },
  { id: 'canopy-crown', name: 'Canopy Crown', landId: 'rainforest', rx: 4, ry: -3, farming: true, kind: 'capital' },
  { id: 'orchid-step', name: 'Orchid Step', landId: 'rainforest', rx: 3, ry: -3, farming: false, kind: 'town' },
  { id: 'river-teeth', name: 'River Teeth', landId: 'rainforest', rx: 5, ry: -2, farming: false, kind: 'town' },
  { id: 'monsoon-watch', name: 'Monsoon Watch', landId: 'rainforest', rx: 4, ry: -4, farming: false, kind: 'outpost' },
  { id: 'waterfall-den', name: 'Waterfall Den', landId: 'rainforest', rx: 5, ry: -5, farming: false, kind: 'hidden' },
  { id: 'frosthold', name: 'Frosthold', landId: 'frostlands', rx: -4, ry: 3, farming: true, kind: 'capital' },
  { id: 'white-pine', name: 'White Pine', landId: 'frostlands', rx: -5, ry: 2, farming: false, kind: 'town' },
  { id: 'glass-lake', name: 'Glass Lake', landId: 'frostlands', rx: -3, ry: 3, farming: false, kind: 'town' },
  { id: 'aurora-post', name: 'Aurora Post', landId: 'frostlands', rx: -4, ry: 4, farming: false, kind: 'outpost' },
  { id: 'underice', name: 'Underice', landId: 'frostlands', rx: -5, ry: 5, farming: false, kind: 'hidden' },
  { id: 'solspire', name: 'Solspire', landId: 'sunscorched-desert', rx: 0, ry: 4, farming: true, kind: 'capital' },
  { id: 'salt-meridian', name: 'Salt Meridian', landId: 'sunscorched-desert', rx: -1, ry: 3, farming: false, kind: 'town' },
  { id: 'oasis-nine', name: 'Oasis Nine', landId: 'sunscorched-desert', rx: 1, ry: 4, farming: false, kind: 'town' },
  { id: 'sunward-post', name: 'Sunward Post', landId: 'sunscorched-desert', rx: 0, ry: 5, farming: false, kind: 'outpost' },
  { id: 'buried-cistern', name: 'Buried Cistern', landId: 'sunscorched-desert', rx: 1, ry: 2, farming: false, kind: 'hidden' },
  { id: 'emberport', name: 'Emberport', landId: 'cinder-coast', rx: 4, ry: 3, farming: true, kind: 'capital' },
  { id: 'wreckward', name: 'Wreckward', landId: 'cinder-coast', rx: 3, ry: 3, farming: false, kind: 'town' },
  { id: 'smoke-tide', name: 'Smoke Tide', landId: 'cinder-coast', rx: 5, ry: 2, farming: false, kind: 'town' },
  { id: 'caldera-watch', name: 'Caldera Watch', landId: 'cinder-coast', rx: 4, ry: 4, farming: false, kind: 'outpost' },
  { id: 'dead-reckoning', name: 'Dead Reckoning', landId: 'cinder-coast', rx: 5, ry: 5, farming: false, kind: 'hidden' },
]);

const SETTLEMENT_BY_REGION = new Map(SETTLEMENTS.map((settlement) => [`${settlement.rx},${settlement.ry}`, settlement]));
const SETTLEMENT_BY_ID = new Map(SETTLEMENTS.map((settlement) => [settlement.id, settlement]));

const LAND_ANIMALS: Readonly<Record<ResourceLandId, readonly SettlementAnimalKind[]>> = Object.freeze({
  witchlands: ['black_goat', 'black_goat', 'moth_deer', 'chicken', 'chicken'],
  'green-land': ['cow', 'cow', 'chicken', 'chicken', 'red_deer'],
  rainforest: ['tapir', 'tapir', 'capybara', 'capybara', 'chicken'],
  frostlands: ['reindeer', 'reindeer', 'musk_ox', 'chicken', 'chicken'],
  'sunscorched-desert': ['camel', 'camel', 'gazelle', 'gazelle', 'chicken'],
  'cinder-coast': ['shore_goat', 'shore_goat', 'reef_turtle', 'chicken', 'chicken'],
});

export interface SettlementFarmDefinition {
  id: string;
  rx: number;
  ry: number;
  ordinal: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  crop: SettlementCrop;
  growMs: number;
  yieldMin: number;
  yieldMax: number;
}

export interface SettlementAnimalDefinition {
  id: string;
  rx: number;
  ry: number;
  ordinal: number;
  kind: SettlementAnimalKind;
  x: number;
  y: number;
  readyMs: number;
  rewardItem: 'currency.crystal' | 'consumable.shroom';
  rewardAmount: number;
}

export function settlementAt(rx: number, ry: number): SettlementLocation | undefined {
  return SETTLEMENT_BY_REGION.get(`${rx},${ry}`);
}

export function settlementById(id: string): SettlementLocation | undefined {
  return SETTLEMENT_BY_ID.get(id);
}

export function allSettlements(): readonly SettlementLocation[] {
  return SETTLEMENTS;
}

export function publicSettlements(): readonly SettlementLocation[] {
  return SETTLEMENTS.filter((settlement) => settlement.kind !== 'hidden');
}

export function settlementFarmPlots(rx: number, ry: number): SettlementFarmDefinition[] {
  const settlement = settlementAt(rx, ry);
  if (!settlement?.farming) return [];
  const offsets = [-4, -2, 0, 2, 4];
  return offsets.map((offset, ordinal) => {
    const tx = SAFE_SPAWN_TILE + offset;
    const ty = SAFE_SPAWN_TILE + 5;
    const crop: SettlementCrop = ordinal < 3 ? 'glowshroom' : 'caveberry';
    return {
      id: `farm:v1:${rx}:${ry}:${ordinal}`,
      rx, ry, ordinal, tx, ty,
      x: (tx + 0.5) * RESOURCE_TILE_SIZE,
      y: (ty + 0.5) * RESOURCE_TILE_SIZE,
      crop,
      growMs: crop === 'glowshroom' ? 75_000 : 90_000,
      yieldMin: crop === 'glowshroom' ? 3 : 1,
      yieldMax: crop === 'glowshroom' ? 3 : 2,
    };
  });
}

function animalProduction(kind: SettlementAnimalKind): Pick<SettlementAnimalDefinition, 'readyMs' | 'rewardItem' | 'rewardAmount'> {
  if (kind === 'chicken') return { readyMs: 35_000, rewardItem: 'consumable.shroom', rewardAmount: 2 };
  const high = kind === 'musk_ox' || kind === 'reef_turtle' ? 4 : kind === 'moth_deer' || kind === 'red_deer' || kind === 'reindeer' || kind === 'camel' ? 3 : 2;
  return { readyMs: 45_000 + high * 10_000, rewardItem: 'currency.crystal', rewardAmount: high };
}

export function settlementAnimals(rx: number, ry: number): SettlementAnimalDefinition[] {
  const settlement = settlementAt(rx, ry);
  if (!settlement) return [];
  const offsets = [[-5, -3], [-2, -4], [2, -4], [5, -3], [0, -6]] as const;
  return LAND_ANIMALS[settlement.landId].map((kind, ordinal) => {
    const [ox, oy] = offsets[ordinal];
    return {
      id: `animal:v1:${rx}:${ry}:${ordinal}`,
      rx, ry, ordinal, kind,
      x: (SAFE_SPAWN_TILE + ox + 0.5) * RESOURCE_TILE_SIZE,
      y: (SAFE_SPAWN_TILE + oy + 0.5) * RESOURCE_TILE_SIZE,
      ...animalProduction(kind),
    };
  });
}

export const SETTLEMENT_COUNT = SETTLEMENTS.length;
export type SettlementHouseDoorSide = 'n' | 's' | 'e' | 'w';

export interface SettlementHouseDefinition {
  id: string;
  ordinal: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  doorTx: number;
  doorTy: number;
  doorSide: SettlementHouseDoorSide;
  role?: SettlementBuildingRole;
  style?: SettlementBuildingStyle;
  storeys?: number;
  enterable?: boolean;
  questId?: string;
  name?: string;
  landId?: ResourceLandId;
  settlementId?: string;
  architecture?: SettlementArchitectureTheme;
  districtVariant?: number;
}

interface HouseSlot {
  dx0: number;
  dy0: number;
  dx1: number;
  dy1: number;
  doorSide: SettlementHouseDoorSide;
  role: SettlementBuildingRole;
  large?: boolean;
}

/** Capital composition: four visually dominant public buildings around a
 * clear plaza, plus four modest homes/shops. This keeps each land capital
 * readable as a town instead of filling the entire region with city blocks. */
const CAPITAL_SLOTS: readonly HouseSlot[] = Object.freeze([
  { dx0: -7, dy0: -18, dx1: 7, dy1: -10, doorSide: 's', role: 'guild-hall', large: true },
  { dx0: -18, dy0: -7, dx1: -10, dy1: 6, doorSide: 'e', role: 'civic', large: true },
  { dx0: 10, dy0: -7, dx1: 18, dy1: 6, doorSide: 'w', role: 'market-hall', large: true },
  { dx0: -7, dy0: 10, dx1: 7, dy1: 18, doorSide: 'n', role: 'quest-house', large: true },
  { dx0: -18, dy0: -17, dx1: -11, dy1: -11, doorSide: 'e', role: 'residential-small' },
  { dx0: 11, dy0: -17, dx1: 18, dy1: -11, doorSide: 'w', role: 'workshop' },
  { dx0: -18, dy0: 9, dx1: -11, dy1: 15, doorSide: 'e', role: 'residential-medium' },
  { dx0: 11, dy0: 9, dx1: 18, dy1: 15, doorSide: 'w', role: 'shop' },
]);

const TOWN_SLOTS: readonly HouseSlot[] = Object.freeze([
  { dx0: -16, dy0: -10, dx1: -8, dy1: -4, doorSide: 'e', role: 'residential-medium' },
  { dx0: 8, dy0: -10, dx1: 16, dy1: -4, doorSide: 'w', role: 'shop' },
  { dx0: -5, dy0: -16, dx1: 5, dy1: -10, doorSide: 's', role: 'guild-hall', large: true },
  { dx0: -16, dy0: 2, dx1: -8, dy1: 8, doorSide: 'e', role: 'residential-small' },
  { dx0: 8, dy0: 2, dx1: 16, dy1: 8, doorSide: 'w', role: 'workshop' },
  { dx0: -4, dy0: 8, dx1: 4, dy1: 14, doorSide: 'n', role: 'residential-small' },
]);

const LAND_STYLES: Readonly<Record<ResourceLandId, readonly SettlementBuildingStyle[]>> = Object.freeze({
  witchlands: ['timber', 'stone', 'timber', 'plaster'],
  'green-land': ['garden', 'timber', 'plaster', 'stone'],
  rainforest: ['canal', 'garden', 'timber', 'stone'],
  frostlands: ['stone', 'plaster', 'timber', 'stone'],
  'sunscorched-desert': ['stone', 'plaster', 'mercantile', 'stone'],
  'cinder-coast': ['brick', 'mercantile', 'timber', 'stone'],
});


const LAND_ARCHITECTURE: Readonly<Record<ResourceLandId, SettlementArchitectureTheme>> = Object.freeze({
  witchlands: 'witch-crooked',
  'green-land': 'green-homestead',
  rainforest: 'rainforest-stilt',
  frostlands: 'frost-steep',
  'sunscorched-desert': 'desert-courtyard',
  'cinder-coast': 'cinder-industrial',
});

function districtVariantFor(settlement: SettlementLocation, worldSeed: number): number {
  return hashText32(`settlement-district:v1:${worldSeed}:${settlement.id}`) % 5;
}

function styleFor(settlement: SettlementLocation, ordinal: number, worldSeed: number): SettlementBuildingStyle {
  const styles = LAND_STYLES[settlement.landId];
  const hash = hashText32(`settlement-style:v2:${worldSeed}:${settlement.id}:${ordinal}`);
  return styles[hash % styles.length];
}

function slotsFor(settlement: SettlementLocation, worldSeed: number): readonly HouseSlot[] {
  if (settlement.kind === 'capital') return CAPITAL_SLOTS;
  const desired = settlement.kind === 'town' ? 5 : settlement.kind === 'outpost' ? 4 : 3;
  return TOWN_SLOTS
    .map((slot, ordinal) => ({ slot, ordinal, score: hashText32(`settlement-slots:v3:${worldSeed}:${settlement.id}:${ordinal}`) }))
    .sort((a, b) => a.score - b.score || a.ordinal - b.ordinal)
    .slice(0, desired)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((entry) => entry.slot);
}

export function settlementHouses(rx: number, ry: number, worldSeed = 0): SettlementHouseDefinition[] {
  const settlement = settlementAt(rx, ry);
  if (!settlement) return [];
  const c = SAFE_SPAWN_TILE;
  const districtVariant = districtVariantFor(settlement, worldSeed);
  return slotsFor(settlement, worldSeed).map((slot, ordinal) => {
    const x0 = c + slot.dx0;
    const y0 = c + slot.dy0;
    const x1 = c + slot.dx1;
    const y1 = c + slot.dy1;
    const doorTx = slot.doorSide === 'w' ? x0 : slot.doorSide === 'e' ? x1 : Math.floor((x0 + x1) / 2);
    const doorTy = slot.doorSide === 'n' ? y0 : slot.doorSide === 's' ? y1 : Math.floor((y0 + y1) / 2);
    const role = slot.role;
    const storeys = slot.large ? (role === 'market-hall' ? 2 : 3) : role === 'residential-small' ? 1 : 2;
    return {
      id: `house:v2:${worldSeed}:${rx}:${ry}:${ordinal}`,
      ordinal,
      x0, y0, x1, y1, doorTx, doorTy, doorSide: slot.doorSide,
      role,
      style: styleFor(settlement, ordinal, worldSeed),
      storeys,
      enterable: true,
      questId: role === 'quest-house' ? `settlement-story:${settlement.id}` : undefined,
      name: role === 'quest-house' ? `${settlement.name} Story House` : undefined,
      landId: settlement.landId,
      settlementId: settlement.id,
      architecture: LAND_ARCHITECTURE[settlement.landId],
      districtVariant,
    };
  });
}
