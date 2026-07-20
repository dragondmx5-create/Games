import { describe, expect, it } from 'vitest';
import { assertOfferOwned, canonicalTradeOffer, tradeDeltas } from '../trade/domain.js';
import type { InventorySnapshot } from '../inventory/types.js';

const inventory: InventorySnapshot = {
  revision: 4,
  progressionLevel: 1,
  equippedWeapon: 'weapon.bone',
  hasPet: false,
  migratedFromSave: true,
  stacks: { 'currency.crystal': 20, 'material.iron': 8, 'weapon.bone': 1, 'weapon.chitin': 1 },
};

describe('P2P trade domain', () => {
  it('canonicalizes bounded offers and computes reciprocal deltas', () => {
    const mine = canonicalTradeOffer({ crystals: 5, items: { 'material.iron': 3 } });
    const theirs = canonicalTradeOffer({ crystals: 0, items: { 'weapon.chitin': 1 } });
    expect(tradeDeltas(mine, theirs)).toEqual({
      'currency.crystal': -5,
      'material.iron': -3,
      'weapon.chitin': 1,
    });
  });

  it('rejects unknown, currency and companion item entries', () => {
    expect(() => canonicalTradeOffer({ crystals: 0, items: { nope: 1 } })).toThrow();
    expect(() => canonicalTradeOffer({ crystals: 0, items: { 'currency.crystal': 1 } })).toThrow();
    expect(() => canonicalTradeOffer({ crystals: 0, items: { 'companion.cave_pup': 1 } })).toThrow();
  });

  it('requires current ownership and prevents trading the equipped weapon', () => {
    expect(() => assertOfferOwned(inventory, canonicalTradeOffer({ crystals: 5, items: { 'material.iron': 2 } }))).not.toThrow();
    expect(() => assertOfferOwned(inventory, canonicalTradeOffer({ crystals: 21, items: {} }))).toThrow();
    expect(() => assertOfferOwned(inventory, canonicalTradeOffer({ crystals: 0, items: { 'weapon.bone': 1 } }))).toThrow();
  });
});
