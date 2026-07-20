import { generateEnemySpawns } from '../combat/layout.js';
import { generateWorldChests } from './chestLayout.js';
import { hashText32, mulberry32 } from './layoutRandom.js';
import { OVERWORLD_FEATURES, overworldFeatureSpot, type OverworldPortalKind } from './worldFeatureLayout.js';
import { regionResourceProfileAt, type ResourceRiskTier } from './regionResourceProfiles.js';
import { generateRegionResourceNodes, RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from './resourceLayout.js';
import { settlementAnimals, settlementAt, settlementFarmPlots, settlementHouses } from './settlementLayout.js';
import { OVERWORLD_WORLD_RADIUS } from './worldBounds.js';

export const OVERWORLD_TOPOLOGY_VERSION = 4;
export { OVERWORLD_WORLD_RADIUS };
export const OVERWORLD_PLAYER_RADIUS = 5;

export const OverworldTile = Object.freeze({
  Rock: 0,
  Floor: 1,
  Water: 2,
  Glowshroom: 3,
  Crystal: 4,
  Exit: 5,
  Entrance: 6,
  Brick: 7,
  Farmland: 8,
  IronOre: 9,
} as const);

export type { OverworldPortalKind } from './worldFeatureLayout.js';

export interface CanonicalOverworldPortal {
  id: string;
  kind: OverworldPortalKind;
  name: string;
  description: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  dungeonId?: string;
}

export interface CanonicalOverworldTopology {
  version: number;
  worldSeed: number;
  rx: number;
  ry: number;
  w: number;
  h: number;
  tiles: number[];
  floorVariant: number[];
  entrance: { x: number; y: number };
  exit: { x: number; y: number };
  townBounds?: { x0: number; y0: number; x1: number; y1: number };
  farmBounds?: { x0: number; y0: number; x1: number; y1: number };
  /** a resting spot with a cleared floor patch, presentation-only (no
   * reward/authority) — only in a region with neither a settlement nor an
   * authored feature, so open wilderness never reads as totally empty. */
  campAnchor?: { tx: number; ty: number };
  portals: CanonicalOverworldPortal[];
  checksum: string;
}

/**
 * Density knobs for the open-field generator: how many scattered rock
 * outcrops and ponds a region of each land gets. The world is deliberately
 * open — travel is blocked only at region borders (gates) and by these
 * sparse natural obstacles, not by cave-style wall mazes.
 */
const LAND_TERRAIN = Object.freeze({
  witchlands: { outcrops: 26, ponds: 5 },
  'green-land': { outcrops: 18, ponds: 4 },
  rainforest: { outcrops: 16, ponds: 7 },
  frostlands: { outcrops: 30, ponds: 3 },
  'sunscorched-desert': { outcrops: 22, ponds: 1 },
  'cinder-coast': { outcrops: 28, ponds: 4 },
});



function hashCoords(seed: number, a: number, b: number): number {
  let value = (seed ^ Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca6b)) | 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

/**
 * Open-field terrain base. The interior is walkable ground with sparse,
 * organic rock outcrops and ponds as natural cover — never wall mazes.
 * Connectivity is guaranteed by construction: obstacles are small bounded
 * blobs kept away from the region center, so the floor is one open plain
 * and no largest-region flood fill is needed.
 */
function terrainBase(
  terrain: { outcrops: number; ponds: number },
  rand: () => number,
): { tiles: Uint8Array; floorVariant: Uint8Array } {
  const w = RESOURCE_REGION_SIZE;
  const h = RESOURCE_REGION_SIZE;
  const tiles = new Uint8Array(w * h).fill(OverworldTile.Floor);
  const floorVariant = new Uint8Array(w * h);
  for (let index = 0; index < tiles.length; index += 1) {
    const roll = rand();
    floorVariant[index] = roll < 0.55 ? 0 : roll < 0.72 ? 1 : roll < 0.82 ? 2 : roll < 0.9 ? 3 : roll < 0.96 ? 4 : 5;
  }

  const center = Math.floor(RESOURCE_REGION_SIZE / 2);
  const stampBlob = (tile: number, maxRadius: number): void => {
    const margin = 8;
    const cx = margin + Math.floor(rand() * (w - margin * 2));
    const cy = margin + Math.floor(rand() * (h - margin * 2));
    // keep the settlement/spawn heart of the region clear
    if (Math.hypot(cx - center, cy - center) < 24) return;
    const radius = 1 + Math.floor(rand() * maxRadius);
    // an irregular blob: a few overlapping disks rather than one circle
    const lobes = 1 + Math.floor(rand() * 3);
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const lx = cx + Math.floor((rand() - 0.5) * radius * 2);
      const ly = cy + Math.floor((rand() - 0.5) * radius * 2);
      const lr = Math.max(1, radius - lobe);
      for (let oy = -lr; oy <= lr; oy += 1) {
        for (let ox = -lr; ox <= lr; ox += 1) {
          if (ox * ox + oy * oy > lr * lr + (rand() < 0.4 ? 1 : 0)) continue;
          const x = lx + ox;
          const y = ly + oy;
          if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) continue;
          tiles[y * w + x] = tile;
        }
      }
    }
  };

  for (let i = 0; i < terrain.outcrops; i += 1) stampBlob(OverworldTile.Rock, 3);
  for (let i = 0; i < terrain.ponds; i += 1) stampBlob(OverworldTile.Water, 4);
  return { tiles, floorVariant };
}

