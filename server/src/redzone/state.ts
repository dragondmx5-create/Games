// Server-authoritative Red Zone state: one shared, in-memory world (resets
// on server restart — see CLAUDE.md's Red Zone "explicitly cut from v1"
// list), one Map of connected players, a fixed-rate tick loop.
//
// Anti-cheat by construction, not just validation: clients only ever send
// a *movement intent* (a direction vector), never a position — the server
// is the sole author of every player's x/y, so there's no "client claims
// it teleported" case to reject in the first place. Attacks are the same
// idea: a client requests "I'm attacking," the server decides who that
// actually hits via combat.ts's canHit().
import type { WebSocket } from 'ws';
import { generateRedZoneWorld, isWalkable, RedZoneWorld, TILE_PX } from './world.js';
import { canHit, REDZONE_PLAYER, REDZONE_WEAPON } from './combat.js';
import { loadRedZoneBalance, loadRedZoneVault, settleKill } from './persistence.js';

export const world: RedZoneWorld = generateRedZoneWorld();

const TICK_HZ = 15;
const TICK_DT = 1 / TICK_HZ;
const RESPAWN_DELAY_MS = 3000;

type Dir = 'down' | 'up' | 'side';

export interface RedZonePlayerState {
  userId: string;
  username: string;
  ws: WebSocket;
  x: number;
  y: number;
  hp: number;
  crystals: number;
  dir: Dir;
  flipX: boolean;
  facing: number; // radians, last movement direction — also the attack aim
  moving: boolean;
  moveIntent: { dx: number; dy: number }; // last received input axes, each -1..1
  attackCooldown: number;
  alive: boolean;
}

const players = new Map<string, RedZonePlayerState>();
const pendingJoins = new Map<string, WebSocket>();
let vaultCrystals = 0;
let tickHandle: ReturnType<typeof setInterval> | null = null;

let vaultLoad: Promise<void> | null = null;

function ensureVaultLoaded(): Promise<void> {
  if (!vaultLoad) {
    vaultLoad = loadRedZoneVault()
      .then((balance) => {
        vaultCrystals = balance;
      })
      .catch((error) => {
        vaultLoad = null; // allow the next connection to retry a transient DB failure
        throw error;
      });
  }
  return vaultLoad;
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: unknown): void {
  const json = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(json);
  }
}

export async function joinRedZone(userId: string, username: string, ws: WebSocket): Promise<boolean> {
  // The latest connection attempt wins even if DB reads complete out of
  // order. Closing while the read is pending removes this marker.
  pendingJoins.set(userId, ws);
  await ensureVaultLoaded();
  const crystals = await loadRedZoneBalance(userId);
  if (pendingJoins.get(userId) !== ws || ws.readyState !== ws.OPEN) return false;
  pendingJoins.delete(userId);

  const existing = players.get(userId);
  if (existing && existing.ws !== ws) existing.ws.close(4001, 'session replaced');

  const state: RedZonePlayerState = {
    userId,
    username,
    ws,
    x: world.spawn.x,
    y: world.spawn.y,
    hp: REDZONE_PLAYER.maxHp,
    crystals,
    dir: 'down',
    flipX: false,
    facing: 0,
    moving: false,
    moveIntent: { dx: 0, dy: 0 },
    attackCooldown: 0,
    alive: true,
  };
  players.set(userId, state);

  send(ws, {
    type: 'init',
    selfId: userId,
    world: { w: world.w, h: world.h, tiles: Array.from(world.tiles), floorVariant: Array.from(world.floorVariant) },
    spawn: world.spawn,
    weapon: REDZONE_WEAPON,
    maxHp: REDZONE_PLAYER.maxHp,
    vault: vaultCrystals,
  });

  ensureTickLoop();
  return true;
}

export function leaveRedZone(userId: string, ws: WebSocket): void {
  if (pendingJoins.get(userId) === ws) pendingJoins.delete(userId);
  // only remove the entry if it still belongs to the socket that closed —
  // joinRedZone's takeover closes the OLD socket after the NEW state is
  // already in the map, and that close event must not delete the new
  // session (it would turn the reconnected player into a ghost and could
  // stop the tick loop with a live socket attached)
  const current = players.get(userId);
  if (!current || current.ws !== ws) return;
  players.delete(userId);
  if (players.size === 0) stopTickLoop();
}

