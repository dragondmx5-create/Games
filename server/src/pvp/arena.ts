import { generateRedZoneWorld, type RedZoneWorld } from '../redzone/world.js';
import { hashText32 } from '../world/layoutRandom.js';

export const PVP_EXTRACTION_RADIUS = 64;
export const PVP_EXTRACTION_IDLE_MS = 750;

export function pvpArenaForRoom(roomKey: string): RedZoneWorld {
  return generateRedZoneWorld(hashText32(roomKey));
}

export function isInsidePvpExtraction(roomKey: string, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const spawn = pvpArenaForRoom(roomKey).spawn;
  return Math.hypot(x - spawn.x, y - spawn.y) <= PVP_EXTRACTION_RADIUS;
}

export function canExitPvpFromLiveState(
  roomKey: string,
  state: { x: number; y: number; alive: boolean; settling: boolean; moving: boolean; lastMovedAt: number },
  now = Date.now(),
): boolean {
  return state.alive
    && !state.settling
    && !state.moving
    && Number.isFinite(state.lastMovedAt)
    && now - state.lastMovedAt >= PVP_EXTRACTION_IDLE_MS
    && isInsidePvpExtraction(roomKey, state.x, state.y);
}
