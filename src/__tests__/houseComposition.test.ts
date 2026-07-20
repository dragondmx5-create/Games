import { describe, expect, it } from 'vitest';
import { settlementHouses } from '../../server/src/world/settlementLayout';
import { buildHouseComposition, type HouseWallSide } from '../art3d/houseComposition';

const SIDES: readonly HouseWallSide[] = ['n', 's', 'e', 'w'];

function windowCount(windows: readonly boolean[]): number {
  return windows.filter(Boolean).length;
}

function expectSpaced(windows: readonly boolean[]): void {
  for (let index = 1; index < windows.length; index += 1) {
    expect(windows[index] && windows[index - 1]).toBe(false);
  }
}

describe('house composition', () => {
  const houses = Array.from({ length: 11 }, (_, ryIndex) => ryIndex - 5)
    .flatMap((ry) => Array.from({ length: 11 }, (_, rxIndex) => settlementHouses(rxIndex - 5, ry)))
    .flat();

  it('balances opposing window counts and keeps a readable rhythm', () => {
    expect(houses.length).toBeGreaterThan(100);
    for (const house of houses) {
      const composition = buildHouseComposition(house);
      expect(windowCount(composition.windows.n)).toBe(windowCount(composition.windows.s));
      expect(windowCount(composition.windows.e)).toBe(windowCount(composition.windows.w));
      for (const side of SIDES) expectSpaced(composition.windows[side]);
    }
  });

  it('keeps every door and furniture-backed panel solid', () => {
    for (const house of houses) {
      const composition = buildHouseComposition(house);
      for (const side of SIDES) {
        for (const index of composition.reservedSolid[side]) expect(composition.windows[side][index]).toBe(false);
      }
      const doorIndex = house.doorSide === 'n' || house.doorSide === 's'
        ? house.doorTx - house.x0
        : house.doorTy - house.y0 - 1;
      expect(composition.windows[house.doorSide][doorIndex]).toBe(false);
    }
  });

  it('derives wall furniture from the same inner wall faces', () => {
    for (const house of houses) {
      const composition = buildHouseComposition(house);
      expect(composition.furniture.fireplace.z - 0.36).toBeCloseTo(composition.wallFaces.north, 6);
      expect(composition.furniture.bookshelf.z - 0.14).toBeCloseTo(composition.wallFaces.north, 6);
      expect(composition.furniture.bed.z + 1.025).toBeCloseTo(composition.wallFaces.south, 6);
      expect(composition.furniture.workbench.x - 0.36).toBeCloseTo(composition.wallFaces.west, 6);
      expect(composition.furniture.barrels.x + 0.87).toBeCloseTo(composition.wallFaces.east, 6);
    }
  });
});
