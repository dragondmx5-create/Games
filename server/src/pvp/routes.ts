import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pvpAdmitSchema, pvpExitSchema, pvpReturnSchema } from './schema.js';
import { admitPvp, exitPvp, getActivePvpSession, returnFromPvpDeath } from './service.js';

export const pvpRouter = Router();
pvpRouter.use(requireAuth);

pvpRouter.get('/active', asyncHandler(async (req, res) => {
  res.json({ pvp: await getActivePvpSession(req.userId!) });
}));

pvpRouter.post('/admit', asyncHandler(async (req, res) => {
  res.json(await admitPvp(req.userId!, pvpAdmitSchema.parse(req.body)));
}));

pvpRouter.post('/exit', asyncHandler(async (req, res) => {
  res.json(await exitPvp(req.userId!, pvpExitSchema.parse(req.body)));
}));

pvpRouter.post('/return', asyncHandler(async (req, res) => {
  res.json(await returnFromPvpDeath(req.userId!, pvpReturnSchema.parse(req.body)));
}));
