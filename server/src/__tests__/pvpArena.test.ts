import { describe, expect, it } from 'vitest';
import {
  canExitPvpFromLiveState,
  isInsidePvpExtraction,
  PVP_EXTRACTION_IDLE_MS,
  PVP_EXTRACTION_RADIUS,
  pvpArenaForRoom,
} from '../pvp/arena.js';

describe('PvP regional arena identity', () => {
  it('derives stable room topology and a server-owned extraction beacon', () => {
    const roomKey = 'pvp:v1:42:fracture:green-red-gate';
    const a = pvpArenaForRoom(roomKey);
    const b = pvpArenaForRoom(roomKey);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.spawn).toEqual(b.spawn);
    expect(isInsidePvpExtraction(roomKey, a.spawn.x, a.spawn.y)).toBe(true);
    expect(isInsidePvpExtraction(roomKey, a.spawn.x + PVP_EXTRACTION_RADIUS + 1, a.spawn.y)).toBe(false);
  });

  it('requires a live, idle, non-settling player inside extraction', () => {
    const roomKey = 'pvp:v1:42:lost:green-black-gate';
    const spawn = pvpArenaForRoom(roomKey).spawn;
    const now = 10_000;
    const valid = { x: spawn.x, y: spawn.y, alive: true, settling: false, moving: false, lastMovedAt: now - PVP_EXTRACTION_IDLE_MS };
    expect(canExitPvpFromLiveState(roomKey, valid, now)).toBe(true);
    expect(canExitPvpFromLiveState(roomKey, { ...valid, moving: true }, now)).toBe(false);
    expect(canExitPvpFromLiveState(roomKey, { ...valid, settling: true }, now)).toBe(false);
    expect(canExitPvpFromLiveState(roomKey, { ...valid, alive: false }, now)).toBe(false);
    expect(canExitPvpFromLiveState(roomKey, { ...valid, lastMovedAt: now - PVP_EXTRACTION_IDLE_MS + 1 }, now)).toBe(false);
    expect(canExitPvpFromLiveState(roomKey, { ...valid, x: spawn.x + PVP_EXTRACTION_RADIUS + 1 }, now)).toBe(false);
  });
});
