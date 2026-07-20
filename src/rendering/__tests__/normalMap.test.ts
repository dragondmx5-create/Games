import { describe, expect, it } from 'vitest';
import { encodeWaterNormalSample } from '../core/normalMap';

describe('procedural water normal encoding', () => {
  it('encodes a flat tangent-space normal with blue as the up axis', () => {
    expect(encodeWaterNormalSample(0, 0)).toEqual([128, 128, 255]);
  });

  it('keeps the blue channel dominant for sloped samples', () => {
    const [red, green, blue] = encodeWaterNormalSample(0.52, -0.5);
    expect(red).toBeLessThan(128);
    expect(green).toBeGreaterThan(128);
    expect(blue).toBeGreaterThan(red);
    expect(blue).toBeGreaterThan(green);
  });
});
