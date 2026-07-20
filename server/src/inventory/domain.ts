import { ITEM_CATALOG, ItemId, isItemId } from '../economy/catalog.js';
import type { InventorySnapshot, InventoryStacks } from './types.js';

export class InventoryDomainError extends Error {
  constructor(
    public readonly code: 'invalid_item' | 'invalid_quantity' | 'insufficient_items' | 'stack_limit' | 'already_owned' | 'not_owned',
    message: string,
  ) {
    super(message);
  }
}

export function canonicalizeStacks(input: Readonly<Record<string, number>>): InventoryStacks {
  const result: InventoryStacks = {};
  for (const [itemId, quantity] of Object.entries(input)) {
    if (!isItemId(itemId)) throw new InventoryDomainError('invalid_item', `unknown item: ${itemId}`);
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new InventoryDomainError('invalid_quantity', `invalid quantity for ${itemId}`);
    }
    if (quantity === 0) continue;
    const definition = ITEM_CATALOG[itemId];
    if (quantity > definition.maxStack) {
      throw new InventoryDomainError('stack_limit', `${itemId} exceeds max stack ${definition.maxStack}`);
    }
    result[itemId] = quantity;
  }
  return result;
}

export function applyDeltas(stacks: InventoryStacks, deltas: Readonly<Record<string, number>>): InventoryStacks {
  const next: Record<string, number> = { ...stacks };
  for (const [rawItemId, delta] of Object.entries(deltas)) {
    if (!isItemId(rawItemId)) throw new InventoryDomainError('invalid_item', `unknown item: ${rawItemId}`);
    if (!Number.isSafeInteger(delta) || delta === 0) {
      throw new InventoryDomainError('invalid_quantity', `invalid delta for ${rawItemId}`);
    }
    const current = next[rawItemId] ?? 0;
    const quantity = current + delta;
    const definition = ITEM_CATALOG[rawItemId];
    if (quantity < 0) throw new InventoryDomainError('insufficient_items', `not enough ${rawItemId}`);
    if (definition.unique && delta > 0 && current > 0) {
      throw new InventoryDomainError('already_owned', `${rawItemId} is already owned`);
    }
    if (quantity > definition.maxStack) {
      throw new InventoryDomainError('stack_limit', `${rawItemId} exceeds max stack ${definition.maxStack}`);
    }
    if (quantity === 0) delete next[rawItemId];
    else next[rawItemId] = quantity;
  }
  return canonicalizeStacks(next);
}

export function assertWeaponOwned(snapshot: InventorySnapshot, weaponId: ItemId): void {
  const definition = ITEM_CATALOG[weaponId];
  if (definition.category !== 'weapon') throw new InventoryDomainError('invalid_item', `${weaponId} is not a weapon`);
  if ((snapshot.stacks[weaponId] ?? 0) < 1) throw new InventoryDomainError('not_owned', `${weaponId} is not owned`);
}

export function combineDeltas(...parts: ReadonlyArray<Readonly<Partial<Record<ItemId, number>>>>): InventoryStacks {
  const combined: Record<string, number> = {};
  for (const part of parts) {
    for (const [itemId, amount] of Object.entries(part)) {
      if (!amount) continue;
      combined[itemId] = (combined[itemId] ?? 0) + amount;
    }
  }
  return canonicalizeSignedDeltas(combined);
}

export function canonicalizeSignedDeltas(input: Readonly<Record<string, number>>): InventoryStacks {
  const result: Record<string, number> = {};
  for (const [itemId, quantity] of Object.entries(input)) {
    if (!isItemId(itemId)) throw new InventoryDomainError('invalid_item', `unknown item: ${itemId}`);
    if (!Number.isSafeInteger(quantity)) throw new InventoryDomainError('invalid_quantity', `invalid delta for ${itemId}`);
    if (quantity !== 0) result[itemId] = quantity;
  }
  return result as InventoryStacks;
}
