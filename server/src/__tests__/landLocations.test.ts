import { describe, expect, it } from 'vitest';
import { CAPITAL_REGIONS, SAFE_SPAWN_POSITION, capitalSpawnForLand } from '../world/landLocations.js';
import { regionResourceProfileAt } from '../world/regionResourceProfiles.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from '../world/resourceLayout.js';

describe('authoritative land locations', () => {
  it('maps every land to a capital region owned by that land', () => {
    for (const [landId, capital] of Object.entries(CAPITAL_REGIONS)) {
      expect(regionResourceProfileAt(capital.rx, capital.ry).landId).toBe(landId);
      expect(capitalSpawnForLand(landId as keyof typeof CAPITAL_REGIONS)).toEqual({ ...capital, ...SAFE_SPAWN_POSITION });
    }
  });

  it('uses the exact center of a region as the safe spawn', () => {
    expect(SAFE_SPAWN_POSITION).toEqual({
      x: (Math.floor(RESOURCE_REGION_SIZE / 2) + 0.5) * RESOURCE_TILE_SIZE,
      y: (Math.floor(RESOURCE_REGION_SIZE / 2) + 0.5) * RESOURCE_TILE_SIZE,
    });
  });
});
