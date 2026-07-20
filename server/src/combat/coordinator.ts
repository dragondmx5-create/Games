import type { WebSocket } from 'ws';
import type { InventoryCommandResult, InventoryStacks } from '../inventory/types.js';
import { getFreshWorldPresence } from '../world/presence.js';
import { regionResourceProfileAt } from '../world/regionResourceProfiles.js';
import { getOrCreateWorldSeed } from '../world/service.js';
import { targetInsideAttackArc } from './domain.js';
import { COMBAT_ENEMIES, type CombatEnemyKind, type CombatRiskTier } from './catalog.js';
import { generateEnemySpawns, type EnemySpawnDefinition } from './layout.js';
import type { CombatClientMessage } from './protocol.js';
import {
  authorizeCombatAttack,
  damageWorldEnemy,
  claimWorldLootBag,
  damageCombatPlayer,
  getPlayerCombatState,
  listActiveLootBags,
  getWorldEnemyStates,
  type PlayerCombatSnapshot,
  type PublicLootBag,
} from './service.js';

const TICK_MS = 100;
const SNAPSHOT_MS = 250;
const ROOM_IDLE_MS = 60_000;
const MAX_RECENT_ATTACKS = 64;
const SESSION_MEMORY_MS = 60_000;
const ENEMY_LEASH_RADIUS = 28;
const MAX_WS_BUFFERED_BYTES = 256 * 1024;

interface EnemyRuntime extends EnemySpawnDefinition {
  hp: number;
  alive: boolean;
  respawnAt: number;
  attackReadyAt: number;
  generation: number;
  hitFlashUntil: number;
}

interface CombatSession {
  userId: string;
  username: string;
  ws: WebSocket;
  active: boolean;
  roomKey: string;
  player: PlayerCombatSnapshot;
  recentAttacks: Map<string, unknown>;
}

interface CombatRoom {
  key: string;
  worldSeed: number;
  rx: number;
  ry: number;
  riskTier: CombatRiskTier;
  enemies: Map<string, EnemyRuntime>;
  bags: Map<string, PublicLootBag>;
  sessions: Set<string>;
  lastUsedAt: number;
  lastSnapshotAt: number;
  lastTickAt: number;
  queue: Promise<void>;
}

export interface PublicCombatEnemy {
  id: string;
  kind: CombatEnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAt: string | null;
  hit: boolean;
  homeX: number;
  homeY: number;
}

function roomKey(rx: number, ry: number): string {
  return `${rx},${ry}`;
}

function sendJson(ws: WebSocket, value: unknown): void {
  if (ws.readyState !== ws.OPEN) return;
  if (ws.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
    ws.close(1013, 'client is too slow');
    return;
  }
  ws.send(JSON.stringify(value));
}

function publicEnemy(enemy: EnemyRuntime, now: number): PublicCombatEnemy {
  return {
    id: enemy.id,
    kind: enemy.kind,
    x: enemy.x,
    y: enemy.y,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    alive: enemy.alive,
    respawnAt: enemy.alive || enemy.respawnAt <= 0 ? null : new Date(enemy.respawnAt).toISOString(),
    hit: enemy.hitFlashUntil > now,
    homeX: enemy.homeX,
    homeY: enemy.homeY,
  };
}

function publicBag(bag: PublicLootBag): PublicLootBag {
  return { ...bag, items: { ...bag.items } };
}

interface SessionMemory {
  recentAttacks: Map<string, unknown>;
  expiresAt: number;
}