/** floorVariant value reserved for roads/plazas — rendered as a packed dirt path. */
export const PATH_FLOOR_VARIANT = 6;
// Compatibility variants used by the renderer. The restored six-land generator
// currently authors regional roads with PATH_FLOOR_VARIANT; these reserved
// values keep presentation helpers stable for future stone/resource routes.
export const STONE_ROAD_FLOOR_VARIANT = 7;
export const RESOURCE_TRAIL_FLOOR_VARIANT = 8;
export function isPathFloorVariant(variant: number): boolean {
  return variant === PATH_FLOOR_VARIANT || variant === STONE_ROAD_FLOOR_VARIANT || variant === RESOURCE_TRAIL_FLOOR_VARIANT;
}

function carveDisk(tiles: Uint8Array, tx: number, ty: number, radius: number, tile = OverworldTile.Floor, pave?: Uint8Array): void {
  const w = RESOURCE_REGION_SIZE;
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (ox * ox + oy * oy > radius * radius) continue;
      const x = tx + ox;
      const y = ty + oy;
      if (x <= 0 || y <= 0 || x >= w - 1 || y >= w - 1) continue;
      tiles[y * w + x] = tile;
      if (pave && tile === OverworldTile.Floor) pave[y * w + x] = PATH_FLOOR_VARIANT;
    }
  }
}

function carveLine(
  tiles: Uint8Array,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius = 1,
  pave?: Uint8Array,
): void {
  let x = from.x;
  let y = from.y;
  carveDisk(tiles, x, y, radius, OverworldTile.Floor, pave);
  while (x !== to.x) {
    x += Math.sign(to.x - x);
    carveDisk(tiles, x, y, radius, OverworldTile.Floor, pave);
  }
  while (y !== to.y) {
    y += Math.sign(to.y - y);
    carveDisk(tiles, x, y, radius, OverworldTile.Floor, pave);
  }
}

function edgePosition(worldSeed: number, axis: 'vertical' | 'horizontal', a: number, b: number): number {
  const min = 12;
  const span = RESOURCE_REGION_SIZE - min * 2;
  return min + (hashCoords(worldSeed ^ (axis === 'vertical' ? 0x41b3 : 0x7c91), a, b) % span);
}

export type CanonicalOverworldEdge = 'n' | 's' | 'e' | 'w';

/** Returns the exact server-owned opening(s) on a region edge. The browser
 * imports this same function for rendering and transition prediction; world
 * presence independently validates the resulting solid tiles. */
export function canonicalOverworldGatePositions(
  worldSeed: number,
  rx: number,
  ry: number,
  edge: CanonicalOverworldEdge,
): number[] {
  if (!Number.isSafeInteger(worldSeed) || !Number.isInteger(rx) || !Number.isInteger(ry)
    || Math.abs(rx) > OVERWORLD_WORLD_RADIUS || Math.abs(ry) > OVERWORLD_WORLD_RADIUS) return [];
  if (edge === 'w') return rx <= -OVERWORLD_WORLD_RADIUS ? [] : [edgePosition(worldSeed, 'vertical', rx - 1, ry)];
  if (edge === 'e') return rx >= OVERWORLD_WORLD_RADIUS ? [] : [edgePosition(worldSeed, 'vertical', rx, ry)];
  if (edge === 'n') return ry <= -OVERWORLD_WORLD_RADIUS ? [] : [edgePosition(worldSeed, 'horizontal', rx, ry - 1)];
  return ry >= OVERWORLD_WORLD_RADIUS ? [] : [edgePosition(worldSeed, 'horizontal', rx, ry)];
}

