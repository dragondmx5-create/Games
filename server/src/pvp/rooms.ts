import type { WebSocket } from 'ws';
import { attackProfile, bestArmorReduction, reduceIncomingDamage, targetInsideAttackArc } from '../combat/domain.js';
import type { InventorySnapshot } from '../inventory/types.js';
import { isWalkable, TILE_PX, type RedZoneWorld } from '../redzone/world.js';
import { canExitPvpFromLiveState, PVP_EXTRACTION_RADIUS, pvpArenaForRoom } from './arena.js';
import {
  claimPvpRoomLease,
  persistPvpHitPoints,
  persistPvpMotion,
  registerPvpLiveExitGuard,
  releasePvpRoomLease,
  renewPvpRoomLease,
  settlePvpDeath,
  type PvpSessionRow,
} from './service.js';

const TICK_HZ = 15;
const TICK_DT = 1 / TICK_HZ;
const PLAYER_SPEED = 70;
const PLAYER_RADIUS = 5;
const PERSIST_INTERVAL_MS = 1_000;
const LEASE_RENEW_INTERVAL_MS = 10_000;
const MAX_WS_BUFFERED_BYTES = 256 * 1024;

type Dir = 'down' | 'up' | 'side';

interface PvpPlayerState {
  sessionId: string;
  userId: string;
  username: string;
  ws: WebSocket;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: number;
  dir: Dir;
  flipX: boolean;
  moving: boolean;
  moveIntent: { dx: number; dy: number };
  basicReadyAt: number;
  abilityReadyAt: number;
  inventory: InventorySnapshot;
  armorReduction: number;
  alive: boolean;
  settling: boolean;
  lastPersistedAt: number;
  lastMovedAt: number;
}

interface PvpRoom {
  key: string;
  riskTier: 'fracture' | 'lost';
  world: RedZoneWorld;
  players: Map<string, PvpPlayerState>;
  tickHandle: ReturnType<typeof setInterval>;
  leaseHandle: ReturnType<typeof setInterval>;
}

const rooms = new Map<string, PvpRoom>();
const roomCreations = new Map<string, Promise<PvpRoom>>();

registerPvpLiveExitGuard((sessionId) => {
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (player.sessionId !== sessionId) continue;
      return canExitPvpFromLiveState(room.key, player);
    }
  }
  return false;
});

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== ws.OPEN) return;
  if (ws.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
    ws.close(1013, 'client is too slow');
    return;
  }
  ws.send(JSON.stringify(payload));
}

function pointWalkable(world: RedZoneWorld, x: number, y: number): boolean {
  const points = [[x, y], [x - PLAYER_RADIUS, y - PLAYER_RADIUS], [x + PLAYER_RADIUS, y - PLAYER_RADIUS], [x - PLAYER_RADIUS, y + PLAYER_RADIUS], [x + PLAYER_RADIUS, y + PLAYER_RADIUS]];
  return points.every(([px, py]) => isWalkable(world, Math.floor(px / TILE_PX), Math.floor(py / TILE_PX)));
}

function roomSnapshot(room: PvpRoom): unknown {
  return {
    type: 'snapshot',
    riskTier: room.riskTier,
    players: [...room.players.values()].map((player) => ({
      id: player.userId,
      username: player.username,
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      dir: player.dir,
      flipX: player.flipX,
      facing: player.facing,
      moving: player.moving,
      alive: player.alive,
    })),
  };
}

function broadcast(room: PvpRoom): void {
  const snapshot = roomSnapshot(room);
  for (const player of room.players.values()) send(player.ws, snapshot);
}

function persistPlayer(player: PvpPlayerState): void {
  player.lastPersistedAt = Date.now();
  void persistPvpMotion(player.sessionId, {
    x: player.x,
    y: player.y,
    facing: player.facing,
    hp: player.hp,
    moving: player.moving,
    basicReadyAt: player.basicReadyAt > Date.now() ? new Date(player.basicReadyAt) : null,
    abilityReadyAt: player.abilityReadyAt > Date.now() ? new Date(player.abilityReadyAt) : null,
  }).then((persisted) => {
    if (!persisted && player.ws.readyState === player.ws.OPEN) player.ws.close(4009, 'PvP session is no longer active');
  }).catch(() => {
    if (player.ws.readyState === player.ws.OPEN) player.ws.close(1011, 'authoritative PvP persistence failed');
  });
}

