export type LandId =
  | 'witchlands'
  | 'green-land'
  | 'rainforest'
  | 'frostlands'
  | 'sunscorched-desert'
  | 'cinder-coast';

export type RiskTier = 'sanctuary' | 'frontier' | 'fracture' | 'lost';
export type SettlementKind = 'capital' | 'town' | 'outpost' | 'hidden';
export type PvpMode = 'disabled' | 'conditional' | 'open' | 'full-loot';
export type ItemLossRule = 'none' | 'supplies' | 'partial' | 'full';
export type FeatureKind =
  | 'dungeon'
  | 'red-gate'
  | 'black-gate'
  | 'black-market-route'
  | 'world-boss'
  | 'resource-site';

export interface WorldCoordinate {
  rx: number;
  ry: number;
}

export interface SettlementDefinition extends WorldCoordinate {
  id: string;
  name: string;
  kind: SettlementKind;
  specialty: string;
  public: boolean;
}

export interface RegionFeature extends WorldCoordinate {
  id: string;
  kind: FeatureKind;
  name: string;
  description: string;
  dungeonId?: string;
}

export interface WildlifeDefinition {
  passive: readonly string[];
  predators: readonly string[];
  apex: readonly string[];
  legendary: string;
}

export interface LandGenerationProfile {
  visualLayer: number;
  fillChance: number;
  treeScale: number;
  waterScale: number;
  crystalScale: number;
  ironScale: number;
  shroomScale: number;
  enemyScale: number;
  ambushScale: number;
  climateHazard: string;
}

export interface LandDefinition {
  id: LandId;
  name: string;
  epithet: string;
  anchor: WorldCoordinate;
  capital: SettlementDefinition;
  settlements: readonly SettlementDefinition[];
  features: readonly RegionFeature[];
  wildlife: WildlifeDefinition;
  resources: readonly string[];
  architecture: string;
  weather: string;
  generation: LandGenerationProfile;
  dungeonIds: readonly string[];
}

export interface ZoneRules {
  riskTier: RiskTier;
  displayName: string;
  warningColor: 'green' | 'amber' | 'red' | 'black';
  pvpMode: PvpMode;
  itemLoss: ItemLossRule;
  showPlayerCount: boolean;
  allowFastTravel: boolean;
  resourceMultiplier: number;
  enemyMultiplier: number;
  environmentalPressure: number;
}

export interface RegionProfile extends WorldCoordinate {
  key: string;
  landId: LandId;
  landName: string;
  regionName: string;
  districtName: string;
  riskTier: RiskTier;
  rules: ZoneRules;
  settlement?: SettlementDefinition;
  features: readonly RegionFeature[];
  visualLayer: number;
  generation: LandGenerationProfile;
  wildlife: WildlifeDefinition;
  discoveredByDefault: boolean;
}
