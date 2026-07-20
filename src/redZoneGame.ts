import { TILE } from './config';
import { World, isWalkable } from './world';
import { Player } from './entities';
import { Renderer } from './render3d';
import { Input } from './input';
import { Assets } from './assets';
import { TouchControls } from './touch';
import { AudioManager } from './audio';
import {
  exitServerPvp,
  pvpWebSocketUrl,
  returnServerPvpDeath,
  type ServerInventorySnapshot,
  type ServerPvpAdmissionResponse,
  type ServerPvpReturnResponse,
} from './api';
import { updateRuntime } from './ui/events';
import { crownValue } from './ui/economyPresentation';

const PVP_SPEED = 70;
const MOVE_SEND_INTERVAL = 0.05;
const RECONCILE_SNAP_DIST = 40;

function makePvpPlayer(x: number, y: number, maxHp: number): Player {
  return {
    x, y, hp: maxHp, maxHp, xp: 0, level: 1, light: 100,
    facing: 0, dir: 'down', flipX: false, animTime: 0,
    attackTimer: 0, swingT: 0, swingPower: 1, swingArc: 0, swingRange: 0,
    abilityTimer: 0, invulnTimer: 0, running: false, moving: false,
    loot: 0, shrooms: 0, weapons: ['bone'], weaponIdx: 0, tools: [], armor: [], chests: 0,
    wood: 0, iron: 0, meat: 0, hide: 0, feathers: 0,
  };
}

interface RemotePlayerVisual {
  player: Player;
  username: string;
  targetX: number;
  targetY: number;
  alive: boolean;
}

interface SnapshotPlayer {
  id: string;
  username: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dir: 'down' | 'up' | 'side';
  flipX: boolean;
  facing: number;
  moving: boolean;
  alive: boolean;
}

export class RedZoneGame {
  private ws: WebSocket | null = null;
  private world: World | null = null;
  private selfId = '';
  private player = makePvpPlayer(0, 0, 10);
  private others = new Map<string, RemotePlayerVisual>();
  private renderer: Renderer;
  private input = new Input();
  private lastTime = 0;
  private lastHp = 10;
  private flashRed = 0;
  private weaponRange = 30;
  private weaponArc = Math.PI * 0.8;
  private weaponCooldown = 0.35;
  private abilityCooldown = 1.5;
  private moveSendTimer = 0;
  private ready = false;
  private running = false;
  private disposed = false;
  private finishing = false;
  private inventory: ServerInventorySnapshot;
  private extraction = { x: 0, y: 0, radius: 64 };

  private hpFill = document.getElementById('hp-fill')!;
  private depthEl = document.getElementById('depth')!;
  private lootEl = document.getElementById('loot')!;

  constructor(
    canvas: HTMLCanvasElement,
    assets: Assets,
    private touch: TouchControls,
    private audio: AudioManager,
    private admission: ServerPvpAdmissionResponse,
    private readonly onReturn: (result: ServerPvpReturnResponse) => void,
  ) {
    this.renderer = new Renderer(canvas, assets);
    this.inventory = admission.pvp.carriedInventory;
    this.depthEl.textContent = `${admission.pvp.riskTier.toUpperCase()} — connecting to authoritative room…`;
    this.lootEl.textContent = '';
    (document.getElementById('xp-fill') as HTMLElement).style.width = '0%';

    if (admission.pvp.status === 'death_pending' && admission.pvp.deathToken) {
      void this.settleDeath(admission.pvp.deathToken);
      return;
    }
    this.openSocket(pvpWebSocketUrl(admission.pvp.admissionToken));
  }

  private openSocket(url: string): void {
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener('message', (event) => this.handleMessage(String(event.data)));
    ws.addEventListener('close', () => {
      if (!this.finishing) this.depthEl.textContent = `${this.admission.pvp.riskTier.toUpperCase()} — disconnected; refresh to recover the active session`;
    });
    ws.addEventListener('error', () => {
      if (!this.finishing) this.depthEl.textContent = `${this.admission.pvp.riskTier.toUpperCase()} — room connection failed`;
    });
  }

  get debug() {
    return { world: this.world, player: this.player, others: this.others, selfId: this.selfId, inventory: this.inventory, session: this.admission.pvp };
  }

