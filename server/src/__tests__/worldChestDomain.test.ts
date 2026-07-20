import { describe, expect, it } from 'vitest';
import { filterWorldChestRewards, rollWorldChestRewards } from '../world/chestDomain.js';
import type { InventorySnapshot } from '../inventory/types.js';

const inventory: InventorySnapshot = {
  revision: 0,
  progressionLevel: 1,
  equippedWeapon: 'weapon.bone',
  hasPet: false,
  migratedFromSave: false,
  stacks: { 'weapon.bone': 1, 'weapon.chitin': 1 },
};

describe('world chest rewards', () => {
  it('rolls deterministically from server-owned keys', () => {
    expect(rollWorldChestRewards('chest:key:1', 'fracture')).toEqual(rollWorldChestRewards('chest:key:1', 'fracture'));
  });

  it('filters duplicate unique items before applying deltas', () => {
    expect(filterWorldChestRewards(inventory, { 'weapon.chitin': 1, 'material.wood': 3 })).toEqual({ 'material.wood': 3 });
  });
});
