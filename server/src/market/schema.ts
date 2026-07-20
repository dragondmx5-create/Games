import { z } from 'zod';
import { ITEM_IDS } from '../economy/catalog.js';

const commandKey = z.string().min(8).max(120).regex(/^[a-zA-Z0-9._:-]+$/);
const tradableItemId = z.enum(ITEM_IDS).refine((itemId) => itemId !== 'currency.crystal' && itemId !== 'companion.cave_pup', 'item cannot be listed');

export const marketListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
}).strict();

export const createMarketListingSchema = z.object({
  itemId: tradableItemId,
  quantity: z.number().int().min(1).max(10_000),
  unitPrice: z.number().int().min(1).max(100_000),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: commandKey,
}).strict();

export const marketListingCommandSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: commandKey,
}).strict();