  private send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private handleMessage(raw: string): void {
    let message: Record<string, unknown>;
    try { message = JSON.parse(raw) as Record<string, unknown>; } catch { return; }

    if (message.type === 'init') {
      const world = message.world as { w: number; h: number; tiles: number[]; floorVariant: number[] };
      const spawn = message.spawn as { x: number; y: number };
      const weapon = message.weapon as { range: number; arc: number; cooldown: number };
      const extraction = message.extraction as { x: number; y: number; radius: number };
      this.selfId = String(message.selfId);
      this.weaponRange = weapon.range;
      this.weaponArc = weapon.arc;
      this.weaponCooldown = weapon.cooldown;
      this.abilityCooldown = Math.max(0.8, weapon.cooldown * 2.5);
      this.inventory = message.inventory as ServerInventorySnapshot;
      this.extraction = extraction;
      this.player = makePvpPlayer(spawn.x, spawn.y, Number(message.maxHp));
      this.lastHp = this.player.hp;
      this.world = {
        layer: 1,
        w: world.w,
        h: world.h,
        tiles: Uint8Array.from(world.tiles),
        floorVariant: Uint8Array.from(world.floorVariant),
        props: [], weaponSpots: [], chests: [], farmPlots: [], npcSpawns: [], animalSpawns: [], portals: [], resourceNodes: [], miningNodes: [],
        visualLayer: this.admission.pvp.riskTier === 'lost' ? 3 : 1,
        dangerLevel: this.admission.pvp.riskTier === 'lost' ? 4 : 3,
        entrance: { x: 0, y: 0 },
        exit: { x: 0, y: 0 },
      };
      this.ready = true;
      this.updateHud(1);
      return;
    }
    if (message.type === 'snapshot') {
      this.applySnapshot(message.players as SnapshotPlayer[]);
      return;
    }
    if (message.type === 'damaged') {
      this.flashRed = 0.6;
      this.audio.playHit();
      return;
    }
    if (message.type === 'killSettled') {
      this.inventory = message.killerInventory as ServerInventorySnapshot;
      this.updateHud(this.others.size + 1);
      return;
    }
    if (message.type === 'youDied') {
      this.inventory = message.victimInventory as ServerInventorySnapshot;
      const token = String(message.deathToken ?? '');
      this.flashRed = 0.8;
      this.depthEl.textContent = `${this.admission.pvp.riskTier.toUpperCase()} — death settled; returning by server receipt…`;
      if (token) void this.settleDeath(token);
      return;
    }
    if (message.type === 'death_pending') {
      const token = String(message.deathToken ?? '');
      if (token) void this.settleDeath(token);
      return;
    }
    if (message.type === 'error') this.depthEl.textContent = String(message.message ?? 'authoritative PvP error');
  }

  private applySnapshot(list: SnapshotPlayer[]): void {
    const seen = new Set<string>();
    for (const remote of list) {
      seen.add(remote.id);
      if (remote.id === this.selfId) {
        if (remote.hp < this.lastHp) this.audio.playHit();
        this.lastHp = remote.hp;
        this.player.hp = remote.hp;
        this.player.maxHp = remote.maxHp;
        if (Math.hypot(remote.x - this.player.x, remote.y - this.player.y) > RECONCILE_SNAP_DIST) {
          this.player.x = remote.x;
          this.player.y = remote.y;
        }
        continue;
      }
      let actor = this.others.get(remote.id);
      if (!actor) {
        actor = { player: makePvpPlayer(remote.x, remote.y, remote.maxHp), username: remote.username, targetX: remote.x, targetY: remote.y, alive: remote.alive };
        this.others.set(remote.id, actor);
      }
      actor.alive = remote.alive;
      actor.targetX = remote.x;
      actor.targetY = remote.y;
      actor.player.hp = remote.hp;
      actor.player.maxHp = remote.maxHp;
      actor.player.dir = remote.dir;
      actor.player.flipX = remote.flipX;
      actor.player.facing = remote.facing;
      actor.player.moving = remote.moving;
    }
    for (const id of this.others.keys()) if (!seen.has(id)) this.others.delete(id);
    this.updateHud(list.length);
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    const loop = (time: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (time - this.lastTime) / 1000);
      this.lastTime = time;
      try {
        this.update(dt);
        if (this.world) {
          this.renderer.render(
            this.world, this.player, [], [], [], null, [], [], this.flashRed, dt,
            [...this.others.values()].filter((entry) => entry.alive).map((entry) => ({ player: entry.player, username: entry.username })),
          );
        }
      } catch (error) {
        console.error('[undral:pvp] frame error:', error);
      }
      this.input.endFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.ws?.close(1000, 'PvP handoff completed');
    this.ws = null;
    this.input.dispose();
    this.renderer.dispose();
    this.others.clear();
  }

