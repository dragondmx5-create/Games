import { z } from 'zod';

const commandKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const revision = z.number().int().nonnegative();

export const plantFarmSchema = z.object({
  plotId: z.string().min(12).max(120),
  expectedRevision: revision,
  idempotencyKey: commandKey,
}).strict();

export const harvestFarmSchema = plantFarmSchema;

export const collectAnimalSchema = z.object({
  animalId: z.string().min(12).max(120),
  expectedRevision: revision,
  idempotencyKey: commandKey,
}).strict();
