import { beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import {
  canonicalOverworldGatePositions,
  generateCanonicalOverworldTopology,
  isCanonicalOverworldPointWalkable,
  normalizeCanonicalOverworldPosition,
} from '../world/overworldTopology.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from '../world/resourceLayout.js';
import { getFreshWorldPresence, joinWorldPresence, relocateWorldPresence, resetWorldPresenceForTests, suspendWorldPresence, updateWorldPresence } from '../world/presence.js';

const WORLD_SEED = 987654321;
const MAX_PIXEL = RESOURCE_REGION_SIZE * RESOURCE_TILE_SIZE;

function socket(messages: string[] = []): WebSocket {
  return { OPEN: 1, readyState: 1, send: (value: string) => messages.push(value), close: () => undefined } as unknown as WebSocket;
}

function safePosition(rx = 0, ry = 0): { rx: number; ry: number; x: number; y: number } {
  return normalizeCanonicalOverworldPosition(WORLD_SEED, { rx, ry, x: MAX_PIXEL / 2, y: MAX_PIXEL / 2 });
}

describe('world presence validation', () => {
  beforeEach(() => resetWorldPresenceForTests());

  it('uses the authoritative join position and rejects a first-frame teleport', () => {
    const ws = socket();
    const initial = safePosition();
    joinWorldPresence('u1', 'Miner', ws, initial, 1_000);
    expect(updateWorldPresence('u1', ws, { type: 'position', seq: 0, rx: 0, ry: 0, x: initial.x + 800, y: initial.y }, WORLD_SEED, 1_010)).toBe(false);
    expect(updateWorldPresence('u1', ws, { type: 'position', seq: 1, rx: 0, ry: 0, x: initial.x + 8, y: initial.y }, WORLD_SEED, 1_020)).toBe(true);
    expect(getFreshWorldPresence('u1', 1_020)?.x).toBe(initial.x + 8);
  });

  it('requires adjacent region transitions through the canonical matching opening', () => {
    const ws = socket();
    const gate = canonicalOverworldGatePositions(WORLD_SEED, 0, 0, 'e')[0];
    expect(gate).toBeTypeOf('number');
    const y = (gate + 0.5) * RESOURCE_TILE_SIZE;
    const source = { rx: 0, ry: 0, x: MAX_PIXEL - 10, y };
    const target = { type: 'position' as const, seq: 0, rx: 1, ry: 0, x: 10, y };
    expect(isCanonicalOverworldPointWalkable(generateCanonicalOverworldTopology(WORLD_SEED, 0, 0), source.x, source.y)).toBe(true);
    expect(isCanonicalOverworldPointWalkable(generateCanonicalOverworldTopology(WORLD_SEED, 1, 0), target.x, target.y)).toBe(true);
    joinWorldPresence('u1', 'Scout', ws, source, 1_000);
    expect(updateWorldPresence('u1', ws, target, WORLD_SEED, 1_100)).toBe(true);
    expect(updateWorldPresence('u1', ws, { type: 'position', seq: 1, rx: 3, ry: 0, x: 20, y }, WORLD_SEED, 1_200)).toBe(false);
  });

  it('rejects an edge transition through a solid non-gate tile', () => {
    const ws = socket();
    const gate = canonicalOverworldGatePositions(WORLD_SEED, 0, 0, 'e')[0];
    const blockedY = ((gate + 20) % (RESOURCE_REGION_SIZE - 24) + 12.5) * RESOURCE_TILE_SIZE;
    const source = { rx: 0, ry: 0, x: MAX_PIXEL - 10, y: blockedY };
    joinWorldPresence('u2', 'Wallclipper', ws, source, 1_000);
    expect(updateWorldPresence('u2', ws, {
      type: 'position', seq: 0, rx: 1, ry: 0, x: 10, y: blockedY,
    }, WORLD_SEED, 1_100)).toBe(false);
  });

  it('suspends overworld authority for an active instance regardless of socket state', () => {
    const ws = socket();
    joinWorldPresence('u1', 'Miner', ws, safePosition(), 1_000);
    expect(suspendWorldPresence('u1')).toBe(true);
    expect(getFreshWorldPresence('u1', 1_001)).toBeNull();
    expect(suspendWorldPresence('u1')).toBe(false);
  });

  it('applies an authorized relocation and resets the client sequence with a welcome frame', () => {
    const messages: string[] = [];
    const ws = socket(messages);
    joinWorldPresence('u1', 'Wayfarer', ws, safePosition(2, 2), 1_000);
    const destination = safePosition(0, 0);
    expect(relocateWorldPresence('u1', destination, 1_100)).toBe(true);
    expect(getFreshWorldPresence('u1', 1_100)).toMatchObject({ ...destination, seq: -1 });
    expect(messages.some((value) => JSON.parse(value).type === 'welcome')).toBe(true);
    expect(updateWorldPresence('u1', ws, {
      type: 'position', seq: 0, rx: 0, ry: 0, x: destination.x + 7, y: destination.y,
    }, WORLD_SEED, 1_200)).toBe(true);
  });
});
