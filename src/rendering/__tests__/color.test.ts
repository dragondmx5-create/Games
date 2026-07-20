import { describe, expect, it } from 'vitest';
import { multiplyAlpha, parseCssColor } from '../core/color';

describe('WebGL color parsing', () => {
  it('parses short and long hexadecimal colors', () => {
    expect(parseCssColor('#fff')).toEqual([1, 1, 1, 1]);
    expect(parseCssColor('#336699')).toEqual([0.2, 0.4, 0.6, 1]);
  });

  it('parses rgba alpha', () => {
    expect(parseCssColor('rgba(255, 128, 0, 0.25)')).toEqual([1, 128 / 255, 0, 0.25]);
  });

  it('supports transparent and applies global alpha', () => {
    expect(parseCssColor('transparent')).toEqual([0, 0, 0, 0]);
    expect(multiplyAlpha([0.2, 0.3, 0.4, 0.8], 0.5)).toEqual([0.2, 0.3, 0.4, 0.4]);
  });

  it('uses a visible debug color for unsupported CSS values', () => {
    expect(parseCssColor('not-a-color')).toEqual([1, 0, 1, 1]);
  });
});
