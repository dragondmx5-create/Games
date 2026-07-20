import { describe, expect, it } from 'vitest';
import { effectiveEnemyLifecycle, enemyLifeId } from '../combat/enemyState.js';

describe('durable enemy lifecycle', () => {
  it('keeps a living generation unchanged', () => {
    expect(effectiveEnemyLifecycle({ enemyId: 'enemy:1', generation: 3, hp: 4, respawnAt: null }, 5, new Date(1_000))).toEqual({
      enemyId: 'enemy:1', generation: 3, hp: 4, alive: true, respawnAt: null,
    });
  });

  it('keeps an unexpired death unavailable', () => {
    expect(effectiveEnemyLifecycle({ enemyId: 'enemy:1', generation: 3, hp: 0, respawnAt: new Date(2_000) }, 5, new Date(1_000))).toEqual({
      enemyId: 'enemy:1', generation: 3, hp: 0, alive: false, respawnAt: new Date(2_000).toISOString(),
    });
  });

  it('derives exactly one next generation after respawn expiry', () => {
    expect(effectiveEnemyLifecycle({ enemyId: 'enemy:1', generation: 3, hp: 0, respawnAt: new Date(2_000) }, 5, new Date(2_000))).toEqual({
      enemyId: 'enemy:1', generation: 4, hp: 5, alive: true, respawnAt: null,
    });
  });

  it('builds a process-independent life id', () => {
    expect(enemyLifeId('enemy:42:0:0:7', 9)).toBe('enemy:42:0:0:7:9');
    expect(() => enemyLifeId('enemy:1', -1)).toThrow('invalid enemy generation');
  });
});
