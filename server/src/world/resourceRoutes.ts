import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { harvestResourceSchema, openSupplyCrateSchema, openWorldChestSchema, regionParamsSchema } from './resourceSchema.js';
import { harvestResource, listRegionResources } from './resourceService.js';
import { z } from 'zod';
import { respawnCombatPlayer, settleHiddenInstanceDeath } from '../combat/service.js';
import { worldCombatCoordinator } from '../combat/coordinator.js';
import { listRegionWorldChests, openSupplyCrate, openWorldChest } from './chestService.js';

export const worldResourceRouter = Router();
worldResourceRouter.use(requireAuth);

worldResourceRouter.get(
  '/regions/:rx/:ry/resources',
  asyncHandler(async (req, res) => {
    const { rx, ry } = regionParamsSchema.parse(req.params);
    res.json(await listRegionResources(rx, ry));
  }),
);

worldResourceRouter.post(
  '/harvest',
  asyncHandler(async (req, res) => {
    const command = harvestResourceSchema.parse(req.body);
    res.json(await harvestResource(req.userId!, command.nodeId, command.idempotencyKey));
  }),
);



worldResourceRouter.get(
  '/regions/:rx/:ry/chests',
  asyncHandler(async (req, res) => {
    const { rx, ry } = regionParamsSchema.parse(req.params);
    res.json(await listRegionWorldChests(rx, ry));
  }),
);

worldResourceRouter.post(
  '/chests/open',
  asyncHandler(async (req, res) => {
    const command = openWorldChestSchema.parse(req.body);
    res.json(await openWorldChest(req.userId!, command.chestId, command.idempotencyKey));
  }),
);

worldResourceRouter.post(
  '/supply-crates/open',
  asyncHandler(async (req, res) => {
    const command = openSupplyCrateSchema.parse(req.body);
    res.json(await openSupplyCrate(req.userId!, command.idempotencyKey));
  }),
);

worldResourceRouter.post(
  '/instance-death',
  asyncHandler(async (req, res) => {
    if (!worldCombatCoordinator.isHiddenInstance(req.userId!)) {
      res.status(409).json({ error: 'instance death can only be settled while overworld presence is hidden' });
      return;
    }
    const result = await settleHiddenInstanceDeath(req.userId!);
    worldCombatCoordinator.updatePlayerState(req.userId!, result.player);
    res.json(result);
  }),
);

const respawnSchema = z.object({ deathToken: z.string().uuid() }).strict();

worldResourceRouter.post(
  '/respawn',
  asyncHandler(async (req, res) => {
    const { deathToken } = respawnSchema.parse(req.body);
    const result = await respawnCombatPlayer(req.userId!, deathToken);
    worldCombatCoordinator.updatePlayerState(req.userId!, result.player);
    res.json(result);
  }),
);

worldResourceRouter.post('/return-to-capital', (_req, res) => {
  res.status(410).json({ error: 'unrestricted relocation was removed; a server-issued death ticket is required' });
});
