import { describe, expect, it } from 'vitest';
import { attackProfile, applyProgression, planDeathLoss, reduceIncomingDamage, rollEnemyDrops, targetInsideAttackArc } from '../combat/domain.js';
import type { InventorySnapshot } from '../inventory/types.js';

describe('combat domain', () => {
  it('derives basic and ability attacks from the server catalog', () => {
    expect(attackProfile('weapon.bone', false)).toMatchObject({ damage: 1, range: 28, cooldownMs: 320 });
    expect(attackProfile('weapon.bone', true).damage).toBe(3);
    expect(attackProfile('weapon.chitin', true).arc).toBeCloseTo(Math.PI * 2);
  });

  it('validates range and wrapped facing arcs', () => {
    expect(targetInsideAttackArc(0, 0, Math.PI, -10, 0, 20, Math.PI / 2)).toBe(true);
    expect(targetInsideAttackArc(0, 0, Math.PI - 0.05, -10, -1, 20, Math.PI / 2)).toBe(true);
    expect(targetInsideAttackArc(0, 0, 0, -10, 0, 20, Math.PI / 2)).toBe(false);
    expect(targetInsideAttackArc(0, 0, 0, 30, 0, 20, Math.PI * 2)).toBe(false);
  });

  it('rolls drops deterministically when random values are injected', () => {
    const values = [0.01, 0.9];
    const drops = rollEnemyDrops('bug', () => values.shift() ?? 0);
    expect(drops).toEqual({ 'currency.crystal': 1 });
  });

  it('levels through multiple thresholds and raises max hp', () => {
    expect(applyProgression(1, 19, 34)).toEqual({ level: 3, xp: 1, maxHp: 14, leveledUp: true });
  });

  it('applies armor while preserving at least one damage', () => {
    expect(reduceIncomingDamage(10, 0.4)).toBe(6);
    expect(reduceIncomingDamage(1, 0.9)).toBe(1);
  });

  it('uses region-specific death loss without dropping the starter weapon', () => {
    const snapshot: InventorySnapshot = {
      revision: 5,
      progressionLevel: 7,
      equippedWeapon: 'weapon.crystal',
      hasPet: true,
      migratedFromSave: true,
      stacks: {
        'weapon.bone': 1,
        'weapon.chitin': 1,
        'weapon.crystal': 1,
        'tool.axe': 1,
        'armor.iron': 1,
        'currency.crystal': 100,
        'material.wood': 20,
      },
    };
    const frontier = planDeathLoss(snapshot, 'frontier');
    expect(frontier.dropped['currency.crystal']).toBe(25);
    expect(frontier.retained['weapon.crystal']).toBe(1);

    const fracture = planDeathLoss(snapshot, 'fracture');
    expect(fracture.dropped['currency.crystal']).toBe(60);
    expect(fracture.dropped['weapon.crystal']).toBe(1);
    expect(fracture.equippedWeapon).toBe('weapon.bone');

    const lost = planDeathLoss(snapshot, 'lost');
    expect(lost.dropped['weapon.chitin']).toBe(1);
    expect(lost.dropped['tool.axe']).toBe(1);
    expect(lost.retained).toEqual({ 'weapon.bone': 1 });
    expect(lost.progressionLevel).toBe(1);
  });
});
