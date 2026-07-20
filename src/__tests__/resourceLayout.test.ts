import { describe, expect, it } from 'vitest';
import { generateRegion } from '../world';
import { regionProfileAt } from '../overworld/registry';
import { generateRegionResourceNodes } from '../../server/src/world/resourceLayout';
import { regionResourceProfileAt, REGION_RESOURCE_PROFILE_COUNT } from '../../server/src/world/regionResourceProfiles';
import { WORLD_RADIUS } from '../config';

function sharedProfile(rx: number, ry: number) {
  const profile = regionProfileAt(rx, ry);
  return {
    landId: profile.landId,
    riskTier: profile.riskTier,
    treeScale: profile.generation.treeScale,
    ironScale: profile.generation.ironScale,
    crystalScale: profile.generation.crystalScale,
    shroomScale: profile.generation.shroomScale,
    resourceMultiplier: profile.rules.resourceMultiplier,
  };
}

describe('shared resource layout', () => {
  it('keeps the server profile table in parity with the expanded client world', () => {
    expect(REGION_RESOURCE_PROFILE_COUNT).toBe((WORLD_RADIUS * 2 + 1) ** 2);
    for (let ry = -WORLD_RADIUS; ry <= WORLD_RADIUS; ry++) {
      for (let rx = -WORLD_RADIUS; rx <= WORLD_RADIUS; rx++) expect(regionResourceProfileAt(rx, ry)).toEqual(sharedProfile(rx, ry));
    }
  });

  it('generates stable unique bounded node IDs and coordinates', () => {
    const a = generateRegionResourceNodes(12345, 2, -3, regionResourceProfileAt(2, -3));
    const b = generateRegionResourceNodes(12345, 2, -3, regionResourceProfileAt(2, -3));
    expect(a).toEqual(b);
    expect(new Set(a.map((node) => node.id)).size).toBe(a.length);
    for (const node of a) {
      expect(node.tx).toBeGreaterThanOrEqual(10);
      expect(node.tx).toBeLessThan(150);
      expect(node.ty).toBeGreaterThanOrEqual(10);
      expect(node.ty).toBeLessThan(150);
    }
  });

  it('uses the exact canonical node set in generated overworld regions', () => {
    const seed = 0x5eeda11;
    const region = generateRegion(0, 0, seed);
    const expected = generateRegionResourceNodes(seed, 0, 0, sharedProfile(0, 0));
    expect(region.resourceNodes.map((node) => node.id)).toEqual(expected.map((node) => node.id));
    expect(region.resourceNodes.every((node) => node.available)).toBe(true);
  });
});
