import { ITEM_CATALOG, isItemId, type ItemId } from '../economy/catalog.js';
import type { InventorySnapshot, InventoryStacks } from '../inventory/types.js';

export const TRADE_MAX_ITEM_KINDS = 4;
export const TRADE_MAX_CRYSTALS = 1_000_000;
export const TRADE_MAX_DISTANCE = 96;

export interface TradeOffer {
  crystals: number;
  items: Partial<Record<ItemId, number>>;
}

export function canonicalTradeOffer(value: unknown): TradeOffer {
  if (!value || typeof value !== 'object') throw new Error('invalid trade offer');
  const input = value as { crystals?: unknown; items?: unknown };
  if (!Number.isSafeInteger(input.crystals) || (input.crystals as number) < 0 || (input.crystals as number) > TRADE_MAX_CRYSTALS) {
    throw new Error('invalid crystal offer');
  }
  if (!input.items || typeof input.items !== 'object' || Array.isArray(input.items)) throw new Error('invalid item offer');
  const items: InventoryStacks = {};
  for (const [itemId, rawQuantity] of Object.entries(input.items)) {
    if (!isItemId(itemId) || itemId === 'currency.crystal' || ITEM_CATALOG[itemId].category === 'companion') throw new Error(`item cannot be traded: ${itemId}`);
    if (!Number.isSafeInteger(rawQuantity) || rawQuantity < 1 || rawQuantity > ITEM_CATALOG[itemId].maxStack) throw new Error(`invalid trade quantity for ${itemId}`);
    items[itemId] = rawQuantity;
  }
  if (Object.keys(items).length > TRADE_MAX_ITEM_KINDS) throw new Error(`trade supports at most ${TRADE_MAX_ITEM_KINDS} item kinds`);
  return { crystals: input.crystals as number, items };
}

export function assertOfferOwned(snapshot: InventorySnapshot, offer: TradeOffer): void {
  if ((snapshot.stacks['currency.crystal'] ?? 0) < offer.crystals) throw new Error('not enough crystals for this trade');
  for (const [itemId, quantity] of Object.entries(offer.items) as Array<[ItemId, number]>) {
    if ((snapshot.stacks[itemId] ?? 0) < quantity) throw new Error(`not enough ${itemId} for this trade`);
    if (snapshot.equippedWeapon === itemId) throw new Error('equip another weapon before offering this one');
  }
}

export function tradeDeltas(give: TradeOffer, receive: TradeOffer): InventoryStacks {
  const deltas: Record<string, number> = {};
  if (give.crystals) deltas['currency.crystal'] = -give.crystals;
  if (receive.crystals) deltas['currency.crystal'] = (deltas['currency.crystal'] ?? 0) + receive.crystals;
  for (const [itemId, quantity] of Object.entries(give.items)) deltas[itemId] = (deltas[itemId] ?? 0) - quantity;
  for (const [itemId, quantity] of Object.entries(receive.items)) deltas[itemId] = (deltas[itemId] ?? 0) + quantity;
  return Object.fromEntries(Object.entries(deltas).filter(([, quantity]) => quantity !== 0)) as InventoryStacks;
}