  private update(dt: number): void {
    this.flashRed = Math.max(0, this.flashRed - dt * 1.5);
    for (const actor of this.others.values()) {
      actor.player.x += (actor.targetX - actor.player.x) * Math.min(1, dt * 12);
      actor.player.y += (actor.targetY - actor.player.y) * Math.min(1, dt * 12);
      actor.player.animTime = actor.player.moving ? actor.player.animTime + dt : 0;
    }
    if (!this.ready || !this.world || this.finishing) return;
    if (!document.getElementById('interface-panel')?.classList.contains('hidden')) return;

    if (this.input.justPressed('Escape') || this.input.justPressed('KeyE') || this.touch.consumeInteract()) {
      if (this.insideExtraction()) void this.exit();
      else this.depthEl.textContent = `${this.admission.pvp.riskTier.toUpperCase()} — return to the center extraction beacon`;
      return;
    }

    const mx = this.input.moveX + this.touch.moveX;
    const my = this.input.moveY + this.touch.moveY;
    const length = Math.hypot(mx, my);
    this.player.moving = length > 0.01;
    if (this.player.moving) {
      const dx = mx / length;
      const dy = my / length;
      this.player.facing = Math.atan2(dy, dx);
      if (Math.abs(dy) >= Math.abs(dx)) this.player.dir = dy >= 0 ? 'down' : 'up';
      else { this.player.dir = 'side'; this.player.flipX = dx < 0; }
      this.player.animTime += dt;
      const nx = this.player.x + dx * PVP_SPEED * dt;
      const ny = this.player.y + dy * PVP_SPEED * dt;
      if (isWalkable(this.world, Math.floor(nx / TILE), Math.floor(this.player.y / TILE))) this.player.x = nx;
      if (isWalkable(this.world, Math.floor(this.player.x / TILE), Math.floor(ny / TILE))) this.player.y = ny;
    } else {
      this.player.animTime = 0;
    }

    this.player.attackTimer = Math.max(0, this.player.attackTimer - dt);
    this.player.abilityTimer = Math.max(0, this.player.abilityTimer - dt);
    this.player.swingT = Math.max(0, this.player.swingT - dt);
    this.moveSendTimer += dt;
    if (this.moveSendTimer >= MOVE_SEND_INTERVAL) {
      this.moveSendTimer = 0;
      this.send({ type: 'move', dx: this.player.moving ? mx / length : 0, dy: this.player.moving ? my / length : 0 });
    }

    if ((this.input.justPressed('Space') || this.touch.attackHeld) && this.player.attackTimer <= 0) {
      this.player.attackTimer = this.weaponCooldown;
      this.swing(false);
    }
    if ((this.input.justPressed('KeyF') || this.touch.consumeAbility()) && this.player.abilityTimer <= 0) {
      this.player.abilityTimer = this.abilityCooldown;
      this.swing(true);
    }
    this.touch.setAbilityCooldown(this.player.abilityTimer > 0);
  }

  private swing(ability: boolean): void {
    this.player.swingT = 0.16;
    this.player.swingPower = ability ? 2 : 1;
    this.player.swingArc = this.weaponArc;
    this.player.swingRange = this.weaponRange;
    this.audio.playSwing();
    this.send({ type: 'attack', ability, facing: this.player.facing });
  }


  private insideExtraction(): boolean {
    return Math.hypot(this.player.x - this.extraction.x, this.player.y - this.extraction.y) <= this.extraction.radius;
  }

  private async exit(): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    this.depthEl.textContent = `${this.admission.pvp.riskTier.toUpperCase()} — settling authoritative exit…`;
    try {
      const result = await exitServerPvp(this.admission.pvp.sessionId);
      this.finish(result);
    } catch (error) {
      this.finishing = false;
      this.depthEl.textContent = `PvP exit failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async settleDeath(deathToken: string): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    try {
      const result = await returnServerPvpDeath(this.admission.pvp.sessionId, deathToken);
      this.finish(result);
    } catch (error) {
      this.finishing = false;
      this.depthEl.textContent = `PvP death return failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private finish(result: ServerPvpReturnResponse): void {
    this.stop();
    this.onReturn(result);
  }

  private updateHud(playerCount: number): void {
    (this.hpFill as HTMLElement).style.width = `${Math.max(0, Math.min(100, (this.player.hp / Math.max(1, this.player.maxHp)) * 100))}%`;
    const hiddenCount = this.admission.pvp.riskTier === 'lost' ? 'player count hidden' : `${playerCount} player${playerCount === 1 ? '' : 's'}`;
    const exitHint = this.insideExtraction() ? 'E/Esc extracts' : 'return to center beacon';
    this.depthEl.textContent = `${this.admission.pvp.riskTier.toUpperCase()} — ${hiddenCount} • ${exitHint}`;
    this.lootEl.textContent = `Canonical crystals: ${this.inventory.stacks['currency.crystal'] ?? 0} • inventory rev ${this.inventory.revision}`;
    updateRuntime({
      mode: 'game',
      location: this.depthEl.textContent ?? 'Risk territory',
      risk: this.admission.pvp.riskTier.toUpperCase(),
      hpPercent: (this.player.hp / Math.max(1, this.player.maxHp)) * 100,
      hpCurrent: this.player.hp,
      hpMax: this.player.maxHp,
      xpPercent: 0,
      xpCurrent: 0,
      xpTarget: 1,
      level: 1,
      abilityName: 'PvP Ability',
      abilityCooldownPercent: (this.player.abilityTimer / Math.max(0.001, this.abilityCooldown)) * 100,
      abilityCooldownSeconds: this.player.abilityTimer,
      inventoryRevision: this.inventory.revision,
      resources: {
        coins: crownValue(this.inventory.stacks['currency.crystal'] ?? 0),
        crystals: this.inventory.stacks['currency.crystal'] ?? 0,
        shrooms: this.inventory.stacks['consumable.shroom'] ?? 0,
        wood: this.inventory.stacks['material.wood'] ?? 0,
        iron: this.inventory.stacks['material.iron'] ?? 0,
        meat: this.inventory.stacks['material.meat'] ?? 0,
        hide: this.inventory.stacks['material.hide'] ?? 0,
        feathers: this.inventory.stacks['material.feathers'] ?? 0,
        crates: this.inventory.stacks['container.supply_crate'] ?? 0,
      },
    });
  }
}
