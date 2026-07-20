import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from '../world/worldDimensions.js';

export const DUNGEON_ENTRANCE_RADIUS = 32;

function hashText(seed: number, text: string): number {
  let hash = (seed ^ 0x811c9dc5) | 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Stable server-verifiable overworld portal position. The client uses this
 * same pure module to render/carve the portal, but cannot choose its location. */
export function dungeonOverworldEntrance(worldSeed: number, dungeonId: string): { tx: number; ty: number; x: number; y: number } {
  const margin = 9;
  const span = RESOURCE_REGION_SIZE - margin * 2;
  const hash = hashText(worldSeed, dungeonId);
  const tx = margin + (hash % span);
  const ty = margin + (((hash >>> 11) ^ Math.imul(hash, 0x45d9f3b)) >>> 0) % span;
  return {
    tx,
    ty,
    x: (tx + 0.5) * RESOURCE_TILE_SIZE,
    y: (ty + 0.5) * RESOURCE_TILE_SIZE,
  };
}
