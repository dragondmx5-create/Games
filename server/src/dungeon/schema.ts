import { z } from 'zod';

const idempotencyKey = z.string().min(8).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const runId = z.string().uuid();
const expectedRevision = z.number().int().min(0);

export const startDungeonSchema = z.object({
  dungeonId: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  useForbiddenKey: z.boolean().default(false),
  idempotencyKey,
}).strict();

export const dungeonMoveSchema = z.object({
  runId,
  expectedRevision,
  idempotencyKey,
  moveX: z.number().finite().min(-1).max(1),
  moveY: z.number().finite().min(-1).max(1),
  running: z.boolean(),
  facing: z.number().finite().min(-Math.PI * 2).max(Math.PI * 2),
  dtMs: z.number().int().min(16).max(250),
}).strict();

export const dungeonAttackSchema = z.object({
  runId,
  expectedRevision,
  idempotencyKey,
  ability: z.boolean(),
  facing: z.number().finite().min(-Math.PI * 2).max(Math.PI * 2),
}).strict();

export const dungeonChestSchema = z.object({
  runId,
  expectedRevision,
  idempotencyKey,
  chestId: z.string().min(8).max(160).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();

export const dungeonCompleteFloorSchema = z.object({
  runId,
  expectedRevision,
  idempotencyKey,
}).strict();

export const dungeonAdvanceSchema = dungeonCompleteFloorSchema;
export const dungeonExitSchema = dungeonCompleteFloorSchema;

export const dungeonDeathSchema = z.object({
  runId,
  idempotencyKey,
}).strict();