export class WorldCombatCoordinator {
  private readonly sessions = new Map<string, CombatSession>();
  private readonly sessionMemory = new Map<string, SessionMemory>();
  private readonly rooms = new Map<string, CombatRoom>();
  private readonly roomCreations = new Map<string, Promise<CombatRoom>>();
  private timer: NodeJS.Timeout | null = null;
  private worldSeedPromise: Promise<number> | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(Date.now()), TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sessions.clear();
    this.sessionMemory.clear();
    this.rooms.clear();
    this.roomCreations.clear();
  }

  async join(userId: string, username: string, ws: WebSocket, position: { rx: number; ry: number }): Promise<PlayerCombatSnapshot> {
    const player = await getPlayerCombatState(userId);
    const room = await this.getOrCreateRoom(position.rx, position.ry);
    const previous = this.sessions.get(userId);
    const remembered = previous
      ? { recentAttacks: previous.recentAttacks }
      : this.sessionMemory.get(userId);
    if (previous) this.leaveRoom(previous);
    this.sessionMemory.delete(userId);
    const session: CombatSession = {
      userId,
      username,
      ws,
      active: true,
      roomKey: room.key,
      player,
      recentAttacks: remembered?.recentAttacks ?? new Map(),
    };
    this.sessions.set(userId, session);
    room.sessions.add(userId);
    room.lastUsedAt = Date.now();
    sendJson(ws, { type: 'combat_state', player });
    this.sendRoomSnapshot(room, Date.now());
    return player;
  }

  leave(userId: string, ws: WebSocket): void {
    const session = this.sessions.get(userId);
    if (!session || session.ws !== ws) return;
    this.leaveRoom(session);
    this.sessionMemory.set(userId, {
      recentAttacks: session.recentAttacks,
      expiresAt: Date.now() + SESSION_MEMORY_MS,
    });
    this.sessions.delete(userId);
  }

  setActive(userId: string, ws: WebSocket, active: boolean): void {
    const session = this.sessions.get(userId);
    if (!session || session.ws !== ws) return;
    session.active = active;
    if (!active) sendJson(ws, { type: 'combat_snapshot', enemies: [], bags: [] });
  }

  canMove(userId: string, ws: WebSocket): boolean {
    const session = this.sessions.get(userId);
    return !!session && session.ws === ws && session.active && !session.player.dead;
  }

  isHiddenInstance(userId: string): boolean {
    const session = this.sessions.get(userId);
    return !!session && !session.active && !session.player.dead;
  }

  updatePlayerState(userId: string, player: PlayerCombatSnapshot): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.player = player;
    sendJson(session.ws, { type: 'combat_state', player });
  }

  handleMessage(userId: string, ws: WebSocket, message: CombatClientMessage): void {
    const session = this.sessions.get(userId);
    if (!session || session.ws !== ws || !session.active) return;
    if (message.type === 'attack') {
      this.enqueueSessionRoom(session, () => this.handleAttack(session, message));
    } else {
      this.enqueueSessionRoom(session, () => this.handleClaimBag(session, message.bagId, message.claimId));
    }
  }

  private leaveRoom(session: CombatSession): void {
    const room = this.rooms.get(session.roomKey);
    room?.sessions.delete(session.userId);
    if (room) room.lastUsedAt = Date.now();
  }

  private async getWorldSeed(): Promise<number> {
    this.worldSeedPromise ??= getOrCreateWorldSeed();
    return this.worldSeedPromise;
  }

  private async createRoom(rx: number, ry: number): Promise<CombatRoom> {
    const key = roomKey(rx, ry);
    const worldSeed = await this.getWorldSeed();
    const riskTier = regionResourceProfileAt(rx, ry).riskTier;
    const now = Date.now();
    const spawns = generateEnemySpawns(worldSeed, rx, ry, riskTier);
    const persisted = await getWorldEnemyStates(
      worldSeed,
      rx,
      ry,
      new Map(spawns.map((spawn) => [spawn.id, spawn.maxHp])),
    );
    const enemies = new Map<string, EnemyRuntime>();
    for (const spawn of spawns) {
      const state = persisted.get(spawn.id);
      const alive = state?.alive ?? true;
      const respawnAt = state?.respawnAt ? new Date(state.respawnAt).getTime() : 0;
      enemies.set(spawn.id, {
        ...spawn,
        hp: state?.hp ?? spawn.maxHp,
        alive,
        respawnAt,
        attackReadyAt: alive ? now + 500 : respawnAt + 500,
        generation: state?.generation ?? 0,
        hitFlashUntil: 0,
      });
    }
    const bags = new Map((await listActiveLootBags(rx, ry)).map((bag) => [bag.id, bag]));
    const room: CombatRoom = {
      key,
      worldSeed,
      rx,
      ry,
      riskTier,
      enemies,
      bags,
      sessions: new Set(),
      lastUsedAt: now,
      lastSnapshotAt: 0,
      lastTickAt: now,
      queue: Promise.resolve(),
    };
    this.rooms.set(key, room);
    return room;
  }

  private getOrCreateRoom(rx: number, ry: number): Promise<CombatRoom> {
    const key = roomKey(rx, ry);
    const existing = this.rooms.get(key);
    if (existing) return Promise.resolve(existing);
    const pending = this.roomCreations.get(key);
    if (pending) return pending;
    const creation = this.createRoom(rx, ry).finally(() => {
      if (this.roomCreations.get(key) === creation) this.roomCreations.delete(key);
    });
    this.roomCreations.set(key, creation);
    return creation;
  }

  private enqueueSessionRoom(session: CombatSession, task: () => Promise<void>): void {
    const room = this.rooms.get(session.roomKey);
    if (!room) return;
    room.queue = room.queue.then(task).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'combat command failed';
      sendJson(session.ws, { type: 'combat_error', error: message });
    });
  }

  private syncSessionRoom(session: CombatSession): void {
    const presence = getFreshWorldPresence(session.userId);
    if (!presence || !session.active) return;
    const nextKey = roomKey(presence.rx, presence.ry);
    if (nextKey === session.roomKey) return;
    const previous = this.rooms.get(session.roomKey);
    previous?.sessions.delete(session.userId);
    void this.getOrCreateRoom(presence.rx, presence.ry).then((room) => {
      const current = this.sessions.get(session.userId);
      const freshPresence = getFreshWorldPresence(session.userId);
      if (!current || current !== session || !freshPresence || roomKey(freshPresence.rx, freshPresence.ry) !== room.key) return;
      current.roomKey = room.key;
      room.sessions.add(current.userId);
      this.sendRoomSnapshot(room, Date.now());
    }).catch((error: unknown) => console.error('Failed to enter combat room', error));
  }

  private tick(now: number): void {
    for (const [userId, memory] of this.sessionMemory) if (memory.expiresAt <= now) this.sessionMemory.delete(userId);
    for (const session of this.sessions.values()) this.syncSessionRoom(session);
    for (const [key, room] of this.rooms) {
      if (room.sessions.size === 0) {
        if (now - room.lastUsedAt > ROOM_IDLE_MS) this.rooms.delete(key);
        continue;
      }
      const dt = Math.max(0.016, Math.min(0.25, (now - room.lastTickAt) / 1_000));
      room.lastTickAt = now;
      this.tickRoom(room, dt, now);
      if (now - room.lastSnapshotAt >= SNAPSHOT_MS) this.sendRoomSnapshot(room, now);
    }
  }

  private tickRoom(room: CombatRoom, dt: number, now: number): void {
    const candidates = [...room.sessions]
      .map((userId) => ({ session: this.sessions.get(userId), presence: getFreshWorldPresence(userId) }))
      .filter((entry): entry is { session: CombatSession; presence: NonNullable<ReturnType<typeof getFreshWorldPresence>> } =>
        !!entry.session && !!entry.presence && entry.session.active && !entry.session.player.dead,
      );

    for (const enemy of room.enemies.values()) {
      const definition = COMBAT_ENEMIES[enemy.kind];
      if (!enemy.alive) {
        if (now >= enemy.respawnAt) {
          enemy.alive = true;
          enemy.hp = enemy.maxHp;
          enemy.x = enemy.homeX;
          enemy.y = enemy.homeY;
          enemy.generation += 1;
          enemy.respawnAt = 0;
          enemy.attackReadyAt = now + 800;
        }
        continue;
      }
      let target: (typeof candidates)[number] | null = null;
      let targetDistance = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        const distance = Math.hypot(candidate.presence.x - enemy.x, candidate.presence.y - enemy.y);
        if (distance < targetDistance) {
          target = candidate;
          targetDistance = distance;
        }
      }
      if (!target || targetDistance > definition.aggroRange) {
        const homeDistance = Math.hypot(enemy.homeX - enemy.x, enemy.homeY - enemy.y);
        if (homeDistance > 2) {
          const angle = Math.atan2(enemy.homeY - enemy.y, enemy.homeX - enemy.x);
          const step = Math.min(homeDistance, definition.speed * 0.35 * dt);
          enemy.x += Math.cos(angle) * step;
          enemy.y += Math.sin(angle) * step;
        }
        continue;
      }
      if (targetDistance > definition.attackRange) {
        const angle = Math.atan2(target.presence.y - enemy.y, target.presence.x - enemy.x);
        const step = Math.min(Math.max(0, targetDistance - definition.attackRange), definition.speed * dt);
        const nextX = enemy.x + Math.cos(angle) * step;
        const nextY = enemy.y + Math.sin(angle) * step;
        const fromHome = Math.hypot(nextX - enemy.homeX, nextY - enemy.homeY);
        if (fromHome <= ENEMY_LEASH_RADIUS) {
          enemy.x = nextX;
          enemy.y = nextY;
        }
      } else if (now >= enemy.attackReadyAt) {
        enemy.attackReadyAt = now + definition.attackCooldownMs;
        const targetSession = target.session;
        room.queue = room.queue
          .then(async () => {
            const latest = this.sessions.get(targetSession.userId);
            const presence = getFreshWorldPresence(targetSession.userId);
            if (!latest || latest !== targetSession || !presence || latest.player.dead || latest.roomKey !== room.key) return;
            const result = await damageCombatPlayer(targetSession.userId, definition.damage, room.riskTier, {
              rx: room.rx,
              ry: room.ry,
              x: presence.x,
              y: presence.y,
            });
            latest.player = result.player;
            sendJson(latest.ws, { type: 'player_damaged', damage: result.damage, player: result.player });
            if (result.death) {
              if (result.death.bag) room.bags.set(result.death.bag.id, result.death.bag);
              sendJson(latest.ws, {
                type: 'player_died',
                player: result.player,
                riskTier: result.death.riskTier,
                deathToken: result.death.token,
                bag: result.death.bag,
                inventory: result.death.inventory.inventory,
              });
            }
          })
          .catch((error: unknown) => console.error('Failed to settle enemy damage', error));
      }
    }
  }

  private async handleAttack(session: CombatSession, message: Extract<CombatClientMessage, { type: 'attack' }>): Promise<void> {
    const cached = session.recentAttacks.get(message.attackId);
    if (cached) {
      sendJson(session.ws, cached);
      return;
    }
    const room = this.rooms.get(session.roomKey);
    const presence = getFreshWorldPresence(session.userId);
    if (!room || !presence || session.player.dead) return;
    const now = Date.now();
    const authorization = await authorizeCombatAttack(session.userId, message.ability, new Date(now));
    const profile = authorization.profile;
    session.player = authorization.player;

    const hits: Array<{ enemyId: string; damage: number; killed: boolean; reward?: InventoryStacks; xpGained?: number }> = [];
    let rewardInventory: InventoryCommandResult | null = null;
    for (const enemy of room.enemies.values()) {
      if (!enemy.alive || !targetInsideAttackArc(presence.x, presence.y, message.facing, enemy.x, enemy.y, profile.range, profile.arc)) continue;
      const settled = await damageWorldEnemy(session.userId, {
        enemyId: enemy.id,
        kind: enemy.kind,
        worldSeed: room.worldSeed,
        rx: room.rx,
        ry: room.ry,
        expectedGeneration: enemy.generation,
        maxHp: enemy.maxHp,
        damage: profile.damage,
        respawnMs: COMBAT_ENEMIES[enemy.kind].respawnMs,
      });
      enemy.generation = settled.enemy.generation;
      enemy.hp = settled.enemy.hp;
      enemy.alive = settled.enemy.alive;
      enemy.respawnAt = settled.enemy.respawnAt ? new Date(settled.enemy.respawnAt).getTime() : 0;
      enemy.attackReadyAt = enemy.alive ? enemy.attackReadyAt : enemy.respawnAt + 500;
      if (settled.damage <= 0) continue;
      enemy.hitFlashUntil = now + 180;
      const hit: { enemyId: string; damage: number; killed: boolean; reward?: InventoryStacks; xpGained?: number } = {
        enemyId: enemy.id,
        damage: settled.damage,
        killed: settled.killed,
      };
      if (settled.killed) {
        hit.reward = settled.reward;
        hit.xpGained = settled.xpGained;
        rewardInventory = settled.inventory;
      }
      session.player = settled.player;
      hits.push(hit);
    }
    const response = {
      type: 'combat_result',
      attackId: message.attackId,
      hits,
      player: session.player,
      inventory: rewardInventory?.inventory ?? null,
    };
    session.recentAttacks.set(message.attackId, response);
    while (session.recentAttacks.size > MAX_RECENT_ATTACKS) {
      const oldest = session.recentAttacks.keys().next().value as string | undefined;
      if (!oldest) break;
      session.recentAttacks.delete(oldest);
    }
    sendJson(session.ws, response);
  }

  private async handleClaimBag(session: CombatSession, bagId: string, claimId: string): Promise<void> {
    const room = this.rooms.get(session.roomKey);
    if (!room || session.player.dead) return;
    const result = await claimWorldLootBag(session.userId, bagId, claimId);
    room.bags.delete(bagId);
    sendJson(session.ws, { type: 'bag_claimed', bagId, inventory: result.inventory.inventory });
  }

  private sendRoomSnapshot(room: CombatRoom, now: number): void {
    room.lastSnapshotAt = now;
    const message = {
      type: 'combat_snapshot',
      enemies: [...room.enemies.values()].map((enemy) => publicEnemy(enemy, now)),
      bags: [...room.bags.values()].map(publicBag),
    };
    for (const userId of room.sessions) {
      const session = this.sessions.get(userId);
      if (session?.active) sendJson(session.ws, message);
    }
  }
}

export const worldCombatCoordinator = new WorldCombatCoordinator();
