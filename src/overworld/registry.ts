import type {
  FeatureKind,
  LandDefinition,
  LandId,
  RegionFeature,
  RegionProfile,
  RiskTier,
  SettlementDefinition,
  WorldCoordinate,
  ZoneRules,
} from './types';

const settlement = (
  id: string,
  name: string,
  kind: SettlementDefinition['kind'],
  specialty: string,
  rx: number,
  ry: number,
  isPublic = true,
): SettlementDefinition => ({ id, name, kind, specialty, rx, ry, public: isPublic });

const feature = (
  id: string,
  kind: FeatureKind,
  name: string,
  description: string,
  rx: number,
  ry: number,
  dungeonId?: string,
): RegionFeature => ({ id, kind, name, description, rx, ry, dungeonId });

export const LAND_DEFINITIONS: readonly LandDefinition[] = [
  {
    id: 'witchlands',
    name: 'The Witchlands',
    epithet: 'The country that remembers every curse',
    anchor: { rx: -4, ry: -3 },
    capital: settlement('morrowfen', 'Morrowfen', 'capital', 'hexcraft, antidotes, and relic appraisal', -4, -3),
    settlements: [
      settlement('crow-rest', "Crow's Rest", 'town', 'hunters and funerary crafts', -5, -2),
      settlement('bog-lantern', 'Bog Lantern', 'town', 'swamp herbs and ferries', -3, -3),
      settlement('thorn-vigil', 'Thorn Vigil', 'outpost', 'wardens and curse patrols', -4, -4),
      settlement('veil-hollow', 'Veil Hollow', 'hidden', 'forbidden rites and smugglers', -5, -5, false),
    ],
    features: [
      feature('witch-red-gate', 'red-gate', 'The Briar Breach', 'A guarded passage into the Blood Moors.', -2, -4),
      feature('witch-black-gate', 'black-gate', 'The Unspoken Door', 'A one-way threshold into a lost territory.', -1, -5),
      feature('witch-market-route', 'black-market-route', 'Gravewater Passage', 'A flooded crypt route to the Black Market.', -5, -5),
      feature('witch-dungeon-1', 'dungeon', 'Hagspire Cellars', 'A layered witch-tower dungeon.', -3, -4, 'hagspire-cellars'),
      feature('witch-dungeon-2', 'dungeon', 'The Bone Orchard', 'A root-choked ossuary beneath dead trees.', -2, -3, 'bone-orchard'),
      feature('witch-boss', 'world-boss', 'The Pale Hart', 'A legendary beast seen during moonless nights.', -2, -5),
    ],
    wildlife: {
      passive: ['marsh hare', 'black goat', 'moth deer'],
      predators: ['bog wolf', 'grave crow', 'fen adder'],
      apex: ['hex stag', 'mire hag'],
      legendary: 'The Pale Hart',
    },
    resources: ['witchwood', 'nightshade', 'bone salt', 'dark crystal'],
    architecture: 'crooked timber, black stone, hanging ward-charms',
    weather: 'cold drizzle, green fog, and sudden moonless nights',
    generation: {
      visualLayer: 3,
      fillChance: 0.46,
      treeScale: 0.72,
      waterScale: 1.55,
      crystalScale: 1.2,
      ironScale: 0.7,
      shroomScale: 1.7,
      enemyScale: 1.08,
      ambushScale: 1.25,
      climateHazard: 'curse fog',
    },
    dungeonIds: ['hagspire-cellars', 'bone-orchard'],
  },
  {
    id: 'green-land',
    name: 'Green Land',
    epithet: 'The breadbasket beneath the old canopy',
    anchor: { rx: 0, ry: 0 },
    capital: settlement('evergrove', 'Evergrove', 'capital', 'farming, carpentry, and regional trade', 0, 0),
    settlements: [
      settlement('millhaven', 'Millhaven', 'town', 'grain, livestock, and milling', -1, 0),
      settlement('rivercross', 'Rivercross', 'town', 'river trade and fishing', 1, 0),
      settlement('hunters-rest', "Hunter's Rest", 'outpost', 'tracking, bows, and leatherwork', 0, -1),
      settlement('rootcellar', 'The Rootcellar', 'hidden', 'underground barter and contraband storage', -1, -2, false),
    ],
    features: [
      feature('green-red-gate', 'red-gate', 'Broken Vale Crossing', 'The last patrolled road before the Fracture.', 0, -3),
      feature('green-black-gate', 'black-gate', 'The Root Below', 'A living root tunnel into lost territory.', 0, -4),
      feature('green-market-route', 'black-market-route', 'Mill Tunnel', 'A sealed mill race leading to the Black Market.', -1, -2),
      feature('green-dungeon-1', 'dungeon', 'Old Crown Mine', 'A multi-floor iron mine beneath the hills.', 1, -1, 'old-crown-mine'),
      feature('green-dungeon-2', 'dungeon', 'Briarhold Keep', 'A ruined keep reclaimed by thorn and beast.', -1, -1, 'briarhold-keep'),
      feature('green-boss', 'world-boss', 'The Orchard Colossus', 'An ancient walking tree awakened by overharvesting.', 1, -3),
    ],
    wildlife: {
      passive: ['rabbit', 'red deer', 'wild boar', 'pheasant'],
      predators: ['grey wolf', 'lynx', 'forest adder'],
      apex: ['great bear', 'thornback boar'],
      legendary: 'The Orchard Colossus',
    },
    resources: ['oak', 'iron', 'flax', 'healing herbs'],
    architecture: 'green timber, pale stone, waterwheels, and living hedges',
    weather: 'mild rain, clear mornings, and seasonal storms',
    generation: {
      visualLayer: 1,
      fillChance: 0.42,
      treeScale: 1.45,
      waterScale: 0.9,
      crystalScale: 0.75,
      ironScale: 1.0,
      shroomScale: 0.75,
      enemyScale: 0.92,
      ambushScale: 0.85,
      climateHazard: 'thunderstorm',
    },
    dungeonIds: ['old-crown-mine', 'briarhold-keep'],
  },
  {
    id: 'rainforest',
    name: 'Rainforest',
    epithet: 'A vertical sea of leaves and drowned stone',
    anchor: { rx: 4, ry: -3 },
    capital: settlement('canopy-crown', 'Canopy Crown', 'capital', 'rare botanicals, ropework, and river navigation', 4, -3),
    settlements: [
      settlement('orchid-step', 'Orchid Step', 'town', 'medicine and cultivated poison', 3, -3),
      settlement('river-teeth', 'River Teeth', 'town', 'canoes, fish, and crocodile hide', 5, -2),
      settlement('monsoon-watch', 'Monsoon Watch', 'outpost', 'weather scouts and ruin guides', 4, -4),
      settlement('waterfall-den', 'Waterfall Den', 'hidden', 'jungle smugglers and relic fences', 5, -5, false),
    ],
    features: [
      feature('rain-red-gate', 'red-gate', 'Predator Causeway', 'An overgrown causeway where hunting law no longer applies.', 2, -4),
      feature('rain-black-gate', 'black-gate', 'The Drowned Mouth', 'A submerged path into the deepest jungle.', 3, -5),
      feature('rain-market-route', 'black-market-route', 'Falls Behind the Falls', 'A hidden cavern route to the Black Market.', 5, -5),
      feature('rain-dungeon-1', 'dungeon', 'Sunken Temple', 'A flooded temple of rotating chambers.', 3, -4, 'sunken-temple'),
      feature('rain-dungeon-2', 'dungeon', 'Serpent Observatory', 'A vine-bound observatory above a sinkhole.', 5, -3, 'serpent-observatory'),
      feature('rain-boss', 'world-boss', 'The Emerald Maw', 'A colossal jaguar that hunts during monsoons.', 2, -5),
    ],
    wildlife: {
      passive: ['capuchin', 'tapir', 'macaw', 'tree frog'],
      predators: ['jungle cat', 'anaconda', 'crocodile'],
      apex: ['black jaguar', 'river tyrant'],
      legendary: 'The Emerald Maw',
    },
    resources: ['spirit orchid', 'venom sac', 'rainwood', 'sunken gold'],
    architecture: 'stilt settlements, rope bridges, carved basalt, and living roofs',
    weather: 'monsoon rain, heavy mist, and violent river surges',
    generation: {
      visualLayer: 2,
      fillChance: 0.43,
      treeScale: 1.75,
      waterScale: 1.85,
      crystalScale: 0.85,
      ironScale: 0.55,
      shroomScale: 1.35,
      enemyScale: 1.12,
      ambushScale: 1.35,
      climateHazard: 'monsoon flood',
    },
    dungeonIds: ['sunken-temple', 'serpent-observatory'],
  },
  {
    id: 'frostlands',
    name: 'Frostlands',
    epithet: 'The white frontier beneath a broken aurora',
    anchor: { rx: -4, ry: 3 },
    capital: settlement('frosthold', 'Frosthold', 'capital', 'furs, icecraft, and caravan protection', -4, 3),
    settlements: [
      settlement('white-pine', 'White Pine', 'town', 'timber and winter livestock', -5, 2),
      settlement('glass-lake', 'Glass Lake', 'town', 'ice fishing and crystal cutting', -3, 3),
      settlement('aurora-post', 'Aurora Post', 'outpost', 'expedition supply and rescue', -4, 4),
      settlement('underice', 'Underice', 'hidden', 'smuggling beneath the frozen lake', -5, 5, false),
    ],
    features: [
      feature('frost-red-gate', 'red-gate', 'Rimebreak Pass', 'A storm pass beyond the rescue beacons.', -2, 4),
      feature('frost-black-gate', 'black-gate', 'The Blue Scar', 'A glacial rift that swallows compasses.', -1, 5),
      feature('frost-market-route', 'black-market-route', 'Underice Run', 'A tunnel beneath the lake leading to the Black Market.', -5, 5),
      feature('frost-dungeon-1', 'dungeon', 'Aurora Vault', 'An ice dungeon built around a fallen star.', -3, 4, 'aurora-vault'),
      feature('frost-dungeon-2', 'dungeon', 'Mammoth Grave', 'A buried necropolis of ancient beasts.', -5, 4, 'mammoth-grave'),
      feature('frost-boss', 'world-boss', 'The White Silence', 'A storm-beast visible only as a shape in snow.', -2, 5),
    ],
    wildlife: {
      passive: ['snow hare', 'reindeer', 'musk ox', 'ptarmigan'],
      predators: ['ice wolf', 'snow leopard', 'winter fox'],
      apex: ['polar bear', 'frost drake'],
      legendary: 'The White Silence',
    },
    resources: ['frost ore', 'blue crystal', 'winter hide', 'star ice'],
    architecture: 'dark pine, packed stone, heated halls, and aurora glass',
    weather: 'snowfall, whiteouts, and lethal cold snaps',
    generation: {
      visualLayer: 5,
      fillChance: 0.47,
      treeScale: 0.7,
      waterScale: 0.8,
      crystalScale: 1.6,
      ironScale: 1.2,
      shroomScale: 0.45,
      enemyScale: 1.16,
      ambushScale: 1.05,
      climateHazard: 'whiteout',
    },
    dungeonIds: ['aurora-vault', 'mammoth-grave'],
  },
  {
    id: 'sunscorched-desert',
    name: 'Sunscorched Desert',
    epithet: 'A moving empire of dunes and buried roads',
    anchor: { rx: 0, ry: 4 },
    capital: settlement('solspire', 'Solspire', 'capital', 'caravans, glasswork, and relic law', 0, 4),
    settlements: [
      settlement('salt-meridian', 'Salt Meridian', 'town', 'salt, water rights, and pack animals', -1, 3),
      settlement('oasis-nine', 'Oasis Nine', 'town', 'food, medicine, and guide contracts', 1, 4),
      settlement('sunward-post', 'Sunward Post', 'outpost', 'storm warning and caravan escort', 0, 5),
      settlement('buried-cistern', 'Buried Cistern', 'hidden', 'contraband water and tomb maps', 1, 2, false),
    ],
    features: [
      feature('desert-red-gate', 'red-gate', 'The Shattered Mile', 'An abandoned caravan road controlled by raiders.', -1, 5),
      feature('desert-black-gate', 'black-gate', 'The Starless Dune', 'A dune that opens only when the sun disappears.', 1, 5),
      feature('desert-market-route', 'black-market-route', 'Cistern Drop', 'A dry well descending to the Black Market.', 1, 2),
      feature('desert-dungeon-1', 'dungeon', 'Kingless Tomb', 'A trap-filled royal tomb beneath moving sand.', -1, 4, 'kingless-tomb'),
      feature('desert-dungeon-2', 'dungeon', 'Glass Furnace', 'A buried forge still hot after centuries.', 1, 3, 'glass-furnace'),
      feature('desert-boss', 'world-boss', 'The Brass Devourer', 'A sand leviathan attracted by heavy caravans.', 0, 2),
    ],
    wildlife: {
      passive: ['desert hare', 'camel', 'sand grouse', 'gazelle'],
      predators: ['hyena', 'horned viper', 'dune scorpion'],
      apex: ['sand lion', 'tomb basilisk'],
      legendary: 'The Brass Devourer',
    },
    resources: ['sun glass', 'gold ore', 'salt bloom', 'fire crystal'],
    architecture: 'sandstone towers, shade cloth, windcatchers, and blue tile',
    weather: 'dry heat, sandstorms, and freezing nights',
    generation: {
      visualLayer: 4,
      fillChance: 0.4,
      treeScale: 0.25,
      waterScale: 0.28,
      crystalScale: 1.25,
      ironScale: 1.45,
      shroomScale: 0.25,
      enemyScale: 1.1,
      ambushScale: 0.95,
      climateHazard: 'sandstorm',
    },
    dungeonIds: ['kingless-tomb', 'glass-furnace'],
  },
  {
    id: 'cinder-coast',
    name: 'Cinder Coast',
    epithet: 'Black beaches, red water, and cities built from wrecks',
    anchor: { rx: 4, ry: 3 },
    capital: settlement('emberport', 'Emberport', 'capital', 'shipping, obsidian craft, and salvage licenses', 4, 3),
    settlements: [
      settlement('wreckward', 'Wreckward', 'town', 'shipbreaking and salvage', 3, 3),
      settlement('smoke-tide', 'Smoke Tide', 'town', 'fishing, sulfur, and hot springs', 5, 2),
      settlement('caldera-watch', 'Caldera Watch', 'outpost', 'eruption warning and fire patrol', 4, 4),
      settlement('dead-reckoning', 'Dead Reckoning', 'hidden', 'pirates, fences, and false papers', 5, 5, false),
    ],
    features: [
      feature('coast-red-gate', 'red-gate', 'Burnt Anchorage', 'A lawless harbor at the edge of volcanic waters.', 2, 4),
      feature('coast-black-gate', 'black-gate', 'The Obsidian Wake', 'A sea-rift crossed by chained wrecks.', 3, 5),
      feature('coast-market-route', 'black-market-route', 'Smuggler Hulk', 'A grounded ship hiding a Black Market lift.', 5, 5),
      feature('coast-dungeon-1', 'dungeon', 'Caldera Foundry', 'A layered forge complex inside an active volcano.', 3, 4, 'caldera-foundry'),
      feature('coast-dungeon-2', 'dungeon', 'Drowned Arsenal', 'A flooded military storehouse beneath the harbor.', 5, 3, 'drowned-arsenal'),
      feature('coast-boss', 'world-boss', 'The Ashen Leviathan', 'A sea beast armored in cooled lava.', 2, 5),
    ],
    wildlife: {
      passive: ['shore goat', 'ember gull', 'reef turtle', 'rock crab'],
      predators: ['ash lizard', 'reef shark', 'smoke eel'],
      apex: ['magma drake', 'blackfin shark'],
      legendary: 'The Ashen Leviathan',
    },
    resources: ['obsidian', 'sulfur', 'black pearl', 'volcanic crystal'],
    architecture: 'basalt, brass, ship timber, chains, and red glass',
    weather: 'ashfall, hot rain, sea fog, and volcanic lightning',
    generation: {
      visualLayer: 4,
      fillChance: 0.45,
      treeScale: 0.38,
      waterScale: 1.45,
      crystalScale: 1.55,
      ironScale: 1.2,
      shroomScale: 0.5,
      enemyScale: 1.2,
      ambushScale: 1.12,
      climateHazard: 'ashfall',
    },
    dungeonIds: ['caldera-foundry', 'drowned-arsenal'],
  },
] as const;

