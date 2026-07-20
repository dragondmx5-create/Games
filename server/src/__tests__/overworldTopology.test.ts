import { beforeEach, describe, expect, it } from 'vitest';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from '../world/resourceLayout.js';
import {
  OverworldTile,
  canonicalOverworldGatePositions,
  generateCanonicalOverworldTopology,
  isCanonicalOverworldPathWalkable,
  isCanonicalOverworldPointWalkable,
  normalizeCanonicalOverworldPosition,
  resetOverworldTopologyCacheForTests,
} from '../world/overworldTopology.js';

const SEED = 987654321;

function pixel(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx + 0.5) * RESOURCE_TILE_SIZE, y: (ty + 0.5) * RESOURCE_TILE_SIZE };
}

describe('canonical overworld topology', () => {
  beforeEach(() => resetOverworldTopologyCacheForTests());

  it('is deterministic and checksum-sensitive across regions', () => {
    const a = generateCanonicalOverworldTopology(SEED, 2, -1);
    const b = generateCanonicalOverworldTopology(SEED, 2, -1);
    const c = generateCanonicalOverworldTopology(SEED, 1, -1);
    expect(a.checksum).toBe(b.checksum);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.checksum).not.toBe(c.checksum);
    expect(a.tiles.some((tile) => tile === OverworldTile.Rock || tile === OverworldTile.Brick)).toBe(true);
  });

  it('authors the same opening on both sides of every shared edge', () => {
    for (let rx = -4; rx <= 4; rx += 1) {
      for (let ry = -5; ry <= 5; ry += 1) {
        expect(canonicalOverworldGatePositions(SEED, rx, ry, 'e'))
          .toEqual(canonicalOverworldGatePositions(SEED, rx + 1, ry, 'w'));
      }
    }
    for (let rx = -5; rx <= 5; rx += 1) {
      for (let ry = -4; ry <= 4; ry += 1) {
        expect(canonicalOverworldGatePositions(SEED, rx, ry, 's'))
          .toEqual(canonicalOverworldGatePositions(SEED, rx, ry + 1, 'n'));
      }
    }
    expect(canonicalOverworldGatePositions(SEED, 5, 0, 'e')).toEqual([]);
    expect(canonicalOverworldGatePositions(SEED, -5, 0, 'w')).toEqual([]);
  });

  it('sweeps the full movement segment instead of checking only the destination', () => {
    const w = 8;
    const h = 8;
    const tiles = new Array<number>(w * h).fill(OverworldTile.Floor);
    tiles[4 * w + 4] = OverworldTile.Rock;
    const topology = { w, h, tiles };
    const from = pixel(2, 4);
    const to = pixel(6, 4);
    expect(isCanonicalOverworldPointWalkable(topology, from.x, from.y)).toBe(true);
    expect(isCanonicalOverworldPointWalkable(topology, to.x, to.y)).toBe(true);
    expect(isCanonicalOverworldPathWalkable(topology, from, to)).toBe(false);
  });

  it('normalizes legacy positions trapped inside a solid tile', () => {
    const topology = generateCanonicalOverworldTopology(SEED, 2, 2);
    const solidIndex = topology.tiles.findIndex((tile) => tile === OverworldTile.Rock || tile === OverworldTile.Brick);
    expect(solidIndex).toBeGreaterThanOrEqual(0);
    const tx = solidIndex % RESOURCE_REGION_SIZE;
    const ty = Math.floor(solidIndex / RESOURCE_REGION_SIZE);
    const bad = pixel(tx, ty);
    expect(isCanonicalOverworldPointWalkable(topology, bad.x, bad.y)).toBe(false);
    const fixed = normalizeCanonicalOverworldPosition(SEED, { rx: 2, ry: 2, ...bad });
    expect(isCanonicalOverworldPointWalkable(topology, fixed.x, fixed.y)).toBe(true);
  });
});
