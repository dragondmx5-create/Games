import type { ResourceLandId } from './regionResourceProfiles.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from './resourceLayout.js';

export const SAFE_SPAWN_TILE = Math.floor(RESOURCE_REGION_SIZE / 2);
export const SAFE_SPAWN_POSITION = Object.freeze({
  x: (SAFE_SPAWN_TILE + 0.5) * RESOURCE_TILE_SIZE,
  y: (SAFE_SPAWN_TILE + 0.5) * RESOURCE_TILE_SIZE,
});

export const CAPITAL_REGIONS: Readonly<Record<ResourceLandId, { rx: number; ry: number }>> = Object.freeze({
  witchlands: { rx: -4, ry: -3 },
  'green-land': { rx: 0, ry: 0 },
  rainforest: { rx: 4, ry: -3 },
  frostlands: { rx: -4, ry: 3 },
  'sunscorched-desert': { rx: 0, ry: 4 },
  'cinder-coast': { rx: 4, ry: 3 },
});

export function capitalSpawnForLand(landId: ResourceLandId): { rx: number; ry: number; x: number; y: number } {
  return { ...CAPITAL_REGIONS[landId], ...SAFE_SPAWN_POSITION };
}
