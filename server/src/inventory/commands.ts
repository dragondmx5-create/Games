import { RECIPES, SHOP_OFFERS, type ItemId } from '../economy/catalog.js';
import { HttpError } from '../middleware/httpError.js';
import { assertWeaponOwned, combineDeltas } from './domain.js';
import type { InventorySnapshot, InventoryStacks } from './types.js';

export interface PlannedMutation {
  deltas?: InventoryStacks;
  equippedWeapon?: ItemId;
  hasPet?: boolean;
  progressionLevel?: number;
}

export function planCraft(snapshot: InventorySnapshot, recipeId: string): PlannedMutation {
  const recipe = RECIPES[recipeId];
  if (!recipe) throw new HttpError(404, 'unknown recipe');
  if (snapshot.progressionLevel < recipe.minLevel) throw new HttpError(409, `recipe requires level ${recipe.minLevel}`);
  const negativeCosts = Object.fromEntries(Object.entries(recipe.costs).map(([itemId, amount]) => [itemId, -(amount ?? 0)]));
  return { deltas: combineDeltas(negativeCosts, recipe.outputs) };
}

export function planPurchase(offerId: string): PlannedMutation {
  const offer = SHOP_OFFERS[offerId];
  if (!offer) throw new HttpError(404, 'unknown shop offer');
  return {
    deltas: combineDeltas({ 'currency.crystal': -offer.crystalCost }, offer.outputs),
    hasPet: offer.outputs['companion.cave_pup'] ? true : undefined,
  };
}

export function planEquip(snapshot: InventorySnapshot, weaponId: ItemId): PlannedMutation {
  assertWeaponOwned(snapshot, weaponId);
  return { equippedWeapon: weaponId };
}
