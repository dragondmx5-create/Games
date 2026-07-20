import { describe, expect, it } from 'vitest';
import { caravanFare, isPublicTravelSettlement } from '../travel/domain.js';
import { settlementById, publicSettlements } from '../world/settlementLayout.js';

describe('caravan travel domain', () => {
  it('exposes all public settlements and excludes hidden routes', () => {
    expect(publicSettlements()).toHaveLength(24);
    expect(publicSettlements().every(isPublicTravelSettlement)).toBe(true);
    expect(isPublicTravelSettlement(settlementById('rootcellar')!)).toBe(false);
  });

  it('prices longer and cross-land routes above local routes', () => {
    const evergrove = settlementById('evergrove')!;
    const rivercross = settlementById('rivercross')!;
    const emberport = settlementById('emberport')!;
    expect(caravanFare(evergrove, evergrove)).toBe(0);
    expect(caravanFare(evergrove, emberport)).toBeGreaterThan(caravanFare(evergrove, rivercross));
    expect(caravanFare(evergrove, emberport)).toBeLessThanOrEqual(80);
  });
});