const LAND_BY_ID = new Map<LandId, LandDefinition>(LAND_DEFINITIONS.map((land) => [land.id, land]));

const REGION_PREFIXES: Record<LandId, readonly string[]> = {
  witchlands: ['Mourning', 'Briar', 'Hollow', 'Grave', 'Moonless', 'Whispering'],
  'green-land': ['Sunlit', 'Oak', 'River', 'Meadow', 'Thorn', 'High'],
  rainforest: ['Emerald', 'Drowned', 'Canopy', 'Monsoon', 'Orchid', 'Serpent'],
  frostlands: ['Rime', 'Aurora', 'White', 'Glass', 'Winter', 'Blue'],
  'sunscorched-desert': ['Golden', 'Salt', 'Starless', 'Burning', 'Saffron', 'Mirage'],
  'cinder-coast': ['Ashen', 'Obsidian', 'Smoke', 'Ember', 'Blackwater', 'Wrecked'],
};

const REGION_SUFFIXES: Record<LandId, readonly string[]> = {
  witchlands: ['Moor', 'Fen', 'Thicket', 'Grave', 'Hollow', 'Reach'],
  'green-land': ['Meadow', 'Wood', 'Vale', 'Crossing', 'Downs', 'Fields'],
  rainforest: ['Basin', 'Canopy', 'Falls', 'Depths', 'Reach', 'Marsh'],
  frostlands: ['Shelf', 'Pass', 'Tundra', 'Lake', 'Drift', 'Scar'],
  'sunscorched-desert': ['Dune', 'Waste', 'Mesa', 'Basin', 'March', 'Flats'],
  'cinder-coast': ['Shore', 'Caldera', 'Anchorage', 'Reef', 'Strand', 'Wake'],
};

