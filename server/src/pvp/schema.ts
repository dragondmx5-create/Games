import { z } from 'zod';

const idempotencyKey = z.string().min(8).max(120).regex(/^[A-Za-z0-9:_-]+$/);

export const pvpAdmitSchema = z.object({
  gateId: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  idempotencyKey,
}).strict();

export const pvpExitSchema = z.object({
  sessionId: z.string().uuid(),
  idempotencyKey,
}).strict();

export const pvpReturnSchema = z.object({
  sessionId: z.string().uuid(),
  deathToken: z.string().uuid(),
  idempotencyKey,
}).strict();
