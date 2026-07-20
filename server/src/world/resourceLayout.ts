import type { RegionResourceProfile } from './regionResourceProfiles.js';
import { overworldFeaturesAt, overworldFeatureSpot } from './worldFeatureLayout.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from './worldDimensions.js';

export { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from './worldDimensions.js';

export const RESOURCE_LAYOUT_VERSION = 1;

export const RESOURCE_KINDS = ['tree', 'iron', 'crystal', 'shroom'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type ResourceTool = 'axe' | 'pickaxe' | null;

export interface WorldResourceNodeDefinition {
  id: string;
  worldSeed: number;
  rx: number;
  ry: number;
  kind: ResourceKind;
  ordinal: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  tool: ResourceTool;
  yieldMin: number;
  yieldMax: number;
  respawnSeconds: number;
}

const BASE_COUNTS: Record<ResourceKind, number> = {
  tree: 22,
  iron: 6,
  crystal: 5,
  shroom: 7,
};

const MAX_COUNTS: Record<ResourceKind, number> = {
  tree: 44,
  iron: 18,
  crystal: 18,
  shroom: 22,
};

const RESOURCE_CENTER_CLEARANCE = 24;

const KIND_SALT: Record<ResourceKind, number> = {
  tree: 0x71eecafe,
  iron: 0x1a0f1a0f,
  crystal: 0xc7a57a1,
  shroom: 0x5a700005,
};

function mix32(value: number): number {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function seedFor(worldSeed: number, rx: number, ry: number, salt: number): number {
  return mix32(worldSeed ^ Math.imul(rx + 97, 0x9e3779b1) ^ Math.imul(ry - 211, 0x85ebca6b) ^ salt);
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scaleFor(kind: ResourceKind, profile: RegionResourceProfile): number {
  if (kind === 'tree') return profile.treeScale;
  if (kind === 'iron') return profile.ironScale;
  if (kind === 'crystal') return profile.crystalScale;
  return profile.shroomScale;
}

export function resourceNodeCount(kind: ResourceKind, profile: RegionResourceProfile): number {
  const riskBoost = Math.sqrt(profile.resourceMultiplier);
  return Math.max(2, Math.min(MAX_COUNTS[kind], Math.round(BASE_COUNTS[kind] * scaleFor(kind, profile) * riskBoost)));
}

export function resourceNodeId(worldSeed: number, rx: number, ry: number, kind: ResourceKind, ordinal: number): string {
  return `res${RESOURCE_LAYOUT_VERSION}:${worldSeed}:${rx}:${ry}:${kind}:${ordinal}`;
}

export function parseResourceNodeId(value: string): Pick<WorldResourceNodeDefinition, 'worldSeed' | 'rx' | 'ry' | 'kind' | 'ordinal'> | null {
  const match = /^res(\d+):(-?\d+):(-?\d+):(-?\d+):(tree|iron|crystal|shroom):(\d+)$/.exec(value);
  if (!match || Number(match[1]) !== RESOURCE_LAYOUT_VERSION) return null;
  const worldSeed = Number(match[2]);
  const rx = Number(match[3]);
  const ry = Number(match[4]);
  const ordinal = Number(match[6]);
  if (![worldSeed, rx, ry, ordinal].every(Number.isSafeInteger) || ordinal < 0) return null;
  return { worldSeed, rx, ry, kind: match[5] as ResourceKind, ordinal };
}

function nodeEconomy(kind: ResourceKind): Pick<WorldResourceNodeDefinition, 'tool' | 'yieldMin' | 'yieldMax' | 'respawnSeconds'> {
  switch (kind) {
    case 'tree': return { tool: 'axe', yieldMin: 2, yieldMax: 4, respawnSeconds: 10 * 60 };
    case 'iron': return { tool: 'pickaxe', yieldMin: 1, yieldMax: 3, respawnSeconds: 12 * 60 };
    case 'crystal': return { tool: null, yieldMin: 1, yieldMax: 2, respawnSeconds: 15 * 60 };
    case 'shroom': return { tool: null, yieldMin: 1, yieldMax: 1, respawnSeconds: 5 * 60 };
  }
}

/**
 * Canonical resource layout shared by the browser and the server. The client
 * carves these positions into the generated visual region; the server derives
 * the exact same IDs and coordinates without trusting a client-supplied node.
 */
export function generateRegionResourceNodes(
  worldSeed: number,
  rx: number,
  ry: number,
  profile: RegionResourceProfile,
): WorldResourceNodeDefinition[] {
  const nodes: WorldResourceNodeDefinition[] = [];
  const occupied: Array<{ tx: number; ty: number }> = [];
  const border = 10;
  const featureSpots = overworldFeaturesAt(rx, ry).map((feature) => overworldFeatureSpot(worldSeed, feature));
  const outsideFeatureClearance = (tx: number, ty: number): boolean =>
    featureSpots.every((spot) => Math.hypot(tx - spot.tx, ty - spot.ty) >= 8);

  for (const kind of RESOURCE_KINDS) {
    const count = resourceNodeCount(kind, profile);
    const rand = mulberry32(seedFor(worldSeed, rx, ry, KIND_SALT[kind]));
    for (let ordinal = 0; ordinal < count; ordinal++) {
      let tx = border;
      let ty = border;
      let accepted = false;
      for (let attempt = 0; attempt < 160; attempt++) {
        tx = border + Math.floor(rand() * (RESOURCE_REGION_SIZE - border * 2));
        ty = border + Math.floor(rand() * (RESOURCE_REGION_SIZE - border * 2));
        const minDistance = kind === 'tree' ? 3 : 4;
        const outsideSafeSpawn = Math.max(
          Math.abs(tx - Math.floor(RESOURCE_REGION_SIZE / 2)),
          Math.abs(ty - Math.floor(RESOURCE_REGION_SIZE / 2)),
        ) >= RESOURCE_CENTER_CLEARANCE;
        if (outsideSafeSpawn && outsideFeatureClearance(tx, ty) && occupied.every((spot) => Math.max(Math.abs(spot.tx - tx), Math.abs(spot.ty - ty)) >= minDistance)) {
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        // Deterministic exhaustive fallback. It preserves the same separation
        // and safe-spawn invariants even if future density caps are increased.
        const span = RESOURCE_REGION_SIZE - border * 2;
        const start = ((ordinal * 17 + KIND_SALT[kind]) >>> 0) % (span * span);
        for (let scan = 0; scan < span * span; scan++) {
          const index = (start + scan * 7919) % (span * span);
          tx = border + (index % span);
          ty = border + Math.floor(index / span);
          const minDistance = kind === 'tree' ? 3 : 4;
          const outsideSafeSpawn = Math.max(
            Math.abs(tx - Math.floor(RESOURCE_REGION_SIZE / 2)),
            Math.abs(ty - Math.floor(RESOURCE_REGION_SIZE / 2)),
          ) >= RESOURCE_CENTER_CLEARANCE;
          if (outsideSafeSpawn && outsideFeatureClearance(tx, ty) && occupied.every((spot) => Math.max(Math.abs(spot.tx - tx), Math.abs(spot.ty - ty)) >= minDistance)) {
            accepted = true;
            break;
          }
        }
      }
      if (!accepted) throw new Error(`Unable to place canonical ${kind} resource node`);
      occupied.push({ tx, ty });
      nodes.push({
        id: resourceNodeId(worldSeed, rx, ry, kind, ordinal),
        worldSeed,
        rx,
        ry,
        kind,
        ordinal,
        tx,
        ty,
        x: (tx + 0.5) * RESOURCE_TILE_SIZE,
        y: (ty + 1) * RESOURCE_TILE_SIZE - 2,
        ...nodeEconomy(kind),
      });
    }
  }
  return nodes;
}
