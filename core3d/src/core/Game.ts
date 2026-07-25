import { rewardKill, tickCooldown, tryAttack } from './Combat';
import type { Enemy, GameSnapshot, Player, Vec2 } from './types';
import { distance, normalize } from './types';
import { World } from './World';

export interface GameInput {
  move: Vec2;
  attack: boolean;
}

export interface GameEvent {
  type: 'hit' | 'kill' | 'level-up' | 'death' | 'respawn';
  text: string;
}

const createPlayer = (): Player => ({
  id: 'player',
  position: { x: 0, z: 10 },
  radius: 0.45,
  speed: 6,
  hp: 100,
  maxHp: 100,
  attackDamage: 20,
  attackRange: 1.55,
  attackCooldown: 0.45,
  attackTimer: 0,
  alive: true,
  xp: 0,
  level: 1,
});

const createEnemy = (id: string, x: number, z: number): Enemy => ({
  id,
  position: { x, z },
  radius: 0.48,
  speed: 2.1,
  hp: 45,
  maxHp: 45,
  attackDamage: 8,
  attackRange: 1.15,
  attackCooldown: 0.9,
  attackTimer: 0,
  alive: true,
  aggroRange: 7,
  rewardXp: 15,
});

export class Game {
  readonly world = new World();
  readonly player = createPlayer();
  readonly enemies: Enemy[] = [
    createEnemy('enemy-1', -8, -8),
    createEnemy('enemy-2', 8, -5),
    createEnemy('enemy-3', -9, 6),
    createEnemy('enemy-4', 9, 9),
  ];

  private time = 0;
  private respawnTimer = 0;
  private events: GameEvent[] = [];

  update(delta: number, input: GameInput): void {
    this.time += delta;
    tickCooldown(this.player, delta);
    this.enemies.forEach((enemy) => tickCooldown(enemy, delta));

    if (!this.player.alive) {
      this.respawnTimer -= delta;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    const direction = normalize(input.move);
    this.world.move(this.player, direction, this.player.speed * delta);

    if (input.attack) this.playerAttack();
    this.updateEnemies(delta);
  }

  snapshot(): GameSnapshot {
    return {
      player: this.player,
      enemies: this.enemies,
      walls: this.world.walls,
      time: this.time,
    };
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  private playerAttack(): void {
    const target = this.enemies
      .filter((enemy) => enemy.alive)
      .sort((a, b) => distance(this.player.position, a.position) - distance(this.player.position, b.position))[0];
    if (!target) return;

    const result = tryAttack(this.player, target);
    if (!result.hit) return;

    this.events.push({ type: 'hit', text: `Hit ${target.id} for ${result.damage}` });
    if (!result.killed) return;

    const leveled = rewardKill(this.player, target);
    this.events.push({ type: 'kill', text: `${target.id} defeated` });
    if (leveled) this.events.push({ type: 'level-up', text: `Level ${this.player.level}` });
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const gap = distance(enemy.position, this.player.position);

      if (gap <= enemy.aggroRange && gap > enemy.attackRange) {
        const direction = normalize({
          x: this.player.position.x - enemy.position.x,
          z: this.player.position.z - enemy.position.z,
        });
        this.world.move(enemy, direction, enemy.speed * delta);
      }

      const result = tryAttack(enemy, this.player);
      if (!result.hit) continue;
      this.events.push({ type: 'hit', text: `${enemy.id} hit you for ${result.damage}` });

      if (result.killed) {
        this.respawnTimer = 2;
        this.events.push({ type: 'death', text: 'You died — respawning' });
        break;
      }
    }
  }

  private respawn(): void {
    this.player.position.x = 0;
    this.player.position.z = 10;
    this.player.hp = this.player.maxHp;
    this.player.alive = true;

    for (const enemy of this.enemies) {
      enemy.hp = enemy.maxHp;
      enemy.alive = true;
    }
    this.events.push({ type: 'respawn', text: 'Respawned' });
  }
}
