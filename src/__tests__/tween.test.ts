import { describe, it, expect } from 'vitest';
import { EASE } from '../tween';

describe('EASE', () => {
  it('every curve starts at 0 and ends at 1', () => {
    for (const fn of Object.values(EASE)) {
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    }
  });

  it('linear is the identity function', () => {
    expect(EASE.linear(0.37)).toBeCloseTo(0.37, 10);
  });

  it('outQuad and outCubic are monotonically non-decreasing', () => {
    for (const fn of [EASE.outQuad, EASE.outCubic]) {
      let prev = -Infinity;
      for (let t = 0; t <= 1; t += 0.05) {
        const v = fn(t);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it('outBack overshoots past 1 before settling (the "pop" effect)', () => {
    const samples = Array.from({ length: 21 }, (_, i) => EASE.outBack(i / 20));
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });
});
