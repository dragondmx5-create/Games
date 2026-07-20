import type { WebSocket } from 'ws';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from './resourceLayout.js';
import type { WorldPositionMessage } from './protocol.js';
import { generateCanonicalOverworldTopology, isCanonicalOverworldPathWalkable, isCanonicalOverworldPointWalkable } from './overworldTopology.js';
import { isOverworldRegionCoordinate } from './worldBounds.js';

const MAX_PIXEL = RESOURCE_REGION_SIZE * RESOURCE_TILE_SIZE;
const MAX_RUN_SPEED = 105;
const SPEED_TOLERANCE = 1.8;
const BASE_POSITION_ALLOWANCE = 28;
const PRESENCE_STALE_MS = 8_000;
const EDGE_ALLOWANCE = 64;
const SNAPSHOT_INTERVAL_MS = 66;
const MAX_WS_BUFFERED_BYTES = 256 * 1024;

export interface WorldPresence {
  userId: string;
  username: string;
  rx: number;
  ry: number;
  x: number;
  y: number;
  seq: number;
  updatedAt: number;
  ws: WebSocket;
}

export interface PublicWorldPresence {
  userId: string;
  username: string;
  rx: number;
  ry: number;
  x: number;
  y: number;
}

const players = new Map<string, WorldPresence>();
const snapshotTimers = new Map<string, ReturnType<typeof setTimeout>>();

function roomKey(rx: number, ry: number): string {
  return `${rx},${ry}`;
}

function publicPresence(presence: WorldPresence): PublicWorldPresence {
  return {
    userId: presence.userId,
    username: presence.username,
    rx: presence.rx,
    ry: presence.ry,
    x: presence.x,
    y: presence.y,
  };
}

function sendSnapshotNow(rx: number, ry: number): void {
  const room = roomKey(rx, ry);
  const roomPlayers = [...players.values()].filter((player) => roomKey(player.rx, player.ry) === room);
  for (const viewer of roomPlayers) {
    if (viewer.ws.readyState !== viewer.ws.OPEN) continue;
    if (viewer.ws.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
      viewer.ws.close(1013, 'client is too slow');
      continue;
    }
    const visible = roomPlayers.filter((player) => player.userId !== viewer.userId).map(publicPresence);
    viewer.ws.send(JSON.stringify({ type: 'snapshot', players: visible }));
  }
}

function scheduleSnapshot(rx: number, ry: number): void {
  const key = roomKey(rx, ry);
  if (snapshotTimers.has(key)) return;
  const timer = setTimeout(() => {
    snapshotTimers.delete(key);
    sendSnapshotNow(rx, ry);
  }, SNAPSHOT_INTERVAL_MS);
  timer.unref?.();
  snapshotTimers.set(key, timer);
}

function nearTransitionEdge(current: WorldPresence, next: WorldPositionMessage): boolean {
  const dx = next.rx - current.rx;
  const dy = next.ry - current.ry;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  if (dx === 1) return current.x >= MAX_PIXEL - EDGE_ALLOWANCE && next.x <= EDGE_ALLOWANCE;
  if (dx === -1) return current.x <= EDGE_ALLOWANCE && next.x >= MAX_PIXEL - EDGE_ALLOWANCE;
  if (dy === 1) return current.y >= MAX_PIXEL - EDGE_ALLOWANCE && next.y <= EDGE_ALLOWANCE;
  return current.y <= EDGE_ALLOWANCE && next.y >= MAX_PIXEL - EDGE_ALLOWANCE;
}

export function joinWorldPresence(
  userId: string,
  username: string,
  ws: WebSocket,
  initial: { rx: number; ry: number; x: number; y: number },
  now = Date.now(),
): boolean {
  const previous = players.get(userId);
  if (previous && previous.ws !== ws && previous.ws.readyState === previous.ws.OPEN) {
    previous.ws.close(4001, 'connection superseded');
  }
  players.set(userId, { userId, username, ws, ...initial, seq: -1, updatedAt: now });
  scheduleSnapshot(initial.rx, initial.ry);
  return true;
}