export const ZONE_RULES: Record<RiskTier, ZoneRules> = {
  sanctuary: {
    riskTier: 'sanctuary',
    displayName: 'Sanctuary',
    warningColor: 'green',
    pvpMode: 'disabled',
    itemLoss: 'none',
    showPlayerCount: true,
    allowFastTravel: false,
    resourceMultiplier: 0.75,
    enemyMultiplier: 0,
    environmentalPressure: 0.1,
  },
  frontier: {
    riskTier: 'frontier',
    displayName: 'Frontier',
    warningColor: 'amber',
    pvpMode: 'conditional',
    itemLoss: 'supplies',
    showPlayerCount: true,
    allowFastTravel: false,
    resourceMultiplier: 1,
    enemyMultiplier: 1,
    environmentalPressure: 0.45,
  },
  fracture: {
    riskTier: 'fracture',
    displayName: 'Fracture',
    warningColor: 'red',
    pvpMode: 'open',
    itemLoss: 'partial',
    showPlayerCount: true,
    allowFastTravel: false,
    resourceMultiplier: 1.55,
    enemyMultiplier: 1.35,
    environmentalPressure: 0.75,
  },
  lost: {
    riskTier: 'lost',
    displayName: 'Lost Territory',
    warningColor: 'black',
    pvpMode: 'full-loot',
    itemLoss: 'full',
    showPlayerCount: false,
    allowFastTravel: false,
    resourceMultiplier: 2.2,
    enemyMultiplier: 1.75,
    environmentalPressure: 1,
  },
};

