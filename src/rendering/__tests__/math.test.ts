import { describe, expect, it } from 'vitest';
import { IDENTITY_2D, multiply2D, transformPoint, type Mat2D } from '../core/math';

describe('WebGL 2D transforms', () => {
  it('keeps points unchanged with the identity matrix', () => {
    expect(transformPoint(IDENTITY_2D, 4, -2)).toEqual([4, -2]);
  });

  it('composes translation and scale in Canvas-compatible order', () => {
    const translated: Mat2D = [1, 0, 0, 1, 10, 20];
    const scaled: Mat2D = [2, 0, 0, 3, 0, 0];
    const matrix = multiply2D(translated, scaled);
    expect(transformPoint(matrix, 2, 2)).toEqual([14, 26]);
  });

  it('rotates a point by ninety degrees', () => {
    const rotation: Mat2D = [0, 1, -1, 0, 0, 0];
    const [x, y] = transformPoint(rotation, 5, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(5);
  });
});
