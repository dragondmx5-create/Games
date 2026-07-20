import { describe, expect, it } from 'vitest';
import { CRAFTING_RECIPES, SHOP_ITEMS, WEAPONS } from '../config';
import { ITEM_CATALOG, RECIPES, SHOP_OFFERS } from '../../server/src/economy/catalog';

const materialId = (id: string) => id === 'crystal' ? 'currency.crystal' : id === 'shroom' ? 'consumable.shroom' : `material.${id}`;

describe('client/server economy catalog parity', () => {
  it('contains every client weapon in the server catalog', () => {
    for (const weaponId of Object.keys(WEAPONS)) {
      expect(ITEM_CATALOG[`weapon.${weaponId}` as keyof typeof ITEM_CATALOG]?.category).toBe('weapon');
    }
  });

  it('keeps crafting recipes and costs aligned', () => {
    expect(Object.keys(RECIPES).sort()).toEqual(CRAFTING_RECIPES.map((recipe) => recipe.id).sort());
    for (const recipe of CRAFTING_RECIPES) {
      const server = RECIPES[recipe.id];
      const expectedCosts: Record<string, number> = {};
      for (const [itemId, quantity] of Object.entries(recipe.materials)) expectedCosts[materialId(itemId)] = quantity!;
      if (recipe.crystalCost) expectedCosts['currency.crystal'] = (expectedCosts['currency.crystal'] ?? 0) + recipe.crystalCost;
      expect(server.costs).toEqual(expectedCosts);
      expect(server.minLevel).toBe(recipe.minLevel ?? 1);
      const expectedOutput = recipe.outputKind === 'weapon' ? { [`weapon.${recipe.weapon}`]: 1 }
        : recipe.outputKind === 'armor' ? { [`armor.${recipe.armor}`]: 1 }
          : { 'container.supply_crate': 1 };
      expect(server.outputs).toEqual(expectedOutput);
    }
  });

  it('keeps regular shop offer prices aligned', () => {
    expect(Object.keys(SHOP_OFFERS).sort()).toEqual(SHOP_ITEMS.map((offer) => offer.id).sort());
    for (const offer of SHOP_ITEMS) {
      const server = SHOP_OFFERS[offer.id];
      expect(server.crystalCost).toBe(offer.cost);
      const expected = offer.kind === 'weapon' ? { [`weapon.${offer.weapon}`]: 1 }
        : offer.kind === 'shrooms' ? { 'consumable.shroom': offer.shroomAmount }
          : offer.kind === 'pet' ? { 'companion.cave_pup': 1 }
            : offer.kind === 'tool' ? { [`tool.${offer.tool}`]: 1 }
              : offer.kind === 'armor' ? { [`armor.${offer.armor}`]: 1 }
                : { 'container.supply_crate': 1 };
      expect(server.outputs).toEqual(expected);
    }
  });
});