export function leaveWorldPresence(userId: string, ws: WebSocket): void {
  const presence = players.get(userId);
  if (!presence || presence.ws !== ws) return;
  players.delete(userId);
  scheduleSnapshot(presence.rx, presence.ry);
}

/** Removes a player from every overworld-authority surface regardless of the
 * socket's local visibility flag. Used after an instance transaction commits
 * so a modified client cannot keep harvesting, fighting or shopping in the
 * overworld while an authoritative Dungeon run is active. */
export function suspendWorldPresence(userId: string): boolean {
  const presence = players.get(userId);
  if (!presence) return false;
  players.delete(userId);
  scheduleSnapshot(presence.rx, presence.ry);
  return true;
}

export function updateWorldPresence(userId: string, ws: WebSocket, next: WorldPositionMessage, worldSeed: number, now = Date.now()): boolean {
  const current = players.get(userId);
  if (!current || current.ws !== ws || next.seq <= current.seq || !isOverworldRegionCoordinate(next.rx, next.ry)) return false;

  const sameRegion = current.rx === next.rx && current.ry === next.ry;
  if (!sameRegion && !nearTransitionEdge(current, next)) return false;

  if (sameRegion) {
    const dt = Math.max(0.016, Math.min(2, (now - current.updatedAt) / 1000));
    const maxDistance = MAX_RUN_SPEED * SPEED_TOLERANCE * dt + BASE_POSITION_ALLOWANCE;
    if (Math.hypot(next.x - current.x, next.y - current.y) > maxDistance) return false;
    const topology = generateCanonicalOverworldTopology(worldSeed, current.rx, current.ry);
    if (!isCanonicalOverworldPathWalkable(topology, current, next)) return false;
  } else {
    const sourceTopology = generateCanonicalOverworldTopology(worldSeed, current.rx, current.ry);
    const targetTopology = generateCanonicalOverworldTopology(worldSeed, next.rx, next.ry);
    if (!isCanonicalOverworldPointWalkable(sourceTopology, current.x, current.y)
      || !isCanonicalOverworldPointWalkable(targetTopology, next.x, next.y)) return false;
  }

  const oldRoom = { rx: current.rx, ry: current.ry };
  Object.assign(current, next, { updatedAt: now });
  scheduleSnapshot(oldRoom.rx, oldRoom.ry);
  if (!sameRegion) scheduleSnapshot(current.rx, current.ry);
  return true;
}

export function relocateWorldPresence(userId: string, position: { rx: number; ry: number; x: number; y: number }, now = Date.now()): boolean {
  const presence = players.get(userId);
  if (!presence) return false;
  const oldRoom = { rx: presence.rx, ry: presence.ry };
  Object.assign(presence, position, { seq: -1, updatedAt: now });
  scheduleSnapshot(oldRoom.rx, oldRoom.ry);
  scheduleSnapshot(position.rx, position.ry);
  if (presence.ws.readyState === presence.ws.OPEN) {
    presence.ws.send(JSON.stringify({ type: 'welcome', self: position }));
  }
  return true;
}

export function getFreshWorldPresence(userId: string, now = Date.now()): WorldPresence | null {
  const presence = players.get(userId);
  if (!presence || now - presence.updatedAt > PRESENCE_STALE_MS || presence.ws.readyState !== presence.ws.OPEN) return null;
  return presence;
}

export function findFreshWorldPresenceByUsername(username: string, now = Date.now()): WorldPresence | null {
  const normalized = username.trim().toLocaleLowerCase('en-US');
  for (const presence of players.values()) {
    if (presence.username.toLocaleLowerCase('en-US') !== normalized) continue;
    if (now - presence.updatedAt > PRESENCE_STALE_MS || presence.ws.readyState !== presence.ws.OPEN) return null;
    return presence;
  }
  return null;
}

export function resetWorldPresenceForTests(): void {
  players.clear();
  for (const timer of snapshotTimers.values()) clearTimeout(timer);
  snapshotTimers.clear();
}
