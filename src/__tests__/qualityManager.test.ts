import { describe, expect, it } from 'vitest';
import { AdaptiveResolutionGovernor, isLikelyMobileDevice, resolveGraphicsQuality } from '../rendering/quality/QualityManager';

const desktop = { cores: 12, memoryGb: 16, touchPoints: 0, viewportWidth: 1920, viewportHeight: 1080 };

describe('mobile graphics quality', () => {
  it('does not select high for a touch-first phone even with many cores', () => {
    const phone = { cores: 8, memoryGb: 6, touchPoints: 5, viewportWidth: 844, viewportHeight: 390 };
    expect(isLikelyMobileDevice(phone)).toBe(true);
    expect(resolveGraphicsQuality('auto', phone)).toBe('medium');
    expect(resolveGraphicsQuality('auto', desktop)).toBe('high');
  });

  it('reduces resolution only after sustained missed frame budget', () => {
    const governor = new AdaptiveResolutionGovernor();
    let changed: number | null = null;
    for (let i = 0; i < 180; i++) changed = governor.sample(26) ?? changed;
    expect(changed).toBe(0.85);
    expect(governor.scale).toBe(0.85);
  });
});
