import { z } from 'zod';

const commandKey = z.string().min(8).max(120).regex(/^[a-zA-Z0-9._:-]+$/);

export const caravanTravelSchema = z.object({
  settlementId: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: commandKey,
}).strict();