function tickRoom(room: PvpRoom): void {
  const now = Date.now();
  for (const player of room.players.values()) {
    if (!player.alive || player.settling) continue;
    const { dx, dy } = player.moveIntent;
    player.moving = Math.hypot(dx, dy) > 0.01;
    if (player.moving) {
      player.lastMovedAt = now;
      player.facing = Math.atan2(dy, dx);
      if (Math.abs(dy) >= Math.abs(dx)) player.dir = dy >= 0 ? 'down' : 'up';
      else { player.dir = 'side'; player.flipX = dx < 0; }
      const nx = player.x + dx * PLAYER_SPEED * TICK_DT;
      const ny = player.y + dy * PLAYER_SPEED * TICK_DT;
      if (pointWalkable(room.world, nx, player.y)) player.x = nx;
      if (pointWalkable(room.world, player.x, ny)) player.y = ny;
    }
    if (now - player.lastPersistedAt >= PERSIST_INTERVAL_MS) persistPlayer(player);
  }
  broadcast(room);
}

function stopRoom(room: PvpRoom): void {
  clearInterval(room.tickHandle);
  clearInterval(room.leaseHandle);
  if (rooms.get(room.key) === room) rooms.delete(room.key);
  void releasePvpRoomLease(room.key).catch(() => {
    // Best effort only. Ownership is scoped by ownerId and otherwise expires.
  });
}

async function createRoom(session: PvpSessionRow): Promise<PvpRoom> {
  await claimPvpRoomLease(session.roomKey);
  const world = pvpArenaForRoom(session.roomKey);
  const room: PvpRoom = {
    key: session.roomKey,
    riskTier: session.riskTier,
    world,
    players: new Map(),
    tickHandle: setInterval(() => tickRoom(room), 1000 / TICK_HZ),
    leaseHandle: setInterval(() => {
      void renewPvpRoomLease(room.key).then((owned) => {
        if (owned) return;
        for (const player of room.players.values()) player.ws.close(1013, 'PvP room ownership moved');
        stopRoom(room);
      }).catch(() => {
        for (const player of room.players.values()) player.ws.close(1011, 'PvP room lease renewal failed');
        stopRoom(room);
      });
    }, LEASE_RENEW_INTERVAL_MS),
  };
  rooms.set(room.key, room);
  return room;
}

async function getOrCreateRoom(session: PvpSessionRow): Promise<PvpRoom> {
  const existing = rooms.get(session.roomKey);
  if (existing) return existing;
  const pending = roomCreations.get(session.roomKey);
  if (pending) return pending;
  const creation = createRoom(session).finally(() => {
    if (roomCreations.get(session.roomKey) === creation) roomCreations.delete(session.roomKey);
  });
  roomCreations.set(session.roomKey, creation);
  return creation;
}

export async function joinPvpRoom(session: PvpSessionRow, username: string, ws: WebSocket): Promise<boolean> {
  if (session.status === 'death_pending') {
    send(ws, { type: 'death_pending', sessionId: session.id, deathToken: session.deathToken, riskTier: session.riskTier });
    ws.close(4003, 'authoritative death return required');
    return false;
  }
  const room = await getOrCreateRoom(session);
  const existing = room.players.get(session.userId);
  if (existing && existing.ws !== ws) existing.ws.close(4001, 'PvP connection superseded');
  const inventory = session.carriedSnapshot as InventorySnapshot;
  const profile = attackProfile(inventory.equippedWeapon, false);
  const player: PvpPlayerState = {
    sessionId: session.id,
    userId: session.userId,
    username,
    ws,
    x: pointWalkable(room.world, session.playerX, session.playerY) ? session.playerX : room.world.spawn.x,
    y: pointWalkable(room.world, session.playerX, session.playerY) ? session.playerY : room.world.spawn.y,
    hp: session.hp,
    maxHp: session.maxHp,
    facing: session.playerFacing,
    dir: 'down',
    flipX: false,
    moving: false,
    moveIntent: { dx: 0, dy: 0 },
    basicReadyAt: session.basicReadyAt?.getTime() ?? 0,
    abilityReadyAt: session.abilityReadyAt?.getTime() ?? 0,
    inventory,
    armorReduction: bestArmorReduction(inventory),
    alive: session.hp > 0,
    settling: false,
    lastPersistedAt: Date.now(),
    lastMovedAt: session.lastMoveAt.getTime(),
  };
  room.players.set(session.userId, player);
  send(ws, {
    type: 'init',
    selfId: session.userId,
    sessionId: session.id,
    roomKey: session.roomKey,
    riskTier: session.riskTier,
    world: { w: room.world.w, h: room.world.h, tiles: Array.from(room.world.tiles), floorVariant: Array.from(room.world.floorVariant) },
    spawn: { x: player.x, y: player.y },
    extraction: { x: room.world.spawn.x, y: room.world.spawn.y, radius: PVP_EXTRACTION_RADIUS },
    weapon: { range: profile.range, arc: profile.arc, cooldown: profile.cooldownMs / 1000 },
    maxHp: player.maxHp,
    inventory,
  });
  broadcast(room);
  return true;
}

