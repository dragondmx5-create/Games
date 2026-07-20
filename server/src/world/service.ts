import crypto from 'node:crypto';
import { prisma } from '../db.js';

export async function getOrCreateWorldSeed(): Promise<number> {
  let row = await prisma.worldConfig.findUnique({ where: { id: 1 } });
  if (!row) {
    const worldSeed = crypto.randomInt(-2147483648, 2147483648);
    row = await prisma.worldConfig
      .create({ data: { id: 1, worldSeed } })
      .catch(() => prisma.worldConfig.findUniqueOrThrow({ where: { id: 1 } }));
  }
  return row.worldSeed;
}
