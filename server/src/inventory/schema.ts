import { z } from 'zod';
import { ITEM_IDS } from '../economy/catalog.js';

const idempotencyKey = z.string().min(8).max(100).regex(/^[a-zA-Z0-9._:-]+$/);
const commandMeta = {
  idempotencyKey,
  expectedRevision: z.number().int().min(0),
};

export const craftCommandSchema = z.object({
  ...commandMeta,
  recipeId: z.string().min(3).max(80),
});

export const purchaseCommandSchema = z.object({
  ...commandMeta,
  offerId: z.string().min(3).max(80),
});

export const equipCommandSchema = z.object({
  ...commandMeta,
  weaponId: z.enum(ITEM_IDS),
});
