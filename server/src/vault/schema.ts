import { z } from 'zod';

export const claimSchema = z.object({
  proofId: z.string().uuid(),
}).strict();
