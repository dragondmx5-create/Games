import { describe, expect, it } from 'vitest';
import { RESOURCE_REGION_SIZE, generateRegionResourceNodes, parseResourceNodeId, resourceNodeCount } from '../world/resourceLayout.js';
import { harvestResourceSchema } from '../world/resourceSchema.js';
import { regionResourceProfileAt, REGION_RESOURCE_PROFILE_COUNT } from '../world/regionResourceProfiles.js';
import { OVERWORLD_REGION_COUNT, OVERWORLD_WORLD_RADIUS } from '../world/worldBounds.js';
import { overworldFeaturesAt, overworldFeatureSpot } from '../world/worldFeatureLayout.js';

describe('world resource layout', () => {
  it('covers the bounded shared world', () => {
    expect(REGION_RESOURCE_PROFILE_COUNT).toBe(OVERWORLD_REGION_COUNT);
    expect(() => regionResourceProfileAt(OVERWORLD_WORLD_RADIUS + 1, 0)).toThrow();
  });

  it('round-trips canonical IDs and rejects malformed IDs', () => {
    const profile = regionResourceProfileAt(0, 0);
    const node = generateRegionResourceNodes(99, 0, 0, profile)[0];
    expect(parseResourceNodeId(node.id)).toEqual({ worldSeed: 99, rx: 0, ry: 0, kind: node.kind, ordinal: node.ordinal });
    expect(parseResourceNodeId('res1:99:0:0:tree:-1')).toBeNull();
    expect(parseResourceNodeId('res2:99:0:0:tree:0')).toBeNull();
  });

  it('varies resource density by land and risk without exceeding caps', () => {
    const greenSanctuary = regionResourceProfileAt(0, 0);
    const rainforestSanctuary = regionResourceProfileAt(4, -3);
    const desertSanctuary = regionResourceProfileAt(0, 4);
    const rainforestLost = regionResourceProfileAt(3, -5);
    expect(resourceNodeCount('tree', rainforestSanctuary)).toBeGreaterThan(resourceNodeCount('tree', desertSanctuary));
    expect(resourceNodeCount('iron', desertSanctuary)).toBeGreaterThan(resourceNodeCount('iron', rainforestSanctuary));
    expect(resourceNodeCount('tree', rainforestLost)).toBeGreaterThan(resourceNodeCount('tree', rainforestSanctuary));
    expect(resourceNodeCount('tree', greenSanctuary)).toBeLessThanOrEqual(44);
  });
  it('reserves the authoritative capital spawn square in every sampled region', () => {
    const center = Math.floor(RESOURCE_REGION_SIZE / 2);
    for (const [rx, ry] of [[0, 0], [-4, -3], [4, 3], [0, -4]] as const) {
      const nodes = generateRegionResourceNodes(20260713, rx, ry, regionResourceProfileAt(rx, ry));
      expect(nodes.every((node) => Math.max(Math.abs(node.tx - center), Math.abs(node.ty - center)) >= 24)).toBe(true);
    }
  });

  it('keeps canonical resources clear of authored gates and dungeon entrances', () => {
    const worldSeed = 424242;
    for (let ry = -OVERWORLD_WORLD_RADIUS; ry <= OVERWORLD_WORLD_RADIUS; ry += 1) {
      for (let rx = -OVERWORLD_WORLD_RADIUS; rx <= OVERWORLD_WORLD_RADIUS; rx += 1) {
        const nodes = generateRegionResourceNodes(worldSeed, rx, ry, regionResourceProfileAt(rx, ry));
        const featureSpots = overworldFeaturesAt(rx, ry).map((feature) => overworldFeatureSpot(worldSeed, feature));
        expect(nodes.every((node) => featureSpots.every((spot) => Math.hypot(node.tx - spot.tx, node.ty - spot.ty) >= 8))).toBe(true);
      }
    }
  });

  it('rejects command keys that cannot be safely logged', () => {
    expect(harvestResourceSchema.safeParse({ nodeId: 'res1:1:0:0:tree:0', idempotencyKey: 'harvest:valid-key_1' }).success).toBe(true);
    expect(harvestResourceSchema.safeParse({ nodeId: 'res1:1:0:0:tree:0', idempotencyKey: 'bad key with spaces' }).success).toBe(false);
  });

});
