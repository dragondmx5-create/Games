import { describe, expect, it } from 'vitest';
import { SETTLEMENT_COUNT, settlementAnimals, settlementAt, settlementFarmPlots } from '../world/settlementLayout.js';

describe('authoritative settlement layout', () => {
  it('covers all thirty designed settlements', () => {
    expect(SETTLEMENT_COUNT).toBe(30);
    expect(settlementAt(0, 0)?.id).toBe('evergrove');
    expect(settlementAt(5, 5)?.id).toBe('dead-reckoning');
    expect(settlementAt(2, 0)).toBeUndefined();
  });

  it('creates stable farm plots only in farming settlements', () => {
    const evergrove = settlementFarmPlots(0, 0);
    expect(evergrove).toHaveLength(5);
    expect(new Set(evergrove.map((plot) => plot.id)).size).toBe(5);
    expect(evergrove.map((plot) => plot.crop)).toEqual(['glowshroom', 'glowshroom', 'glowshroom', 'caveberry', 'caveberry']);
    expect(settlementFarmPlots(1, 0)).toEqual([]);
  });

  it('issues biome-specific production animals at fixed positions', () => {
    const green = settlementAnimals(0, 0);
    const frost = settlementAnimals(-4, 3);
    expect(green).toHaveLength(5);
    expect(green.some((animal) => animal.kind === 'cow')).toBe(true);
    expect(frost.some((animal) => animal.kind === 'musk_ox')).toBe(true);
    expect(new Set(green.map((animal) => animal.id)).size).toBe(green.length);
  });
});

describe('settlement scale hierarchy', () => {
  it('gives each capital exactly four signature public buildings plus a compact supporting neighborhood', async () => {
    const { settlementHouses } = await import('../world/settlementLayout.js');
    const capitals = [[-4, -3], [0, 0], [4, -3], [-4, 3], [0, 4], [4, 3]] as const;
    const signatureRoles = new Set(['guild-hall', 'civic', 'market-hall', 'quest-house']);
    for (const [rx, ry] of capitals) {
      const houses = settlementHouses(rx, ry, 424242);
      expect(houses).toHaveLength(8);
      expect(houses.filter((house) => signatureRoles.has(house.role ?? '')).map((house) => house.role).sort()).toEqual(
        ['civic', 'guild-hall', 'market-hall', 'quest-house'],
      );
      expect(houses.filter((house) => house.role === 'quest-house' && house.enterable && house.questId)).toHaveLength(1);
    }
  });

  it('keeps non-capital settlements smaller and scattered', async () => {
    const { settlementHouses } = await import('../world/settlementLayout.js');
    expect(settlementHouses(1, 0, 42)).toHaveLength(5);
    expect(settlementHouses(0, -1, 42)).toHaveLength(4);
    expect(settlementHouses(-1, -2, 42)).toHaveLength(3);
  });
});