function carveEdges(
  tiles: Uint8Array,
  floorVariant: Uint8Array,
  worldSeed: number,
  rx: number,
  ry: number,
  center: { x: number; y: number },
): void {
  const size = RESOURCE_REGION_SIZE;
  // The region border is a 2-tile treeline band; only the gates pass through.
  for (let depth = 0; depth < 2; depth += 1) {
    for (let x = 0; x < size; x += 1) {
      tiles[depth * size + x] = OverworldTile.Rock;
      tiles[(size - 1 - depth) * size + x] = OverworldTile.Rock;
    }
    for (let y = 0; y < size; y += 1) {
      tiles[y * size + depth] = OverworldTile.Rock;
      tiles[y * size + size - 1 - depth] = OverworldTile.Rock;
    }
  }
  const gates: Array<{ x: number; y: number; inside: { x: number; y: number } }> = [];
  for (const y of canonicalOverworldGatePositions(worldSeed, rx, ry, 'w')) gates.push({ x: 0, y, inside: { x: 3, y } });
  for (const y of canonicalOverworldGatePositions(worldSeed, rx, ry, 'e')) gates.push({ x: size - 1, y, inside: { x: size - 4, y } });
  for (const x of canonicalOverworldGatePositions(worldSeed, rx, ry, 'n')) gates.push({ x, y: 0, inside: { x, y: 3 } });
  for (const x of canonicalOverworldGatePositions(worldSeed, rx, ry, 's')) gates.push({ x, y: size - 1, inside: { x, y: size - 4 } });
  for (const gate of gates) {
    for (let offset = -2; offset <= 2; offset += 1) {
      if (gate.x === 0 || gate.x === size - 1) {
        for (let depth = 0; depth <= 4; depth += 1) {
          const x = gate.x === 0 ? depth : size - 1 - depth;
          const index = (gate.y + offset) * size + x;
          tiles[index] = OverworldTile.Floor;
          floorVariant[index] = PATH_FLOOR_VARIANT;
        }
      } else {
        for (let depth = 0; depth <= 4; depth += 1) {
          const y = gate.y === 0 ? depth : size - 1 - depth;
          const index = y * size + gate.x + offset;
          tiles[index] = OverworldTile.Floor;
          floorVariant[index] = PATH_FLOOR_VARIANT;
        }
      }
    }
    // a visible dirt road from every border gate to the region heart
    carveLine(tiles, gate.inside, center, 1, floorVariant);
  }
}

/**
 * A settlement is a real village now, not one walled rectangle: an open,
 * cleared green with a paved plaza at the region heart and individual
 * cottages (from the shared settlementHouses layout) whose brick walls and
 * doorways are carved here. The browser draws roofs/doors over the exact
 * same rects. Town bounds cover the whole village for safe-zone rules.
 */
function carveTown(
  tiles: Uint8Array,
  floorVariant: Uint8Array,
  center: { x: number; y: number },
  rx: number,
  ry: number,
  worldSeed: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const size = RESOURCE_REGION_SIZE;
  const halfW = 18;
  const halfH = 18;
  const x0 = center.x - halfW;
  const x1 = center.x + halfW;
  const y0 = center.y - halfH;
  const y1 = center.y + halfH;
  // clear the whole village footprint of outcrops/ponds
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) tiles[y * size + x] = OverworldTile.Floor;

  // paved plaza around the spawn heart
  carveDisk(tiles, center.x, center.y, 5, OverworldTile.Floor, floorVariant);

  for (const house of settlementHouses(rx, ry, worldSeed)) {
    // doorways are two tiles wide so walking in never needs pixel-precision
    const horizontalDoor = house.doorSide === 'n' || house.doorSide === 's';
    const doorTx2 = horizontalDoor ? house.doorTx + 1 : house.doorTx;
    const doorTy2 = horizontalDoor ? house.doorTy : house.doorTy + 1;
    for (let y = house.y0; y <= house.y1; y += 1) {
      for (let x = house.x0; x <= house.x1; x += 1) {
        const edge = x === house.x0 || x === house.x1 || y === house.y0 || y === house.y1;
        const doorway = (x === house.doorTx && y === house.doorTy) || (x === doorTx2 && y === doorTy2);
        const index = y * size + x;
        tiles[index] = edge && !doorway ? OverworldTile.Brick : OverworldTile.Floor;
        // interiors get the packed-dirt variant: reads as a house floor and
        // keeps the renderer's grass/flower decor outside
        if (!edge || doorway) floorVariant[index] = PATH_FLOOR_VARIANT;
      }
    }
    // a short garden path from each doorstep toward the plaza
    const step = house.doorSide === 'w' ? [-1, 0] : house.doorSide === 'e' ? [1, 0] : house.doorSide === 'n' ? [0, -1] : [0, 1];
    const doorstep = { x: house.doorTx + step[0], y: house.doorTy + step[1] };
    carveLine(tiles, doorstep, center, 0, floorVariant);
  }
  return { x0, y0, x1, y1 };
}

