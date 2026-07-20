import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { miningRegionParamsSchema, strikeMiningNodeSchema } from './miningSchema.js';
import { listRegionMining, strikeMiningNode } from './miningService.js';

export const miningRouter = Router();
miningRouter.use(requireAuth);

miningRouter.get('/regions/:rx/:ry/mining', asyncHandler(async (req, res) => {
  const { rx, ry } = miningRegionParamsSchema.parse(req.params);
  res.json(await listRegionMining(rx, ry));
}));

miningRouter.post('/mining/strike', asyncHandler(async (req, res) => {
  const command = strikeMiningNodeSchema.parse(req.body);
  res.json(await strikeMiningNode(req.userId!, command.nodeId, command.expectedRevision, command.idempotencyKey));
}));
