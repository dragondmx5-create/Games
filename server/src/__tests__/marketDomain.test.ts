import { describe, expect, it } from 'vitest';
import { isMarketTradableItem, marketFee, sellerMarketProceeds } from '../market/domain.js';

describe('regional market domain', () => {
  it('uses a bounded five percent settlement fee', () => {
    expect(marketFee(100)).toBe(5);
    expect(marketFee(1)).toBe(1);
    expect(sellerMarketProceeds(4, 25)).toEqual({ total: 100, fee: 5, proceeds: 95 });
  });

  it('keeps currency and companions out of item escrow', () => {
    expect(isMarketTradableItem('material.iron')).toBe(true);
    expect(isMarketTradableItem('weapon.chitin')).toBe(true);
    expect(isMarketTradableItem('currency.crystal')).toBe(false);
    expect(isMarketTradableItem('companion.cave_pup')).toBe(false);
  });

  it('rejects invalid quantities and prices', () => {
    expect(() => sellerMarketProceeds(0, 10)).toThrow();
    expect(() => sellerMarketProceeds(1, 100_001)).toThrow();
  });
});