function hash32(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x45d9f3b) ^ Math.imul(b | 0, 0x119de1f3);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

function distanceSquared(a: WorldCoordinate, b: WorldCoordinate): number {
  return (a.rx - b.rx) ** 2 + (a.ry - b.ry) ** 2;
}

function chebyshev(a: WorldCoordinate, b: WorldCoordinate): number {
  return Math.max(Math.abs(a.rx - b.rx), Math.abs(a.ry - b.ry));
}

export function getLand(id: LandId): LandDefinition {
  const land = LAND_BY_ID.get(id);
  if (!land) throw new Error(`Unknown land: ${id}`);
  return land;
}

export function landAt(rx: number, ry: number): LandDefinition {
  // Authored points always belong to the land that defines them. This keeps
  // border settlements, danger gates, dungeons, and market routes stable
  // even when a neighbouring anchor is geometrically closer.
  for (const land of LAND_DEFINITIONS) {
    if (land.capital.rx === rx && land.capital.ry === ry) return land;
    if (land.settlements.some((item) => item.rx === rx && item.ry === ry)) return land;
    if (land.features.some((item) => item.rx === rx && item.ry === ry)) return land;
  }
  const point = { rx, ry };
  let best = LAND_DEFINITIONS[0];
  let bestDistance = distanceSquared(point, best.anchor);
  for (const land of LAND_DEFINITIONS.slice(1)) {
    const distance = distanceSquared(point, land.anchor);
    if (distance < bestDistance) {
      best = land;
      bestDistance = distance;
    }
  }
  return best;
}

