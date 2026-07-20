import { describe, expect, it } from 'vitest';
import { lootBagValue, splitVaultContribution } from '../economy/lootValue.js';

describe('server loot valuation', () => {
  it('matches the configured crystal-equivalent values', () => {
    expect(lootBagValue({
      loot: 7, shrooms: 2, wood: 3, iron: 2, meat: 1, hide: 1, feathers: 1,
      weapons: ['chitin', 'iron_falchion'], tools: ['axe'], armor: ['hideVest'], chests: 1,
    })).toBe(85);
  });

  it('splits without creating or losing crystals', () => {
    for (let total = 1; total < 100; total++) {
      const split = splitVaultContribution(total);
      expect(split.layer1 + split.layer5).toBe(total);
    }
  });
});
