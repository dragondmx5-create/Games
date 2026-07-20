import { describe, expect, it } from 'vitest';
import { resolveDeathInventory, type CarriedInventory } from '../overworld/deathRules';

const inventory: CarriedInventory = {
  loot: 100,
  shrooms: 40,
  wood: 20,
  iron: 10,
  meat: 8,
  hide: 6,
  feathers: 4,
  chests: 4,
  weapons: ['bone', 'chitin', 'crystal'],
  tools: ['axe', 'pickaxe'],
  armor: ['leather', 'iron'],
};

describe('zone death rules', () => {
  it('retains everything in a sanctuary', () => {
    const outcome = resolveDeathInventory('none', inventory);
    expect(outcome.dropped.loot).toBe(0);
    expect(outcome.retained.loot).toBe(100);
    expect(outcome.resetProgression).toBe(false);
  });

  it('drops only a quarter of supplies on the frontier', () => {
    const outcome = resolveDeathInventory('supplies', inventory);
    expect(outcome.dropped.loot).toBe(25);
    expect(outcome.retained.weapons).toEqual(inventory.weapons);
    expect(outcome.dropped.tools).toEqual([]);
  });

  it('drops most supplies and one non-starter weapon in a fracture', () => {
    const outcome = resolveDeathInventory('partial', inventory);
    expect(outcome.dropped.loot).toBe(60);
    expect(outcome.dropped.weapons).toEqual(['crystal']);
    expect(outcome.retained.weapons).toEqual(['bone', 'chitin']);
    expect(outcome.resetProgression).toBe(false);
  });

  it('uses full loss in lost territory and dungeons', () => {
    const outcome = resolveDeathInventory('full', inventory);
    expect(outcome.dropped.loot).toBe(100);
    expect(outcome.dropped.weapons).toEqual(['chitin', 'crystal']);
    expect(outcome.retained.weapons).toEqual(['bone']);
    expect(outcome.resetProgression).toBe(true);
  });
});
