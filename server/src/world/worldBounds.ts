/** Canonical region-grid bounds shared by validation, persistence and topology. */
export const OVERWORLD_WORLD_RADIUS = 5;
export const OVERWORLD_WORLD_DIAMETER = OVERWORLD_WORLD_RADIUS * 2 + 1;
export const OVERWORLD_REGION_COUNT = OVERWORLD_WORLD_DIAMETER ** 2;

export function isOverworldRegionCoordinate(rx: number, ry: number): boolean {
  return Number.isInteger(rx) && Number.isInteger(ry)
    && Math.abs(rx) <= OVERWORLD_WORLD_RADIUS
    && Math.abs(ry) <= OVERWORLD_WORLD_RADIUS;
}

export const inOverworldBounds = isOverworldRegionCoordinate;
