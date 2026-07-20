import { describe, expect, it } from 'vitest';
import {
  slashProgress,
  visualEffectBudget,
  visualSeed,
  waterEdgeMask,
  windSway,
  WATER_EDGE_BOTTOM,
  WATER_EDGE_LEFT,
  WATER_EDGE_TOP,
} from '../effects';

describe('GPU visual effect inputs', () => {
  it('packs only walkable water boundaries into the shoreline mask', () => {
    expect(waterEdgeMask({
      top: 'walkable',
      bottom: 'walkable',
      left: 'walkable',
      right: 'solid',
    })).toBe(WATER_EDGE_TOP | WATER_EDGE_BOTTOM | WATER_EDGE_LEFT);
  });

  it('keeps visual seeds deterministic and normalized', () => {
    expect(visualSeed(12, -4)).toBe(visualSeed(12, -4));
    expect(visualSeed(13, -4)).not.toBe(visualSeed(12, -4));
    expect(visualSeed(12, -4)).toBeGreaterThanOrEqual(0);
    expect(visualSeed(12, -4)).toBeLessThanOrEqual(1);
  });

  it('scales expensive effects monotonically by quality', () => {
    const low = visualEffectBudget(0);
    const medium = visualEffectBudget(1);
    const high = visualEffectBudget(2);
    expect(low.waterOctaves).toBeLessThan(medium.waterOctaves);
    expect(medium.waterOctaves).toBeLessThan(high.waterOctaves);
    expect(low.particleMultiplier).toBeLessThan(medium.particleMultiplier);
    expect(medium.particleMultiplier).toBeLessThanOrEqual(high.particleMultiplier);
    expect(low.lightScattering).toBeLessThan(high.lightScattering);
  });

  it('disables bloom and nature particles only on the low tier', () => {
    expect(visualEffectBudget(0).bloomStrength).toBe(0);
    expect(visualEffectBudget(0).natureParticles).toBe(false);
    expect(visualEffectBudget(1).bloomStrength).toBeGreaterThan(0);
    expect(visualEffectBudget(1).bloomStrength).toBeLessThan(visualEffectBudget(2).bloomStrength);
    expect(visualEffectBudget(2).natureParticles).toBe(true);
    expect(visualEffectBudget(0).windStrength).toBeLessThan(visualEffectBudget(2).windStrength);
  });

  it('keeps wind sway bounded, deterministic and spatially varied', () => {
    for (let t = 0; t < 20; t += 0.7) {
      const sway = windSway(t, 512, 384);
      expect(sway).toBeGreaterThanOrEqual(-1);
      expect(sway).toBeLessThanOrEqual(1);
    }
    expect(windSway(3.2, 100, 200)).toBe(windSway(3.2, 100, 200));
    expect(windSway(3.2, 100, 200)).not.toBe(windSway(3.2, 900, 200));
    // the field actually moves over time rather than being a constant
    expect(windSway(1, 100, 200)).not.toBe(windSway(2, 100, 200));
  });

  it('clamps malformed or out-of-range swing progress', () => {
    expect(slashProgress(0.08, 0.16)).toBeCloseTo(0.5);
    expect(slashProgress(-1, 0.16)).toBe(1);
    expect(slashProgress(5, 0.16)).toBe(0);
    expect(slashProgress(1, 0)).toBe(1);
  });
});
