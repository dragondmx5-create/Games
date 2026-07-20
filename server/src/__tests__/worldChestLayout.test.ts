import { describe, expect, it } from 'vitest';
import { generateWorldChests } from '../world/chestLayout.js';

const REGION_PIXELS = 220 * 16;

describe('world chest layout', () => {
  it('is deterministic and risk-scaled', () => {
    expect(generateWorldChests(123, 2, -1, 'fracture')).toEqual(generateWorldChests(123, 2, -1, 'fracture'));
    expect(generateWorldChests(123, 2, -1, 'sanctuary')).toHaveLength(2);
    expect(generateWorldChests(123, 2, -1, 'lost')).toHaveLength(8);
  });

  it('keeps chests inside region bounds and outside the capital clearance', () => {
    for (const chest of generateWorldChests(999, 0, 0, 'lost')) {
      expect(chest.x).toBeGreaterThan(0);
      expect(chest.y).toBeGreaterThan(0);
      expect(chest.x).toBeLessThan(REGION_PIXELS);
      expect(chest.y).toBeLessThan(REGION_PIXELS);
      expect(Math.hypot(chest.x - REGION_PIXELS / 2, chest.y - REGION_PIXELS / 2)).toBeGreaterThanOrEqual(300);
    }
  });

  it('uses stable canonical IDs', () => {
    expect(generateWorldChests(5, -2, 3, 'frontier')[0]?.id).toBe('chest:5:-2:3:0');
  });
});
