import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getOrCreateWorldSeed } from './service.js';

export const worldRouter = Router();

// public — the client needs the seed before login even completes (the title
// screen could pre-generate), and it's not a secret: every player shares it.
// Created lazily on first request with a random int32 (the client's
// mulberry32 PRNG truncates to 32 bits anyway), then never changes unless
// the owner deliberately resets the row.
worldRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ worldSeed: await getOrCreateWorldSeed() });
  }),
);