export function handleMoveIntent(userId: string, ws: WebSocket, dx: number, dy: number): void {
  const p = players.get(userId);
  if (!p || p.ws !== ws) return;
  // clamp to a unit-ish vector server-side — never trust the magnitude a
  // client claims (that would just be a disguised speed hack)
  const len = Math.hypot(dx, dy);
  p.moveIntent = len > 1 ? { dx: dx / len, dy: dy / len } : { dx, dy };
}

export function handleAttack(userId: string, ws: WebSocket): void {
  const attacker = players.get(userId);
  if (!attacker || attacker.ws !== ws || !attacker.alive || attacker.attackCooldown > 0) return;
  attacker.attackCooldown = REDZONE_WEAPON.cooldown;

  for (const target of players.values()) {
    if (target.userId === userId || !target.alive) continue;
    if (!canHit(attacker.x, attacker.y, attacker.facing, target.x, target.y)) continue;
    target.hp -= REDZONE_WEAPON.damage;
    if (target.hp <= 0) void killPlayer(target, attacker);
  }
}

async function killPlayer(victim: RedZonePlayerState, killer: RedZonePlayerState): Promise<void> {
  victim.alive = false;
  victim.hp = 0;

  try {
    const settlement = await settleKill(killer.userId, victim.userId);
    vaultCrystals = Math.max(vaultCrystals, settlement.vaultBalance);

    const currentKiller = players.get(killer.userId);
    if (currentKiller) currentKiller.crystals = settlement.killerBalance;
    const currentVictim = players.get(victim.userId);
    if (currentVictim) currentVictim.crystals = 0;

    if (players.get(victim.userId) === victim) {
      send(victim.ws, { type: 'youDied', killedBy: killer.username, lost: settlement.lost });
      setTimeout(() => {
        if (players.get(victim.userId) !== victim) return;
        victim.x = world.spawn.x;
        victim.y = world.spawn.y;
        victim.hp = REDZONE_PLAYER.maxHp;
        victim.moveIntent = { dx: 0, dy: 0 };
        victim.moving = false;
        victim.alive = true;
      }, RESPAWN_DELAY_MS);
    }
  } catch (error) {
    console.error('[redzone] kill settlement failed:', error);
    // Do not leave a connected player permanently dead because persistence
    // failed. No balances were changed in memory before the transaction.
    if (players.get(victim.userId) === victim) {
      victim.hp = 1;
      victim.alive = true;
    }
  }
}

function ensureTickLoop(): void {
  if (tickHandle) return;
  tickHandle = setInterval(tick, 1000 / TICK_HZ);
}

function stopTickLoop(): void {
  if (!tickHandle) return;
  clearInterval(tickHandle);
  tickHandle = null;
}

function tick(): void {
  for (const p of players.values()) {
    p.attackCooldown = Math.max(0, p.attackCooldown - TICK_DT);
    if (!p.alive) continue;

    const { dx: idx, dy: idy } = p.moveIntent;
    p.moving = Math.hypot(idx, idy) > 0.01;
    if (p.moving) {
      p.facing = Math.atan2(idy, idx);
      if (Math.abs(idy) >= Math.abs(idx)) p.dir = idy >= 0 ? 'down' : 'up';
      else {
        p.dir = 'side';
        p.flipX = idx < 0;
      }
      const nx = p.x + idx * REDZONE_PLAYER.speed * TICK_DT;
      const ny = p.y + idy * REDZONE_PLAYER.speed * TICK_DT;
      if (isWalkable(world, Math.floor(nx / TILE_PX), Math.floor(p.y / TILE_PX))) p.x = nx;
      if (isWalkable(world, Math.floor(p.x / TILE_PX), Math.floor(ny / TILE_PX))) p.y = ny;
    }
  }

  broadcast({
    type: 'snapshot',
    vault: vaultCrystals,
    players: Array.from(players.values()).map((p) => ({
      id: p.userId,
      username: p.username,
      x: p.x,
      y: p.y,
      hp: p.hp,
      crystals: p.crystals,
      dir: p.dir,
      flipX: p.flipX,
      facing: p.facing,
      moving: p.moving,
      alive: p.alive,
    })),
  });
}
