import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { interactNpcSchema, regionParamsSchema } from './npcSchema.js';
import { interactWithNpc, listRegionNpcs } from './npcService.js';

export const npcRouter = Router();
npcRouter.use(requireAuth);

npcRouter.get('/regions/:rx/:ry/npcs', asyncHandler(async (req, res) => {
  const { rx, ry } = regionParamsSchema.parse(req.params);
  res.json(await listRegionNpcs(rx, ry));
}));

npcRouter.post('/npcs/interact', asyncHandler(async (req, res) => {
  const command = interactNpcSchema.parse(req.body);
  res.json(await interactWithNpc(req.userId!, command.npcId, command.idempotencyKey));
}));
