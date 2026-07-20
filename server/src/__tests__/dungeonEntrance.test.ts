import { describe, expect, it } from 'vitest';
import { dungeonOverworldEntrance } from '../dungeon/overworldEntrance.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from '../world/resourceLayout.js';

describe('authoritative Dungeon overworld entrance', () => {
  it('is deterministic and inside the shared region topology', () => {
    const a = dungeonOverworldEntrance(1234, 'old-crown-mine');
    const b = dungeonOverworldEntrance(1234, 'old-crown-mine');
    expect(a).toEqual(b);
    expect(a.tx).toBeGreaterThanOrEqual(9);
    expect(a.ty).toBeGreaterThanOrEqual(9);
    expect(a.tx).toBeLessThan(RESOURCE_REGION_SIZE - 9);
    expect(a.ty).toBeLessThan(RESOURCE_REGION_SIZE - 9);
    expect(a.x).toBe((a.tx + 0.5) * RESOURCE_TILE_SIZE);
  });

  it('changes across dungeon identity or world seed', () => {
    expect(dungeonOverworldEntrance(1, 'old-crown-mine')).not.toEqual(dungeonOverworldEntrance(2, 'old-crown-mine'));
    expect(dungeonOverworldEntrance(1, 'old-crown-mine')).not.toEqual(dungeonOverworldEntrance(1, 'briarhold-keep'));
  });
});
