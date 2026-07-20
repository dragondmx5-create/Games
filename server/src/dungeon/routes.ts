import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  dungeonAdvanceSchema,
  dungeonAttackSchema,
  dungeonChestSchema,
  dungeonCompleteFloorSchema,
  dungeonDeathSchema,
  dungeonExitSchema,
  dungeonMoveSchema,
  startDungeonSchema,
} from './schema.js';
import { dungeonMoveLimiter } from '../middleware/rateLimit.js';
import {
  advanceDungeonFloor,
  attackDungeonEnemies,
  completeDungeonFloor,
  exitDungeonRun,
  getActiveDungeonRun,
  moveDungeonPlayer,
  openDungeonChest,
  settleDungeonDeath,
  startDungeonRun,
} from './service.js';

export const dungeonRouter = Router();
dungeonRouter.use(requireAuth);

dungeonRouter.get('/active', asyncHandler(async (req, res) => {
  res.json({ dungeon: await getActiveDungeonRun(req.userId!) });
}));

dungeonRouter.post('/start', asyncHandler(async (req, res) => {
  res.json(await startDungeonRun(req.userId!, startDungeonSchema.parse(req.body)));
}));

dungeonRouter.post('/move', dungeonMoveLimiter, asyncHandler(async (req, res) => {
  res.json(await moveDungeonPlayer(req.userId!, dungeonMoveSchema.parse(req.body)));
}));

dungeonRouter.post('/attack', asyncHandler(async (req, res) => {
  res.json(await attackDungeonEnemies(req.userId!, dungeonAttackSchema.parse(req.body)));
}));

dungeonRouter.post('/chests/open', asyncHandler(async (req, res) => {
  res.json(await openDungeonChest(req.userId!, dungeonChestSchema.parse(req.body)));
}));

dungeonRouter.post('/floors/complete', asyncHandler(async (req, res) => {
  res.json(await completeDungeonFloor(req.userId!, dungeonCompleteFloorSchema.parse(req.body)));
}));

dungeonRouter.post('/floors/advance', asyncHandler(async (req, res) => {
  res.json(await advanceDungeonFloor(req.userId!, dungeonAdvanceSchema.parse(req.body)));
}));

dungeonRouter.post('/exit', asyncHandler(async (req, res) => {
  res.json(await exitDungeonRun(req.userId!, dungeonExitSchema.parse(req.body)));
}));

dungeonRouter.post('/death', asyncHandler(async (req, res) => {
  res.json(await settleDungeonDeath(req.userId!, dungeonDeathSchema.parse(req.body)));
}));
