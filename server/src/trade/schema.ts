import { z } from 'zod';

const commandKey = z.string().min(8).max(120).regex(/^[a-zA-Z0-9._:-]+$/);
const offerSchema = z.object({
  crystals: z.number().int().min(0).max(1_000_000),
  items: z.record(z.string(), z.number().int().positive()).refine((items) => Object.keys(items).length <= 4, 'too many item kinds'),
}).strict();

export const createTradeSchema = z.object({ targetUsername: z.string().min(3).max(32) }).strict();
export const updateTradeOfferSchema = z.object({ offer: offerSchema, expectedRevision: z.number().int().nonnegative() }).strict();
export const acceptTradeSchema = z.object({ idempotencyKey: commandKey }).strict();
export const cancelTradeSchema = z.object({}).strict();
