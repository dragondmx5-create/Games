import { describe, expect, it } from 'vitest';
import type { InventorySnapshot } from '../inventory/types.js';
import { capitalRegionForLand, planPvpDeathSettlement, pvpRoomKey } from '../pvp/domain.js';

function inventory(overrides: Partial<InventorySnapshot> = {}): InventorySnapshot {
  return {
    revision: 7,
    progressionLevel: 9,
    equippedWeapon: 'weapon.chitin',
    hasPet: true,
    migratedFromSave: false,
    stacks: {
      'weapon.bone': 1,
      'weapon.chitin': 1,
      'companion.cave_pup': 1,
      'currency.crystal': 100,
      'material.wood': 10,
    },
    ...overrides,
  };
}

describe('authoritative PvP settlement domain', () => {
  it('keys rooms by world, regional gate and risk tier', () => {
    expect(pvpRoomKey(42, 'green-red-gate', 'fracture')).toBe('pvp:v1:42:fracture:green-red-gate');
    expect(pvpRoomKey(42, 'green-black-gate', 'lost')).not.toBe(pvpRoomKey(42, 'green-red-gate', 'fracture'));
    expect(() => pvpRoomKey(42, '../bad', 'lost')).toThrow('invalid PvP room identity');
  });

  it('uses fixed server-owned capital regions for death return', () => {
    expect(capitalRegionForLand('green-land')).toEqual({ rx: 0, ry: 0 });
    expect(capitalRegionForLand('witchlands')).toEqual({ rx: -4, ry: -3 });
    expect(capitalRegionForLand('cinder-coast')).toEqual({ rx: 4, ry: 3 });
  });

  it('settles Fracture loss, 20% Vault routing and unique equipment atomically', () => {
    const plan = planPvpDeathSettlement(inventory(), inventory({
      revision: 3,
      equippedWeapon: 'weapon.bone',
      hasPet: false,
      stacks: { 'weapon.bone': 1 },
    }), 'fracture');
    expect(plan.victimDeltas).toEqual({
      'currency.crystal': -60,
      'material.wood': -6,
      'weapon.chitin': -1,
    });
    expect(plan.vaultCrystals).toBe(12);
    expect(plan.transferred).toEqual({
      'currency.crystal': 48,
      'material.wood': 6,
      'weapon.chitin': 1,
    });
    expect(plan.destroyed).toEqual({});
    expect(plan.victimProgressionLevel).toBe(9);
    expect(plan.victimEquippedWeapon).toBe('weapon.bone');
  });

  it('destroys overflow instead of duplicating it into a full killer stack', () => {
    const plan = planPvpDeathSettlement(inventory(), inventory({
      revision: 3,
      equippedWeapon: 'weapon.chitin',
      hasPet: false,
      stacks: { 'weapon.bone': 1, 'weapon.chitin': 1, 'currency.crystal': 999_990 },
    }), 'lost');
    expect(plan.vaultCrystals).toBe(20);
    expect(plan.transferred['currency.crystal']).toBe(10);
    expect(plan.destroyed['currency.crystal']).toBe(70);
    expect(plan.destroyed['weapon.chitin']).toBe(1);
    expect(plan.victimDeltas['weapon.bone']).toBeUndefined();
    expect(plan.victimDeltas['companion.cave_pup']).toBeUndefined();
    expect(plan.victimProgressionLevel).toBe(1);
    expect(plan.victimEquippedWeapon).toBe('weapon.bone');
  });
});
