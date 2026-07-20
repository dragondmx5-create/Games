import { worldPresenceWebSocketUrl, type ServerCombatPlayerSnapshot, type ServerInventorySnapshot, type ServerItemId } from './api';
import { setConnection } from './ui/events';

export interface RemoteWorldPlayer {
  userId: string;
  username: string;
  rx: number;
  ry: number;
  x: number;
  y: number;
}

export interface AuthoritativeWorldPosition {
  rx: number;
  ry: number;
  x: number;
  y: number;
}

export interface AuthoritativeEnemySnapshot {
  id: string;
  kind: 'bug' | 'shellbug' | 'wallworm' | 'spitter';
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

export interface AuthoritativeLootBagSnapshot {
  id: string;
  ownerUserId: string;
  rx: number;
  ry: number;
  x: number;
  y: number;
  items: Partial<Record<ServerItemId, number>>;
  expiresAt: string;
}

export interface CombatHitResult {
  enemyId: string;
  damage: number;
  killed: boolean;
  reward?: Partial<Record<ServerItemId, number>>;
  xpGained?: number;
}

export interface WorldCombatHandlers {
  onCombatSnapshot: (enemies: AuthoritativeEnemySnapshot[], bags: AuthoritativeLootBagSnapshot[]) => void;
  onCombatPlayer: (player: ServerCombatPlayerSnapshot) => void;
  onCombatResult: (hits: CombatHitResult[], player: ServerCombatPlayerSnapshot, inventory: ServerInventorySnapshot | null) => void;
  onPlayerDamaged: (damage: number, player: ServerCombatPlayerSnapshot) => void;
  onPlayerDied: (payload: {
    player: ServerCombatPlayerSnapshot;
    riskTier: 'sanctuary' | 'frontier' | 'fracture' | 'lost';
    deathToken: string;
    bag: AuthoritativeLootBagSnapshot | null;
    inventory: ServerInventorySnapshot;
  }) => void;
  onBagClaimed: (bagId: string, inventory: ServerInventorySnapshot) => void;
  onCombatError?: (message: string) => void;
}

interface SnapshotMessage {
  type: 'snapshot';
  players: RemoteWorldPlayer[];
}

interface WelcomeMessage {
  type: 'welcome';
  self: AuthoritativeWorldPosition;
}

interface CombatSnapshotMessage {
  type: 'combat_snapshot';
  enemies: AuthoritativeEnemySnapshot[];
  bags: AuthoritativeLootBagSnapshot[];
}

interface CombatStateMessage {
  type: 'combat_state';
  player: ServerCombatPlayerSnapshot;
}

interface CombatResultMessage {
  type: 'combat_result';
  hits: CombatHitResult[];
  player: ServerCombatPlayerSnapshot;
  inventory: ServerInventorySnapshot | null;
}

interface PlayerDamagedMessage {
  type: 'player_damaged';
  damage: number;
  player: ServerCombatPlayerSnapshot;
}

interface PlayerDiedMessage {
  type: 'player_died';
  player: ServerCombatPlayerSnapshot;
  riskTier: 'sanctuary' | 'frontier' | 'fracture' | 'lost';
  deathToken: string;
  bag: AuthoritativeLootBagSnapshot | null;
  inventory: ServerInventorySnapshot;
}

interface BagClaimedMessage {
  type: 'bag_claimed';
  bagId: string;
  inventory: ServerInventorySnapshot;
}

interface CombatErrorMessage {
  type: 'combat_error';
  error: string;
}

type ServerMessage = SnapshotMessage | WelcomeMessage | CombatSnapshotMessage | CombatStateMessage | CombatResultMessage | PlayerDamagedMessage | PlayerDiedMessage | BagClaimedMessage | CombatErrorMessage;


export function reconnectDelayMs(attempt: number, random = Math.random): number {
  const base = Math.min(15_000, 1_000 * 2 ** Math.max(0, Math.min(6, attempt)));
  return Math.round(base * (0.75 + random() * 0.5));
}

function commandId(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`;
}

export class WorldPresenceClient {
  private ws: WebSocket | null = null;
  private seq = 0;
  private lastSend = 0;
  private reconnectTimer: number | null = null;
  private stopped = false;
  private active = true;
  private initialResolve: ((position: AuthoritativeWorldPosition) => void) | null = null;
  private initialReject: ((error: Error) => void) | null = null;
  private initialTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private reconnectAttempt = 0;
  private readonly onOnline = (): void => {
    if (this.stopped) return;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connect();
  };
  private readonly onOffline = (): void => {
    setConnection('reconnecting', 'Device offline');
    this.ws?.close(4001, 'device offline');
  };
  private readonly onVisibility = (): void => {
    if (!document.hidden && !this.stopped && !this.ws) this.connect();
  };

  constructor(
    private readonly onSnapshot: (players: RemoteWorldPlayer[]) => void,
    private readonly onAuthoritativePosition: (position: AuthoritativeWorldPosition) => void,
    private readonly combat: WorldCombatHandlers,
  ) {}

  start(): Promise<AuthoritativeWorldPosition> {
    this.stopped = false;
    this.reconnectAttempt = 0;
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.connect();
    return new Promise((resolve, reject) => {
      this.initialResolve = resolve;
      this.initialReject = reject;
      this.initialTimer = window.setTimeout(() => {
        this.rejectInitial(new Error('World presence handshake timed out'));
      }, 12_000);
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearWatchdog();
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.rejectInitial(new Error('World presence stopped'));
    this.ws?.close(1000, 'game closed');
    this.ws = null;
    this.onSnapshot([]);
    this.combat.onCombatSnapshot([], []);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'visibility', active }));
    }
    if (!active) {
      this.onSnapshot([]);
      this.combat.onCombatSnapshot([], []);
    }
  }

  update(nowMs: number, position: AuthoritativeWorldPosition): void {
    if (!this.active || !this.ws || this.ws.readyState !== WebSocket.OPEN || nowMs - this.lastSend < 180) return;
    this.lastSend = nowMs;
    this.ws.send(JSON.stringify({ type: 'position', seq: this.seq++, ...position }));
  }

  attack(ability: boolean, facing: number): boolean {
    if (!this.active || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type: 'attack', attackId: commandId(ability ? 'ability' : 'attack'), ability, facing }));
    return true;
  }

  claimBag(bagId: string): boolean {
    if (!this.active || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type: 'claim_bag', bagId, claimId: commandId('claim') }));
    return true;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private resolveInitial(position: AuthoritativeWorldPosition): void {
    if (this.initialTimer !== null) window.clearTimeout(this.initialTimer);
    this.initialTimer = null;
    this.initialResolve?.(position);
    this.initialResolve = null;
    this.initialReject = null;
  }

  private rejectInitial(error: Error): void {
    if (this.initialTimer !== null) window.clearTimeout(this.initialTimer);
    this.initialTimer = null;
    this.initialReject?.(error);
    this.initialResolve = null;
    this.initialReject = null;
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer !== null) window.clearTimeout(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private armWatchdog(ws: WebSocket): void {
    this.clearWatchdog();
    this.watchdogTimer = window.setTimeout(() => {
      if (this.ws === ws && ws.readyState === WebSocket.OPEN) ws.close(4000, 'world channel stalled');
    }, 35_000);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return;
    const delay = reconnectDelayMs(this.reconnectAttempt++);
    setConnection('reconnecting', `World channel reconnecting in ${Math.max(1, Math.round(delay / 1000))}s`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private connect(): void {
    if (this.stopped || this.ws) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setConnection('reconnecting', 'Device offline');
      this.scheduleReconnect();
      return;
    }
    setConnection(this.reconnectTimer === null ? 'pending' : 'reconnecting', this.reconnectTimer === null ? 'Opening world channel' : 'Reconnecting world channel');
    const ws = new WebSocket(worldPresenceWebSocketUrl());
    this.ws = ws;
    ws.addEventListener('open', () => {
      setConnection('pending', 'World channel open');
      this.armWatchdog(ws);
    });
    ws.addEventListener('message', (event) => {
      this.armWatchdog(ws);
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'snapshot' && Array.isArray(message.players)) {
          this.onSnapshot(message.players);
        } else if (message.type === 'welcome' && message.self) {
          this.seq = 0;
          this.reconnectAttempt = 0;
          this.onAuthoritativePosition(message.self);
          if (!this.active) ws.send(JSON.stringify({ type: 'visibility', active: false }));
          this.resolveInitial(message.self);
          setConnection('online', 'Realm synchronized');
        } else if (message.type === 'combat_snapshot') {
          this.combat.onCombatSnapshot(message.enemies, message.bags);
        } else if (message.type === 'combat_state') {
          this.combat.onCombatPlayer(message.player);
        } else if (message.type === 'combat_result') {
          this.combat.onCombatResult(message.hits, message.player, message.inventory);
        } else if (message.type === 'player_damaged') {
          this.combat.onPlayerDamaged(message.damage, message.player);
        } else if (message.type === 'player_died') {
          this.combat.onPlayerDied(message);
        } else if (message.type === 'bag_claimed') {
          this.combat.onBagClaimed(message.bagId, message.inventory);
        } else if (message.type === 'combat_error') {
          this.combat.onCombatError?.(message.error);
        }
      } catch {
        // Ignore malformed server frames; the next valid frame replaces state.
      }
    });
    ws.addEventListener('close', () => {
      if (this.ws === ws) this.ws = null;
      this.clearWatchdog();
      this.onSnapshot([]);
      this.combat.onCombatSnapshot([], []);
      this.scheduleReconnect();
    });
    ws.addEventListener('error', () => ws.close());
  }
}
