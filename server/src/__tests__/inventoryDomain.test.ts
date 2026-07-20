import { describe, expect, it } from 'vitest';
import { applyDeltas, assertWeaponOwned, canonicalizeStacks } from '../inventory/domain.js';
import { planCraft, planEquip, planPurchase } from '../inventory/commands.js';
import type { InventorySnapshot } from '../inventory/types.js';

function inventory(overrides: Partial<InventorySnapshot> = {}): InventorySnapshot {
  return {
    revision: 4,
    progressionLevel: 5,
    equippedWeapon: 'weapon.bone',
    hasPet: false,
    migratedFromSave: false,
    stacks: { 'weapon.bone': 1 },
    ...overrides,
  };
}

describe('inventory domain', () => {
  it('applies atomic positive and negative deltas without mutating the input', () => {
    const before = { 'weapon.bone': 1, 'material.wood': 8 } as const;
    const after = applyDeltas(before, { 'material.wood': -6, 'weapon.wood_club': 1 });
    expect(after).toEqual({ 'weapon.bone': 1, 'material.wood': 2, 'weapon.wood_club': 1 });
    expect(before).toEqual({ 'weapon.bone': 1, 'material.wood': 8 });
  });

  it('rejects an insufficient balance instead of partially applying a command', () => {
    expect(() => applyDeltas({ 'material.iron': 1 }, { 'material.iron': -2, 'material.wood': 1 })).toThrow('not enough material.iron');
  });

  it('rejects duplicate unique equipment', () => {
    expect(() => applyDeltas({ 'weapon.chitin': 1 }, { 'weapon.chitin': 1 })).toThrow('already owned');
  });

  it('rejects unknown items and stack overflow', () => {
    expect(() => canonicalizeStacks({ hacked_item: 1 })).toThrow('unknown item');
    expect(() => canonicalizeStacks({ 'tool.axe': 2 })).toThrow('max stack');
  });

  it('plans crafting from the canonical recipe catalog', () => {
    const current = inventory({ stacks: { 'weapon.bone': 1, 'material.wood': 8 } });
    const plan = planCraft(current, 'craft_wood_club');
    expect(plan.deltas).toEqual({ 'material.wood': -6, 'weapon.wood_club': 1 });
    expect(applyDeltas(current.stacks, plan.deltas!)).toEqual({
      'weapon.bone': 1,
      'material.wood': 2,
      'weapon.wood_club': 1,
    });
  });

  it('enforces recipe level requirements', () => {
    const lowLevel = inventory({ progressionLevel: 4 });
    expect(() => planCraft(lowLevel, 'craft_prism_halberd')).toThrow('requires level 5');
  });

  it('plans shop purchases and pet ownership', () => {
    const plan = planPurchase('buy_pet');
    expect(plan).toEqual({
      deltas: { 'currency.crystal': -15, 'companion.cave_pup': 1 },
      hasPet: true,
    });
  });

  it('only equips an owned weapon', () => {
    const current = inventory({ stacks: { 'weapon.bone': 1, 'weapon.chitin': 1 } });
    expect(planEquip(current, 'weapon.chitin')).toEqual({ equippedWeapon: 'weapon.chitin' });
    expect(() => assertWeaponOwned(current, 'weapon.crystal')).toThrow('not owned');
  });
});
