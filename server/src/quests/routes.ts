import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { claimQuestSchema, claimStoryQuestSchema } from './schema.js';
import { claimPlayerQuest, claimPlayerStory, listPlayerQuests } from './service.js';

export const questRouter = Router();
questRouter.use(requireAuth);

questRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await listPlayerQuests(req.userId!));
}));

questRouter.post('/claim', asyncHandler(async (req, res) => {
  const command = claimQuestSchema.parse(req.body);
  res.json(await claimPlayerQuest(req.userId!, command.questId, command.expectedRevision, command.idempotencyKey));
}));

questRouter.post('/stories/claim', asyncHandler(async (req, res) => {
  const command = claimStoryQuestSchema.parse(req.body);
  res.json(await claimPlayerStory(req.userId!, command.storyId, command.expectedRevision, command.idempotencyKey));
}));
