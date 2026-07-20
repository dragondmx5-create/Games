import { afterEach, describe, expect, it, vi } from 'vitest';
import { qualityNumber, resolveGraphicsQuality } from '../quality/QualityManager';

describe('graphics quality resolution', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps explicit quality choices unchanged', () => {
    expect(resolveGraphicsQuality('low')).toBe('low');
    expect(resolveGraphicsQuality('medium')).toBe('medium');
    expect(resolveGraphicsQuality('high')).toBe('high');
  });

  it('selects low for constrained devices', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 2, deviceMemory: 2 });
    expect(resolveGraphicsQuality('auto')).toBe('low');
  });

  it('selects high for capable devices', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 12, deviceMemory: 8 });
    expect(resolveGraphicsQuality('auto')).toBe('high');
    expect(qualityNumber('high')).toBe(2);
  });
});
