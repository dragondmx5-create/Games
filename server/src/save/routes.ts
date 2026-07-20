import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../auth/middleware.js';
import { z } from 'zod';
import { saveDataSchema } from './schema.js';
import { recordSaveAnomalies } from './audit.js';
import { persistDeathAndForfeit } from '../vault/service.js';
import { serializableTransaction } from '../db/transaction.js';
import { canonicalizeSaveData } from './canonicalize.js';

export const saveRouter = Router();

saveRouter.use(requireAuth);


const deathSaveSchema = z.object({
  save: saveDataSchema,
  forfeitBagIds: z.array(z.string().min(8).max(80)).max(32),
});

saveRouter.post(
  '/death',
  asyncHandler(async (req, res) => {
    const { save, forfeitBagIds } = deathSaveSchema.parse(req.body);
    const result = await persistDeathAndForfeit(req.userId!, save, forfeitBagIds);
    res.json(result);
  }),
);

saveRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const row = await prisma.saveGame.findUnique({ where: { userId: req.userId! } });
    if (!row) { res.json({ save: null }); return; }
    const parsed = saveDataSchema.safeParse(row.data);
    if (!parsed.success) { res.json({ save: row.data }); return; }
    const save = await serializableTransaction((tx) => canonicalizeSaveData(tx, req.userId!, parsed.data));
    res.json({ save });
  }),
);

saveRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const requested = saveDataSchema.parse(req.body);
    const prev = await prisma.saveGame.findUnique({ where: { userId: req.userId! } });
    const { row, data } = await serializableTransaction(async (tx) => {
      const data = await canonicalizeSaveData(tx, req.userId!, requested);
      const row = await tx.saveGame.upsert({
        where: { userId: req.userId! },
        create: { userId: req.userId!, data },
        update: { data },
      });
      return { row, data };
    });
    // trust-but-record: suspicious transitions leave an audit row (never a
    // rejection — see save/audit.ts). Awaited so tests can assert on it;
    // recordSaveAnomalies itself never throws.
    if (prev) {
      const parsedPrev = saveDataSchema.safeParse(prev.data);
      if (parsedPrev.success) await recordSaveAnomalies(req.userId!, parsedPrev.data, data, prev.updatedAt);
    }
    res.json({ save: row.data });
  }),
);
