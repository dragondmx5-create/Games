import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { caravanTravelSchema } from './schema.js';
import { getTravelNetwork, travelByCaravan } from './service.js';

export const travelRouter = Router();
travelRouter.use(requireAuth);

travelRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await getTravelNetwork(req.userId!));
}));

travelRouter.post('/caravan', asyncHandler(async (req, res) => {
  const command = caravanTravelSchema.parse(req.body);
  res.json(await travelByCaravan(req.userId!, command.settlementId, command.expectedRevision, command.idempotencyKey));
}));
