import { describe, expect, it } from 'vitest';
import { assertInventoryRevision, hashInventoryCommand, replayStoredCommand } from '../inventory/idempotency.js';
import type { InventoryCommandResult } from '../inventory/types.js';

const result: InventoryCommandResult = {
  kind: 'craft',
  replayed: false,
  inventory: {
    revision: 2,
    progressionLevel: 1,
    equippedWeapon: 'weapon.bone',
    hasPet: false,
    migratedFromSave: false,
    stacks: { 'weapon.bone': 1 },
  },
  deltas: {},
};

describe('inventory command concurrency guards', () => {
  it('produces a stable hash for the same command', () => {
    expect(hashInventoryCommand('craft', { recipeId: 'craft_wood_club' }, 1))
      .toBe(hashInventoryCommand('craft', { recipeId: 'craft_wood_club' }, 1));
  });

  it('treats a different payload or expected revision as a different command', () => {
    const base = hashInventoryCommand('craft', { recipeId: 'craft_wood_club' }, 1);
    expect(hashInventoryCommand('craft', { recipeId: 'craft_hide_vest' }, 1)).not.toBe(base);
    expect(hashInventoryCommand('craft', { recipeId: 'craft_wood_club' }, 2)).not.toBe(base);
  });

  it('returns the original result on a safe retry', () => {
    const hash = hashInventoryCommand('craft', { recipeId: 'craft_wood_club' }, 1);
    expect(replayStoredCommand({ requestHash: hash, result }, hash)).toEqual({ ...result, replayed: true });
  });

  it('rejects reusing an idempotency key for a different command', () => {
    expect(() => replayStoredCommand({ requestHash: 'old', result }, 'new')).toThrow('different command');
  });

  it('rejects stale optimistic revisions', () => {
    expect(() => assertInventoryRevision(7, 6)).toThrow('current revision is 7');
    expect(() => assertInventoryRevision(7, 7)).not.toThrow();
    expect(() => assertInventoryRevision(7, undefined)).not.toThrow();
  });
});
