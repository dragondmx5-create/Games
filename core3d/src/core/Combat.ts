import type { Actor, Enemy, Player } from './types';
import { distance } from './types';

export interface AttackResult {
  hit: boolean;
  killed: boolean;
  damage: number;
}

export const tickCooldown = (actor: Actor, delta: number): void => {
  actor.attackTimer = Math.max(0, actor.attackTimer - delta);
};

export const tryAttack = (attacker: Actor, target: Actor): AttackResult => {
  if (!attacker.alive || !target.alive || attacker.attackTimer > 0) {
    return { hit: false, killed: false, damage: 0 };
  }

  if (distance(attacker.position, target.position) > attacker.attackRange + target.radius) {
    return { hit: false, killed: false, damage: 0 };
  }

  attacker.attackTimer = attacker.attackCooldown;
  const damage = Math.max(1, attacker.attackDamage);
  target.hp = Math.max(0, target.hp - damage);
  target.alive = target.hp > 0;
  return { hit: true, killed: !target.alive, damage };
};

export const rewardKill = (player: Player, enemy: Enemy): boolean => {
  player.xp += enemy.rewardXp;
  const required = player.level * 30;
  if (player.xp < required) return false;

  player.xp -= required;
  player.level += 1;
  player.maxHp += 10;
  player.hp = player.maxHp;
  player.attackDamage += 2;
  return true;
};
