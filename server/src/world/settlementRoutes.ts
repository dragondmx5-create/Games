import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { regionParamsSchema } from './resourceSchema.js';
import { collectAnimalSchema, harvestFarmSchema, plantFarmSchema } from './settlementSchema.js';
import { collectSettlementAnimal, harvestFarmPlot, listSettlementProduction, plantFarmPlot } from './settlementService.js';

export const settlementRouter = Router();
settlementRouter.use(requireAuth);

settlementRouter.get('/regions/:rx/:ry/settlement', asyncHandler(async (req, res) => {
  const { rx, ry } = regionParamsSchema.parse(req.params);
  res.json(await listSettlementProduction(req.userId!, rx, ry));
}));

settlementRouter.post('/farm/plant', asyncHandler(async (req, res) => {
  const command = plantFarmSchema.parse(req.body);
  res.json(await plantFarmPlot(req.userId!, command.plotId, command.expectedRevision, command.idempotencyKey));
}));

settlementRouter.post('/farm/harvest', asyncHandler(async (req, res) => {
  const command = harvestFarmSchema.parse(req.body);
  res.json(await harvestFarmPlot(req.userId!, command.plotId, command.expectedRevision, command.idempotencyKey));
}));

settlementRouter.post('/animals/collect', asyncHandler(async (req, res) => {
  const command = collectAnimalSchema.parse(req.body);
  res.json(await collectSettlementAnimal(req.userId!, command.animalId, command.expectedRevision, command.idempotencyKey));
}));
