import { describe, expect, it } from 'vitest';
import { availableUnderworldOffers, contrabandRewards, LOST_ROUTE_REGIONS, MARKET_ROUTE_REGIONS } from '../underworld/catalog.js';

describe('server underworld catalog', () => {
  it('keeps one distinct market and lost route per land', () => {
    expect(Object.keys(MARKET_ROUTE_REGIONS)).toHaveLength(6);
    expect(Object.keys(LOST_ROUTE_REGIONS)).toHaveLength(6);
    expect(new Set(Object.values(MARKET_ROUTE_REGIONS).map(({ rx, ry }) => `${rx},${ry}`)).size).toBe(6);
    expect(new Set(Object.values(LOST_ROUTE_REGIONS).map(({ rx, ry }) => `${rx},${ry}`)).size).toBe(6);
  });

  it('never exposes offers above the account reputation', () => {
    for (let day = 0; day < 20; day++) {
      expect(availableUnderworldOffers(day, 0).every((offer) => offer.reputationRequired === 0)).toBe(true);
      expect(availableUnderworldOffers(day, 10).every((offer) => offer.reputationRequired <= 10)).toBe(true);
    }
  });

  it('biases contraband by source land and always includes one canonical crate', () => {
    expect(contrabandRewards('frostlands')).toEqual({ 'container.supply_crate': 1, 'material.iron': 3 });
    expect(contrabandRewards('rainforest')).toEqual({ 'container.supply_crate': 1, 'consumable.shroom': 3 });
    expect(contrabandRewards('green-land')).toEqual({ 'container.supply_crate': 1, 'material.wood': 4 });
  });
});
