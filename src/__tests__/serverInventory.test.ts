import { describe, expect, it } from 'vitest';
import { newPlayer } from '../entities';
import { generateRegion } from '../world';
import { applyServerInventorySnapshot } from '../serverInventory';

describe('server inventory projection', () => {
  it('projects canonical stacks and equipment into the legacy Player view', () => {
    const player = newPlayer(generateRegion(0, 0, 7));
    const result = applyServerInventorySnapshot(player, {
      revision: 4,
      progressionLevel: 6,
      equippedWeapon: 'weapon.iron_falchion',
      hasPet: true,
      migratedFromSave: true,
      stacks: {
        'currency.crystal': 12,
        'material.wood': 9,
        'weapon.bone': 1,
        'weapon.iron_falchion': 1,
        'tool.axe': 1,
        'armor.leather': 1,
        'companion.cave_pup': 1,
      },
    });
    expect(player.loot).toBe(12);
    expect(player.wood).toBe(9);
    expect(player.weapons).toEqual(['bone', 'iron_falchion']);
    expect(player.weapons[player.weaponIdx]).toBe('iron_falchion');
    expect(player.tools).toEqual(['axe']);
    expect(player.armor).toEqual(['leather']);
    expect(player.level).toBe(6);
    expect(result.hasPet).toBe(true);
  });
});
