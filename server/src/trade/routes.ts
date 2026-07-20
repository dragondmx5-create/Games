import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { acceptTradeSchema, cancelTradeSchema, createTradeSchema, updateTradeOfferSchema } from './schema.js';
import { acceptPlayerTrade, cancelPlayerTrade, createPlayerTrade, listPlayerTrades, updatePlayerTradeOffer } from './service.js';

export const tradeRouter = Router();
tradeRouter.use(requireAuth);
tradeRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await listPlayerTrades(req.userId!));
}));
tradeRouter.post('/', asyncHandler(async (req, res) => {
  const { targetUsername } = createTradeSchema.parse(req.body);
  res.json(await createPlayerTrade(req.userId!, targetUsername));
}));
tradeRouter.put('/:tradeId/offer', asyncHandler(async (req, res) => {
  const command = updateTradeOfferSchema.parse(req.body);
  res.json(await updatePlayerTradeOffer(req.userId!, req.params.tradeId, command.offer, command.expectedRevision));
}));
tradeRouter.post('/:tradeId/accept', asyncHandler(async (req, res) => {
  const { idempotencyKey } = acceptTradeSchema.parse(req.body);
  res.json(await acceptPlayerTrade(req.userId!, req.params.tradeId, idempotencyKey));
}));
tradeRouter.post('/:tradeId/cancel', asyncHandler(async (req, res) => {
  cancelTradeSchema.parse(req.body ?? {});
  res.json(await cancelPlayerTrade(req.userId!, req.params.tradeId));
}));
