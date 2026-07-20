import { z } from 'zod';

const commandKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export const enterUnderworldSchema = z.object({}).strict();
export const exitUnderworldSchema = z.object({ sessionToken: z.string().uuid() }).strict();
export const purchaseUnderworldSchema = z.object({
  sessionToken: z.string().uuid(),
  offerId: z.enum(['contraband-cache', 'lost-map', 'clean-papers', 'dungeon-key', 'anonymous-contract']),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: commandKey,
}).strict();
