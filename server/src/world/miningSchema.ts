import { z } from 'zod';
import { OVERWORLD_WORLD_RADIUS } from './worldBounds.js';

export const miningRegionParamsSchema = z.object({
  rx: z.coerce.number().int().min(-OVERWORLD_WORLD_RADIUS).max(OVERWORLD_WORLD_RADIUS),
  ry: z.coerce.number().int().min(-OVERWORLD_WORLD_RADIUS).max(OVERWORLD_WORLD_RADIUS),
}).strict();

export const strikeMiningNodeSchema = z.object({
  nodeId: z.string().min(18).max(180),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
