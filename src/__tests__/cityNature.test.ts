import { describe, expect, it } from 'vitest';
import { TILE } from '../config';
import { generateRegion, isWalkable } from '../world';
import { isPathFloorVariant } from '../../server/src/world/overworldTopology';
import type { PropKind } from '../world/types';

const NATURE = new Set<PropKind>([
  'tree', 'ancientTree', 'pineTree', 'boulder', 'cliffOutcrop', 'flowerPatch', 'reedCluster', 'rock', 'shrub',
]);

describe('six-land regional nature', () => {
  it('is deterministic and varies across the six authored lands', () => {
    const samples = [[0, 0], [-2, -2], [-4, 3], [4, 3], [2, -4], [5, -2]] as const;
    const signatures = new Set<string>();
    for (const [rx, ry] of samples) {
      const first = generateRegion(rx, ry, 424242);
      const second = generateRegion(rx, ry, 424242);
      const props = first.props.filter((prop) => NATURE.has(prop.kind));
      expect(second.props.filter((prop) => NATURE.has(prop.kind))).toEqual(props);
      signatures.add([...new Set(props.map((prop) => prop.kind))].sort().join(','));
    }
    expect(signatures.size).toBeGreaterThanOrEqual(3);
  });

  it('keeps nature off roads, buildings and portals across all 121 regions', () => {
    const samples = [[-5, -5], [-4, -3], [-2, 0], [0, 0], [2, -4], [4, -3], [-4, 3], [0, 4], [4, 3], [5, 5], [3, 1], [-1, 4]] as const;
    for (const [rx, ry] of samples) {
      const world = generateRegion(rx, ry, 424242);
      for (const prop of world.props.filter((entry) => NATURE.has(entry.kind))) {
        const tx = Math.floor(prop.x / TILE);
        const ty = Math.floor(prop.y / TILE);
        expect(isWalkable(world, tx, ty), `${prop.kind} not walkable at ${rx},${ry}:${tx},${ty}`).toBe(true);
        expect(isPathFloorVariant(world.floorVariant[ty * world.w + tx]), `${prop.kind} on path at ${rx},${ry}:${tx},${ty}`).toBe(false);
        expect(world.houses?.some((house) => tx >= house.x0 && tx <= house.x1 && ty >= house.y0 && ty <= house.y1)).toBe(false);
        expect(world.portals.some((portal) => Math.hypot(prop.x - portal.x, prop.y - portal.y) < TILE * 2.5)).toBe(false);
      }
    }
  });
});
