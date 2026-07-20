import { describe, expect, it } from 'vitest';
import { ambientWeatherForLand } from '../rendering/weather';

describe('ambient biome weather', () => {
  it('gives each authored land a mobile-scaled profile', () => {
    expect(ambientWeatherForLand('rainforest', 'high')?.kind).toBe('rain');
    expect(ambientWeatherForLand('frostlands', 'medium')?.kind).toBe('snow');
    expect(ambientWeatherForLand('rainforest', 'low')!.particlesPerSecond)
      .toBeLessThan(ambientWeatherForLand('rainforest', 'high')!.particlesPerSecond);
  });
});
