import { z } from 'zod';

const idempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export const claimQuestSchema = z.object({
  questId: z.string().min(3).max(80),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey,
}).strict();

export const claimStoryQuestSchema = z.object({
  storyId: z.string().min(3).max(80),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey,
}).strict();
