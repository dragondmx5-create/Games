import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { enterUnderworld, exitUnderworld, getUnderworldState, purchaseUnderworldOffer } from './service.js';
import { enterUnderworldSchema, exitUnderworldSchema, purchaseUnderworldSchema } from './schema.js';

export const underworldRouter = Router();
underworldRouter.use(requireAuth);

underworldRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await getUnderworldState(req.userId!));
}));

underworldRouter.post('/enter', asyncHandler(async (req, res) => {
  enterUnderworldSchema.parse(req.body ?? {});
  res.json(await enterUnderworld(req.userId!));
}));

underworldRouter.post('/exit', asyncHandler(async (req, res) => {
  const { sessionToken } = exitUnderworldSchema.parse(req.body);
  res.json({ state: await exitUnderworld(req.userId!, sessionToken) });
}));

underworldRouter.post('/purchase', asyncHandler(async (req, res) => {
  const command = purchaseUnderworldSchema.parse(req.body);
  res.json(await purchaseUnderworldOffer(req.userId!, command.sessionToken, command.offerId, command.expectedRevision, command.idempotencyKey));
}));
