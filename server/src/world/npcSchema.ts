import { z } from 'zod';
import { regionParamsSchema } from './resourceSchema.js';

export { regionParamsSchema };

export const interactNpcSchema = z.object({
  npcId: z.string().min(12).max(120).regex(/^[A-Za-z0-9:_-]+$/),
  idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
