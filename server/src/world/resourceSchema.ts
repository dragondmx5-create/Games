import { z } from 'zod';
import { OVERWORLD_WORLD_RADIUS } from './worldBounds.js';

export const regionParamsSchema = z.object({
  rx: z.coerce.number().int().min(-OVERWORLD_WORLD_RADIUS).max(OVERWORLD_WORLD_RADIUS),
  ry: z.coerce.number().int().min(-OVERWORLD_WORLD_RADIUS).max(OVERWORLD_WORLD_RADIUS),
});

export const harvestResourceSchema = z.object({
  nodeId: z.string().min(12).max(160),
  idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();

export const openWorldChestSchema = z.object({
  chestId: z.string().min(12).max(180),
  idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();

export const openSupplyCrateSchema = z.object({
  idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