export function leavePvpRoom(userId: string, ws: WebSocket): void {
  for (const room of rooms.values()) {
    const player = room.players.get(userId);
    if (!player || player.ws !== ws) continue;
    persistPlayer(player);
    room.players.delete(userId);
    broadcast(room);
    if (room.players.size === 0) stopRoom(room);
    return;
  }
}

export function setPvpMoveIntent(userId: string, ws: WebSocket, dx: number, dy: number): void {
  for (const room of rooms.values()) {
    const player = room.players.get(userId);
    if (!player || player.ws !== ws || !player.alive || player.settling) continue;
    const length = Math.hypot(dx, dy);
    player.moveIntent = length > 1 ? { dx: dx / length, dy: dy / length } : { dx, dy };
    return;
  }
}

export function handlePvpAttack(userId: string, ws: WebSocket, ability: boolean, facing: number): void {
  for (const room of rooms.values()) {
    const attacker = room.players.get(userId);
    if (!attacker || attacker.ws !== ws || !attacker.alive || attacker.settling) continue;
    if (Math.hypot(attacker.x - room.world.spawn.x, attacker.y - room.world.spawn.y) <= PVP_EXTRACTION_RADIUS) return;
    const now = Date.now();
    const readyAt = ability ? attacker.abilityReadyAt : attacker.basicReadyAt;
    if (now < readyAt) return;
    const profile = attackProfile(attacker.inventory.equippedWeapon, ability);
    if (ability) attacker.abilityReadyAt = now + profile.cooldownMs;
    else attacker.basicReadyAt = now + profile.cooldownMs;
    attacker.facing = facing;
    persistPlayer(attacker);

    for (const target of room.players.values()) {
      if (target.userId === attacker.userId || !target.alive || target.settling) continue;
      if (Math.hypot(target.x - room.world.spawn.x, target.y - room.world.spawn.y) <= PVP_EXTRACTION_RADIUS) continue;
      if (!targetInsideAttackArc(attacker.x, attacker.y, attacker.facing, target.x, target.y, profile.range, profile.arc)) continue;
      const damage = reduceIncomingDamage(profile.damage, target.armorReduction);
      target.hp = Math.max(0, target.hp - damage);
      send(target.ws, { type: 'damaged', damage, hp: target.hp, attackerId: attacker.userId });
      if (target.hp > 0) {
        void persistPvpHitPoints(target.sessionId, target.hp).then((persisted) => {
          if (persisted) return;
          target.settling = true;
          target.ws.close(4009, 'PvP session is no longer active');
        }).catch(() => {
          // Never invent a local rollback after an uncertain database write.
          // Disconnect and recover from the durable session instead.
          target.settling = true;
          target.ws.close(1011, 'authoritative damage persistence failed');
        });
        continue;
      }
      target.alive = false;
      target.settling = true;
      target.moveIntent = { dx: 0, dy: 0 };
      void settlePvpDeath(target.sessionId, attacker.sessionId).then((receipt) => {
        target.inventory = receipt.victimInventory;
        attacker.inventory = receipt.killerInventory;
        attacker.armorReduction = bestArmorReduction(attacker.inventory);
        send(target.ws, { type: 'youDied', ...receipt });
        send(attacker.ws, { type: 'killSettled', ...receipt });
        broadcast(room);
      }).catch((error: unknown) => {
        // The transaction is the only authority. On an uncertain failure the
        // victim reconnects from durable state; local HP/rewards are not rolled back.
        target.ws.close(1011, 'authoritative death settlement failed');
        send(attacker.ws, { type: 'error', message: error instanceof Error ? error.message : 'death settlement failed' });
      });
    }
    return;
  }
}

export function stopAllPvpRooms(): void {
  for (const room of [...rooms.values()]) {
    for (const player of room.players.values()) player.ws.close(1001, 'server shutting down');
    stopRoom(room);
  }
}

export function resetPvpRoomsForTests(): void {
  for (const room of [...rooms.values()]) stopRoom(room);
}
