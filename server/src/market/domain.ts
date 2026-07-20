import { ITEM_CATALOG, type ItemId } from '../economy/catalog.js';

export const MARKET_FEE_BPS = 500;
export const MARKET_MAX_QUANTITY = 10_000;
export const MARKET_MAX_UNIT_PRICE = 100_000;

export function marketFee(totalPrice: number): number {
  if (!Number.isSafeInteger(totalPrice) || totalPrice < 0) throw new Error('invalid market total');
  return Math.max(1, Math.floor(totalPrice * MARKET_FEE_BPS / 10_000));
}

export function sellerMarketProceeds(quantity: number, unitPrice: number): { total: number; fee: number; proceeds: number } {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MARKET_MAX_QUANTITY) throw new Error('invalid market quantity');
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 1 || unitPrice > MARKET_MAX_UNIT_PRICE) throw new Error('invalid market price');
  const total = quantity * unitPrice;
  if (!Number.isSafeInteger(total)) throw new Error('market total is too large');
  const fee = marketFee(total);
  return { total, fee, proceeds: total - fee };
}

export function isMarketTradableItem(itemId: ItemId): boolean {
  const item = ITEM_CATALOG[itemId];
  return item.category !== 'currency' && item.category !== 'companion';
}
