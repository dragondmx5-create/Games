import { describe, it, expect } from 'vitest';
import { newEnemy, dist } from '../entities';
import { ENEMY_DEFS, EnemyKind } from '../config';

describe('newEnemy', () => {
  it('takes hp/speed(base)/damage from ENEMY_DEFS and scales speed by depth', () => {
    for (const kind of Object.keys(ENEMY_DEFS) as EnemyKind[]) {
      const def = ENEMY_DEFS[kind];
      for (const layer of [1, 3, 5]) {
        const e = newEnemy(kind, 100, 100, layer);
        const depthMul = 1 + (layer - 1) * 0.25;
        expect(e.hp).toBe(def.hp);
        expect(e.maxHp).toBe(def.hp);
        expect(e.damage).toBe(def.damage);
        expect(e.speed).toBeCloseTo(def.speed * depthMul, 5);
      }
    }
  });

  it('sets emergeTimer only for wall-emerging kinds, and starts telegraph at 0', () => {
    for (const kind of Object.keys(ENEMY_DEFS) as EnemyKind[]) {
      const def = ENEMY_DEFS[kind];
      const e = newEnemy(kind, 0, 0, 1);
      expect(e.emergeTimer > 0).toBe(def.emergesFromWall);
      expect(e.telegraph).toBe(0);
      expect(e.aggro).toBe(false);
    }
  });

  it('preserves the spawn position', () => {
    const e = newEnemy('bug', 42, 84, 2);
    expect(e.x).toBe(42);
    expect(e.y).toBe(84);
  });
});

describe('dist', () => {
  it('computes euclidean distance', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
    expect(dist(1, 1, 1, 1)).toBe(0);
  });
});
