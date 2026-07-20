import { describe, expect, it } from 'vitest';
import { worldVisualRevision } from '../rendering/worldVisualRevision';
import type { World } from '../world/types';

function visualWorld(timer: number, stage: 0 | 1 | 2 | 3): Pick<World, 'props' | 'portals' | 'houses' | 'chests' | 'farmPlots' | 'miningNodes' | 'resourceNodes'> {
  return {
    props: [],
    portals: [],
    houses: [],
    chests: [],
    farmPlots: [{ tx: 1, ty: 1, crop: 'glowshroom', stage, timer }],
    miningNodes: [],
    resourceNodes: [],
  };
}

describe('static world visual revision', () => {
  it('ignores countdown-only farm timer changes', () => {
    expect(worldVisualRevision(visualWorld(8.9, 1))).toBe(worldVisualRevision(visualWorld(1.1, 1)));
  });

  it('changes when farm geometry advances to a new stage', () => {
    expect(worldVisualRevision(visualWorld(8.9, 1))).not.toBe(worldVisualRevision(visualWorld(8.9, 2)));
  });
});