function carveRuins(tiles: Uint8Array, rand: () => number, center: { x: number; y: number }): void {
  for (let ordinal = 0; ordinal < 3; ordinal += 1) {
    const width = 8 + Math.floor(rand() * 6);
    const height = 7 + Math.floor(rand() * 5);
    let x0 = 8 + Math.floor(rand() * (RESOURCE_REGION_SIZE - width - 16));
    let y0 = 8 + Math.floor(rand() * (RESOURCE_REGION_SIZE - height - 16));
    if (Math.hypot(x0 + width / 2 - center.x, y0 + height / 2 - center.y) < 32) {
      x0 = ordinal % 2 === 0 ? 14 : RESOURCE_REGION_SIZE - width - 14;
      y0 = ordinal === 2 ? 18 : RESOURCE_REGION_SIZE - height - 18;
    }
    carveDisk(tiles, x0 + Math.floor(width / 2), y0 + Math.floor(height / 2), Math.max(width, height), OverworldTile.Floor);
    const doorX = x0 + 1 + Math.floor(rand() * Math.max(1, width - 2));
    for (let y = y0; y < y0 + height; y += 1) {
      for (let x = x0; x < x0 + width; x += 1) {
        const edge = x === x0 || x === x0 + width - 1 || y === y0 || y === y0 + height - 1;
        if (!edge) continue;
        if (y === y0 + height - 1 && x === doorX) continue;
        if (rand() < 0.12) continue;
        tiles[y * RESOURCE_REGION_SIZE + x] = OverworldTile.Brick;
      }
    }
    carveLine(tiles, { x: doorX, y: y0 + height }, center, 1);
  }
}


function checksumFor(tiles: Uint8Array, portals: readonly CanonicalOverworldPortal[]): string {
  let hash = 0x811c9dc5;
  for (const tile of tiles) {
    hash ^= tile;
    hash = Math.imul(hash, 0x01000193);
  }
  for (const portal of portals) {
    hash ^= hashText32(`${portal.id}:${portal.tx}:${portal.ty}`);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function clearResourceRoadOverlap(
  floorVariant: Uint8Array,
  worldSeed: number,
  rx: number,
  ry: number,
): void {
  const profile = regionResourceProfileAt(rx, ry);
  for (const node of generateRegionResourceNodes(worldSeed, rx, ry, profile)) {
    const radius = node.kind === 'tree' ? 1 : 0;
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        const tx = node.tx + ox;
        const ty = node.ty + oy;
        if (tx < 0 || ty < 0 || tx >= RESOURCE_REGION_SIZE || ty >= RESOURCE_REGION_SIZE) continue;
        const index = ty * RESOURCE_REGION_SIZE + tx;
        if (isPathFloorVariant(floorVariant[index])) floorVariant[index] = 0;
      }
    }
  }
}

function carveAuthoritativeInteractionAreas(
  tiles: Uint8Array,
  worldSeed: number,
  rx: number,
  ry: number,
  riskTier: ResourceRiskTier,
): void {
  const profile = regionResourceProfileAt(rx, ry);
  for (const node of generateRegionResourceNodes(worldSeed, rx, ry, profile)) carveDisk(tiles, node.tx, node.ty, 1);
  for (const chest of generateWorldChests(worldSeed, rx, ry, riskTier)) carveDisk(tiles, Math.floor(chest.x / RESOURCE_TILE_SIZE), Math.floor(chest.y / RESOURCE_TILE_SIZE), 1);
  for (const enemy of generateEnemySpawns(worldSeed, rx, ry, riskTier)) carveDisk(tiles, Math.floor(enemy.x / RESOURCE_TILE_SIZE), Math.floor(enemy.y / RESOURCE_TILE_SIZE), 2);
  for (const plot of settlementFarmPlots(rx, ry)) carveDisk(tiles, plot.tx, plot.ty, 1, OverworldTile.Floor);
  for (const animal of settlementAnimals(rx, ry)) carveDisk(tiles, Math.floor(animal.x / RESOURCE_TILE_SIZE), Math.floor(animal.y / RESOURCE_TILE_SIZE), 1);
}

