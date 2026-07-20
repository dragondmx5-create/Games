import { generateRegionResourceNodes, RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from './resourceLayout.js';
import { generateCanonicalOverworldTopology, isCanonicalOverworldTileWalkable } from './overworldTopology.js';
import { regionResourceProfileAt } from './regionResourceProfiles.js';

export const MINING_LAYOUT_VERSION = 1;
export const MINING_KINDS = ['iron_vein', 'crystal_geode', 'ancient_seam'] as const;
export type MiningKind = (typeof MINING_KINDS)[number];

export interface WorldMiningNodeDefinition {
  id: string;
  worldSeed: number;
  rx: number;
  ry: number;
  kind: MiningKind;
  ordinal: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  maxIntegrity: number;
  respawnSeconds: number;
  rewardMin: number;
  rewardMax: number;
}

const KIND_SALT: Record<MiningKind, number> = {
  iron_vein: 0x31a9c2d1,
  crystal_geode: 0x53f0d3a7,
  ancient_seam: 0x77b45109,
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

function economy(kind: MiningKind): Pick<WorldMiningNodeDefinition, 'maxIntegrity' | 'respawnSeconds' | 'rewardMin' | 'rewardMax'> {
  switch (kind) {
    case 'iron_vein': return { maxIntegrity: 3, respawnSeconds: 14 * 60, rewardMin: 3, rewardMax: 6 };
    case 'crystal_geode': return { maxIntegrity: 4, respawnSeconds: 18 * 60, rewardMin: 3, rewardMax: 7 };
    case 'ancient_seam': return { maxIntegrity: 5, respawnSeconds: 24 * 60, rewardMin: 5, rewardMax: 9 };
  }
}

function kindCount(kind: MiningKind, rx: number, ry: number): number {
  const profile = regionResourceProfileAt(rx, ry);
  const risk = Math.max(1, Math.sqrt(profile.resourceMultiplier));
  const base = kind === 'iron_vein' ? 4 : kind === 'crystal_geode' ? 2 : 1;
  return Math.max(1, Math.min(kind === 'ancient_seam' ? 3 : 8, Math.round(base * risk)));
}

export function miningNodeId(worldSeed: number, rx: number, ry: number, kind: MiningKind, ordinal: number): string {
  return `mine${MINING_LAYOUT_VERSION}:${worldSeed}:${rx}:${ry}:${kind}:${ordinal}`;
}

export function parseMiningNodeId(value: string): Pick<WorldMiningNodeDefinition, 'worldSeed' | 'rx' | 'ry' | 'kind' | 'ordinal'> | null {
  const match = /^mine(\d+):(-?\d+):(-?\d+):(-?\d+):(iron_vein|crystal_geode|ancient_seam):(\d+)$/.exec(value);
  if (!match || Number(match[1]) !== MINING_LAYOUT_VERSION) return null;
  const worldSeed = Number(match[2]);
  const rx = Number(match[3]);
  const ry = Number(match[4]);
  const ordinal = Number(match[6]);
  if (![worldSeed, rx, ry, ordinal].every(Number.isSafeInteger) || ordinal < 0) return null;
  return { worldSeed, rx, ry, kind: match[5] as MiningKind, ordinal };
}

/** Deterministic server/client projection. Mutable integrity and cooldown live only in WorldMiningState. */
export function generateRegionMiningNodes(worldSeed: number, rx: number, ry: number): WorldMiningNodeDefinition[] {
  // Throws for coordinates outside the canonical world registry.
  regionResourceProfileAt(rx, ry);
  const topology = generateCanonicalOverworldTopology(worldSeed, rx, ry);
  const profile = regionResourceProfileAt(rx, ry);
  const reserved = generateRegionResourceNodes(worldSeed, rx, ry, profile).map((node) => ({ tx: node.tx, ty: node.ty }));
  const portalTiles = topology.portals.map((portal) => ({ tx: Math.floor(portal.x / RESOURCE_TILE_SIZE), ty: Math.floor(portal.y / RESOURCE_TILE_SIZE) }));
  const occupied: Array<{ tx: number; ty: number }> = [];
  const nodes: WorldMiningNodeDefinition[] = [];
  const border = 12;
  for (const kind of MINING_KINDS) {
    const count = kindCount(kind, rx, ry);
    const rand = mulberry32(mix32(worldSeed ^ Math.imul(rx + 41, 0x9e3779b1) ^ Math.imul(ry - 73, 0x85ebca6b) ^ KIND_SALT[kind]));
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      let tx = 0;
      let ty = 0;
      let accepted = false;
      for (let attempt = 0; attempt < 720; attempt += 1) {
        tx = border + Math.floor(rand() * (RESOURCE_REGION_SIZE - border * 2));
        ty = border + Math.floor(rand() * (RESOURCE_REGION_SIZE - border * 2));
        const outsideSettlement = Math.max(Math.abs(tx - RESOURCE_REGION_SIZE / 2), Math.abs(ty - RESOURCE_REGION_SIZE / 2)) >= 12;
        const openPatch = isCanonicalOverworldTileWalkable(topology, tx, ty)
          && isCanonicalOverworldTileWalkable(topology, tx + 1, ty)
          && isCanonicalOverworldTileWalkable(topology, tx - 1, ty)
          && isCanonicalOverworldTileWalkable(topology, tx, ty + 1)
          && isCanonicalOverworldTileWalkable(topology, tx, ty - 1);
        const awayFromResources = reserved.every((spot) => Math.hypot(spot.tx - tx, spot.ty - ty) >= 5);
        const awayFromPortals = portalTiles.every((spot) => Math.hypot(spot.tx - tx, spot.ty - ty) >= 8);
        if (outsideSettlement && openPatch && awayFromResources && awayFromPortals && occupied.every((spot) => Math.hypot(spot.tx - tx, spot.ty - ty) >= 7)) {
          accepted = true;
          break;
        }
      }
      if (!accepted) throw new Error(`unable to place canonical ${kind}`);
      occupied.push({ tx, ty });
      nodes.push({
        id: miningNodeId(worldSeed, rx, ry, kind, ordinal),
        worldSeed,
        rx,
        ry,
        kind,
        ordinal,
        tx,
        ty,
        x: (tx + 0.5) * RESOURCE_TILE_SIZE,
        y: (ty + 1) * RESOURCE_TILE_SIZE - 2,
        ...economy(kind),
      });
    }
  }
  return nodes;
}
