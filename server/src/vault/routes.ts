import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../auth/middleware.js';
import { claimSchema } from './schema.js';
import { claimDungeonVaultProof, listPendingDungeonVaultProofs } from './service.js';

export const vaultRouter = Router();

async function vaultCrystals(layer: 0 | 1 | 5): Promise<number> {
  const vault = await prisma.vault.upsert({ where: { layer }, create: { layer, crystals: 0 }, update: {} });
  return vault.crystals;
}

// Public totals only. Vault mutation is deliberately handled by the atomic
// proof-claim service; there is no amount-based contribution endpoint for a
// modified client to mint crystals through. Legacy death-save bags credit zero.
vaultRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [layer0, layer1, layer5] = await Promise.all([vaultCrystals(0), vaultCrystals(1), vaultCrystals(5)]);
    res.json({ layer0, layer1, layer5 });
  }),
);


vaultRouter.get(
  '/proofs',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ proofs: await listPendingDungeonVaultProofs(req.userId!) });
  }),
);

vaultRouter.post(
  '/claim',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { proofId } = claimSchema.parse(req.body);
    const result = await claimDungeonVaultProof(req.userId!, proofId);
    res.json(result);
  }),
);
