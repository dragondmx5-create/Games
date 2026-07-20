import { describe, expect, it } from 'vitest';
import { settlementHouses } from '../../server/src/world/settlementLayout';
import { houseArchetypeFor } from '../art3d/houseComposition';

const CAPITALS = [[-4, -3], [0, 0], [4, -3], [-4, 3], [0, 4], [4, 3]] as const;

describe('six-land settlement building archetypes', () => {
  it('builds compact capital cities with four signature public buildings', () => {
    for (const [rx, ry] of CAPITALS) {
      const houses = settlementHouses(rx, ry, 424242);
      const archetypes = houses.map(houseArchetypeFor);
      expect(settlementHouses(rx, ry, 424242)).toEqual(houses);
      expect(houses).toHaveLength(8);
      expect(archetypes).toContain('questHouse');
      expect(archetypes).toContain('civic');
      expect(archetypes).toContain('guildHall');
      expect(archetypes).toContain('marketHall');
      expect(archetypes).toContain('cottage');
      expect(archetypes).toContain('shop');
      expect(Math.max(...houses.map((house) => house.storeys ?? 1))).toBeGreaterThanOrEqual(3);
      expect(new Set(houses.map((house) => house.style)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('assigns a distinct architecture language to every authored land', () => {
    const themes = CAPITALS.map(([rx, ry]) => {
      const houses = settlementHouses(rx, ry, 424242);
      expect(new Set(houses.map((house) => house.architecture)).size).toBe(1);
      expect(houses.every((house) => house.landId && house.settlementId && Number.isInteger(house.districtVariant))).toBe(true);
      return houses[0].architecture;
    });
    expect(new Set(themes).size).toBe(6);
  });

  it('keeps towns, outposts and hidden settlements progressively smaller', () => {
    const capital = settlementHouses(0, 0, 424242);
    const town = settlementHouses(1, 0, 424242);
    const outpost = settlementHouses(0, -1, 424242);
    const hidden = settlementHouses(-1, -2, 424242);
    expect([capital.length, town.length, outpost.length, hidden.length]).toEqual([8, 5, 4, 3]);
    expect(town.map(houseArchetypeFor)).toContain('shop');
    expect(outpost.map(houseArchetypeFor)).toContain('workshop');
    expect(hidden.every((house) => (house.storeys ?? 1) <= 2)).toBe(true);
  });
});
