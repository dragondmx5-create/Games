import { describe, expect, it } from 'vitest';
import { generateEnemySpawns } from '../combat/layout.js';

describe('authoritative enemy layout', () => {
  it('is deterministic and uses stable unique ids', () => {
    const first = generateEnemySpawns(1234, 2, -1, 'fracture');
    const second = generateEnemySpawns(1234, 2, -1, 'fracture');
    expect(first).toEqual(second);
    expect(new Set(first.map((enemy) => enemy.id)).size).toBe(first.length);
  });

  it('spawns no enemies in sanctuary regions', () => {
    expect(generateEnemySpawns(1, 0, 0, 'sanctuary')).toEqual([]);
  });

  it('scales enemy count by risk and keeps spawns inside the region', () => {
    const frontier = generateEnemySpawns(99, 0, 1, 'frontier');
    const lost = generateEnemySpawns(99, 0, 1, 'lost');
    expect(frontier).toHaveLength(12);
    expect(lost).toHaveLength(24);
    for (const enemy of lost) {
      expect(enemy.x).toBeGreaterThanOrEqual(96);
      expect(enemy.x).toBeLessThanOrEqual(2464);
      expect(enemy.y).toBeGreaterThanOrEqual(96);
      expect(enemy.y).toBeLessThanOrEqual(2464);
    }
  });
});