const TOPOLOGY_CACHE = new Map<string, CanonicalOverworldTopology>();

export function generateCanonicalOverworldTopology(worldSeed: number, rx: number, ry: number): CanonicalOverworldTopology {
  const cacheKey = `${worldSeed}:${rx}:${ry}`;
  const cached = TOPOLOGY_CACHE.get(cacheKey);
  if (cached) return cached;
  if (!Number.isSafeInteger(worldSeed) || !Number.isInteger(rx) || !Number.isInteger(ry) || Math.abs(rx) > OVERWORLD_WORLD_RADIUS || Math.abs(ry) > OVERWORLD_WORLD_RADIUS) {
    throw new Error('invalid overworld topology coordinates');
  }
  const profile = regionResourceProfileAt(rx, ry);
  const rand = mulberry32(hashCoords(worldSeed, rx, ry));
  const { tiles, floorVariant } = terrainBase(LAND_TERRAIN[profile.landId], rand);
  const center = { x: Math.floor(RESOURCE_REGION_SIZE / 2), y: Math.floor(RESOURCE_REGION_SIZE / 2) };
  carveDisk(tiles, center.x, center.y, 6);
  carveEdges(tiles, floorVariant, worldSeed, rx, ry, center);
  const settlement = settlementAt(rx, ry);
  const townBounds = settlement ? carveTown(tiles, floorVariant, center, rx, ry, worldSeed) : undefined;
  carveRuins(tiles, rand, center);

  let farmBounds: CanonicalOverworldTopology['farmBounds'];
  const plots = settlementFarmPlots(rx, ry);
  if (plots.length > 0) {
    for (const plot of plots) tiles[plot.ty * RESOURCE_REGION_SIZE + plot.tx] = OverworldTile.Farmland;
    farmBounds = {
      x0: Math.max(1, Math.min(...plots.map((plot) => plot.tx)) - 2),
      y0: Math.max(1, Math.min(...plots.map((plot) => plot.ty)) - 2),
      x1: Math.min(RESOURCE_REGION_SIZE - 2, Math.max(...plots.map((plot) => plot.tx)) + 2),
      y1: Math.min(RESOURCE_REGION_SIZE - 2, Math.max(...plots.map((plot) => plot.ty)) + 2),
    };
    carveLine(tiles, center, { x: plots[0].tx, y: plots[0].ty }, 1, floorVariant);
  }

  const portals: CanonicalOverworldPortal[] = [];
  for (const feature of OVERWORLD_FEATURES) {
    if (feature.rx !== rx || feature.ry !== ry) continue;
    const spot = overworldFeatureSpot(worldSeed, feature);
    carveDisk(tiles, spot.tx, spot.ty, 3);
    carveLine(tiles, { x: spot.tx, y: spot.ty }, center, 1, floorVariant);
    portals.push({
      id: feature.id,
      kind: feature.kind,
      name: feature.name,
      description: feature.description,
      tx: spot.tx,
      ty: spot.ty,
      x: (spot.tx + 0.5) * RESOURCE_TILE_SIZE,
      y: (spot.ty + 1) * RESOURCE_TILE_SIZE - 2,
      dungeonId: feature.dungeonId,
    });
  }

  carveAuthoritativeInteractionAreas(tiles, worldSeed, rx, ry, profile.riskTier);
  // Resource nodes remain authoritative but roads yield to a small natural
  // clearing, avoiding trees/ore visually growing through paved paths.
  clearResourceRoadOverlap(floorVariant, worldSeed, rx, ry);
  carveDisk(tiles, center.x, center.y, 5);
  const entrance = { x: center.x, y: center.y };
  const dungeonPortal = portals.find((portal) => portal.kind === 'dungeon');
  const exit = dungeonPortal ? { x: dungeonPortal.tx, y: dungeonPortal.ty } : { ...entrance };

  // a plain wilderness region (no settlement, no authored dungeon/gate/route)
  // gets a small camp clearing so open field never reads as totally empty
  let campAnchor: { tx: number; ty: number } | undefined;
  if (!settlement && portals.length === 0) {
    const campTx = center.x + 11;
    const campTy = center.y - 9;
    carveDisk(tiles, campTx, campTy, 4);
    campAnchor = { tx: campTx, ty: campTy };
  }

  const topology: CanonicalOverworldTopology = {
    version: OVERWORLD_TOPOLOGY_VERSION,
    worldSeed,
    rx,
    ry,
    w: RESOURCE_REGION_SIZE,
    h: RESOURCE_REGION_SIZE,
    tiles: Array.from(tiles),
    floorVariant: Array.from(floorVariant),
    entrance,
    exit,
    townBounds,
    farmBounds,
    campAnchor,
    portals,
    checksum: checksumFor(tiles, portals),
  };
  if (TOPOLOGY_CACHE.size >= 256) TOPOLOGY_CACHE.delete(TOPOLOGY_CACHE.keys().next().value!);
  TOPOLOGY_CACHE.set(cacheKey, topology);
  return topology;
}

