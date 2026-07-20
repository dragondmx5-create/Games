import { z } from 'zod';
import { OVERWORLD_WORLD_RADIUS } from './worldBounds.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from './resourceLayout.js';
import { combatClientMessageSchema } from '../combat/protocol.js';

const MAX_PIXEL = RESOURCE_REGION_SIZE * RESOURCE_TILE_SIZE;

const positionMessageSchema = z.object({
  type: z.literal('position'),
  seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  rx: z.number().int().min(-OVERWORLD_WORLD_RADIUS).max(OVERWORLD_WORLD_RADIUS),
  ry: z.number().int().min(-OVERWORLD_WORLD_RADIUS).max(OVERWORLD_WORLD_RADIUS),
  x: z.number().finite().min(0).max(MAX_PIXEL),
  y: z.number().finite().min(0).max(MAX_PIXEL),
}).strict();

const visibilityMessageSchema = z.object({
  type: z.literal('visibility'),
  active: z.boolean(),
}).strict();

const worldClientMessageSchema = z.discriminatedUnion('type', [positionMessageSchema, visibilityMessageSchema, ...combatClientMessageSchema.options]);

export type WorldPositionMessage = z.infer<typeof positionMessageSchema>;
export type WorldVisibilityMessage = z.infer<typeof visibilityMessageSchema>;
export type WorldClientMessage = z.infer<typeof worldClientMessageSchema>;

export function parseWorldClientMessage(raw: string): WorldClientMessage | null {
  if (raw.length > 512) return null;
  try {
    const parsed = worldClientMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
