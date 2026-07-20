import { describe, expect, it } from 'vitest';
import { generateRegion, inTown } from '../world';
import type { PropKind } from '../world/types';

const DECOR = new Set<PropKind>(['townWell', 'marketStall', 'townBench', 'flowerPlanter', 'lanternPost', 'handCart']);
const CASES = [
  { rx: 0, ry: 0, kind: 'capital', count: 10 },
  { rx: -1, ry: 0, kind: 'town', count: 11 },
  { rx: 0, ry: -1, kind: 'outpost', count: 7 },
  { rx: -1, ry: -2, kind: 'hidden', count: 5 },
] as const;

function townDecor(rx: number, ry: number) {
  const world = generateRegion(rx, ry, 424242);
  const props = world.props.filter((prop) => DECOR.has(prop.kind) && inTown(world, Math.floor(prop.x / 16), Math.floor(prop.y / 16)));
  return { world, props };
}

describe('canonical town decoration', () => {
  it('uses deliberate settlement-specific plaza budgets', () => {
    for (const testCase of CASES) {
      const { world, props } = townDecor(testCase.rx, testCase.ry);
      expect(world.profile?.settlement?.kind).toBe(testCase.kind);
      expect(props).toHaveLength(testCase.count);
      expect(props.some((prop) => prop.kind === 'townWell')).toBe(true);
      if (testCase.kind === 'capital') {
        expect(props.filter((prop) => prop.kind === 'marketStall')).toHaveLength(3);
        expect(props.filter((prop) => prop.kind === 'handCart')).toHaveLength(1);
      }
    }
  });

  it('keeps the central through-routes visually clear', () => {
    for (const testCase of CASES) {
      const { world, props } = townDecor(testCase.rx, testCase.ry);
      const bounds = world.townBounds!;
      const centerX = (bounds.x0 + bounds.x1 + 1) * 0.5;
      const centerY = (bounds.y0 + bounds.y1 + 1) * 0.5;
      for (const prop of props) {
        expect(Math.abs(prop.x / 16 - centerX)).toBeGreaterThanOrEqual(2.4);
        expect(Math.abs(prop.y / 16 - centerY)).toBeGreaterThanOrEqual(2.4);
      }
    }
  });

  it('is deterministic for the same region seed', () => {
    for (const testCase of CASES) {
      const first = townDecor(testCase.rx, testCase.ry).props;
      const second = townDecor(testCase.rx, testCase.ry).props;
      expect(second).toEqual(first);
    }
  });
});