export function isCanonicalOverworldTileWalkable(topology: Pick<CanonicalOverworldTopology, 'w' | 'h' | 'tiles'>, tx: number, ty: number): boolean {
  if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0 || tx >= topology.w || ty >= topology.h) return false;
  const tile = topology.tiles[ty * topology.w + tx];
  return tile !== OverworldTile.Rock && tile !== OverworldTile.Brick;
}

export function isCanonicalOverworldPointWalkable(
  topology: Pick<CanonicalOverworldTopology, 'w' | 'h' | 'tiles'>,
  x: number,
  y: number,
  radius = OVERWORLD_PLAYER_RADIUS,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false;
  const points = [[x - radius, y - radius], [x + radius, y - radius], [x - radius, y + radius], [x + radius, y + radius], [x, y]] as const;
  return points.every(([px, py]) => isCanonicalOverworldTileWalkable(topology, Math.floor(px / RESOURCE_TILE_SIZE), Math.floor(py / RESOURCE_TILE_SIZE)));
}

export function isCanonicalOverworldPathWalkable(
  topology: Pick<CanonicalOverworldTopology, 'w' | 'h' | 'tiles'>,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius = OVERWORLD_PLAYER_RADIUS,
): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(2, RESOURCE_TILE_SIZE / 4)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    if (!isCanonicalOverworldPointWalkable(topology, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius)) return false;
  }
  return true;
}

export function canonicalPortalById(worldSeed: number, rx: number, ry: number, portalId: string): CanonicalOverworldPortal | null {
  return generateCanonicalOverworldTopology(worldSeed, rx, ry).portals.find((portal) => portal.id === portalId) ?? null;
}


export function normalizeCanonicalOverworldPosition(
  worldSeed: number,
  position: { rx: number; ry: number; x: number; y: number },
): { rx: number; ry: number; x: number; y: number } {
  const topology = generateCanonicalOverworldTopology(worldSeed, position.rx, position.ry);
  if (isCanonicalOverworldPointWalkable(topology, position.x, position.y)) return { ...position };
  const originTx = Math.max(1, Math.min(topology.w - 2, Math.floor(position.x / RESOURCE_TILE_SIZE)));
  const originTy = Math.max(1, Math.min(topology.h - 2, Math.floor(position.y / RESOURCE_TILE_SIZE)));
  for (let radius = 1; radius < Math.max(topology.w, topology.h); radius += 1) {
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
        const tx = originTx + ox;
        const ty = originTy + oy;
        const x = (tx + 0.5) * RESOURCE_TILE_SIZE;
        const y = (ty + 0.5) * RESOURCE_TILE_SIZE;
        if (isCanonicalOverworldPointWalkable(topology, x, y)) return { rx: position.rx, ry: position.ry, x, y };
      }
    }
  }
  const fallbackX = (topology.entrance.x + 0.5) * RESOURCE_TILE_SIZE;
  const fallbackY = (topology.entrance.y + 0.5) * RESOURCE_TILE_SIZE;
  return { rx: position.rx, ry: position.ry, x: fallbackX, y: fallbackY };
}

export function resetOverworldTopologyCacheForTests(): void {
  TOPOLOGY_CACHE.clear();
}