export function settlementAt(rx: number, ry: number): SettlementDefinition | undefined {
  for (const land of LAND_DEFINITIONS) {
    if (land.capital.rx === rx && land.capital.ry === ry) return land.capital;
    const found = land.settlements.find((item) => item.rx === rx && item.ry === ry);
    if (found) return found;
  }
  return undefined;
}

export function featuresAt(rx: number, ry: number): readonly RegionFeature[] {
  const result: RegionFeature[] = [];
  for (const land of LAND_DEFINITIONS) {
    for (const item of land.features) if (item.rx === rx && item.ry === ry) result.push(item);
  }
  return result;
}

export function riskTierAt(rx: number, ry: number): RiskTier {
  const settlement = settlementAt(rx, ry);
  if (settlement) return 'sanctuary';
  const authoredFeatures = featuresAt(rx, ry);
  if (authoredFeatures.some((item) => item.kind === 'black-gate')) return 'lost';
  if (authoredFeatures.some((item) => item.kind === 'red-gate' || item.kind === 'world-boss')) return 'fracture';
  const land = landAt(rx, ry);
  const distance = chebyshev({ rx, ry }, land.anchor);
  if (distance <= 2) return 'frontier';
  if (distance === 3) return 'fracture';
  return 'lost';
}

function proceduralRegionName(land: LandDefinition, rx: number, ry: number): string {
  const h = hash32(rx + 97, ry - 211);
  const prefixes = REGION_PREFIXES[land.id];
  const suffixes = REGION_SUFFIXES[land.id];
  return `${prefixes[h % prefixes.length]} ${suffixes[Math.floor(h / prefixes.length) % suffixes.length]}`;
}

