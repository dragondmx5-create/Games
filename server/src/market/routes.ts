import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { buyMarketListing, cancelMarketListing, createMarketListing, listMarketListings } from './service.js';
import { createMarketListingSchema, marketListQuerySchema, marketListingCommandSchema } from './schema.js';

export const marketRouter = Router();
marketRouter.use(requireAuth);

marketRouter.get('/listings', asyncHandler(async (req, res) => {
  const { limit } = marketListQuerySchema.parse(req.query);
  res.json(await listMarketListings(req.userId!, limit));
}));

marketRouter.post('/listings', asyncHandler(async (req, res) => {
  const command = createMarketListingSchema.parse(req.body);
  res.json(await createMarketListing(req.userId!, command.itemId, command.quantity, command.unitPrice, command.expectedRevision, command.idempotencyKey));
}));

marketRouter.post('/listings/:listingId/cancel', asyncHandler(async (req, res) => {
  const command = marketListingCommandSchema.parse(req.body);
  res.json(await cancelMarketListing(req.userId!, req.params.listingId, command.expectedRevision, command.idempotencyKey));
}));

marketRouter.post('/listings/:listingId/buy', asyncHandler(async (req, res) => {
  const command = marketListingCommandSchema.parse(req.body);
  res.json(await buyMarketListing(req.userId!, req.params.listingId, command.expectedRevision, command.idempotencyKey));
}));