export function regionProfileAt(rx: number, ry: number): RegionProfile {
  const land = landAt(rx, ry);
  const settlement = settlementAt(rx, ry);
  const features = featuresAt(rx, ry);
  const riskTier = riskTierAt(rx, ry);
  const regionName = settlement?.name ?? proceduralRegionName(land, rx, ry);
  const featureTitle = features.find((item) => item.kind === 'red-gate' || item.kind === 'black-gate')?.name;
  return {
    rx,
    ry,
    key: `${rx},${ry}`,
    landId: land.id,
    landName: land.name,
    regionName,
    districtName: featureTitle ?? ZONE_RULES[riskTier].displayName,
    riskTier,
    rules: ZONE_RULES[riskTier],
    settlement,
    features,
    visualLayer: land.generation.visualLayer,
    generation: land.generation,
    wildlife: land.wildlife,
    discoveredByDefault: land.id === 'green-land' && chebyshev({ rx, ry }, land.anchor) <= 1,
  };
}

export function regionsForLand(id: LandId, radius: number): RegionProfile[] {
  const rows: RegionProfile[] = [];
  for (let ry = -radius; ry <= radius; ry++) {
    for (let rx = -radius; rx <= radius; rx++) {
      const profile = regionProfileAt(rx, ry);
      if (profile.landId === id) rows.push(profile);
    }
  }
  return rows;
}

export function routeFeaturesForLand(id: LandId): { redGate: RegionFeature; blackGate: RegionFeature; blackMarket: RegionFeature } {
  const land = getLand(id);
  const redGate = land.features.find((item) => item.kind === 'red-gate');
  const blackGate = land.features.find((item) => item.kind === 'black-gate');
  const blackMarket = land.features.find((item) => item.kind === 'black-market-route');
  if (!redGate || !blackGate || !blackMarket) throw new Error(`${land.name} has an incomplete danger route`);
  return { redGate, blackGate, blackMarket };
}
