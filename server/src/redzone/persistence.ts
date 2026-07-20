import { serializableTransaction } from '../db/transaction.js';
import { prisma } from '../db.js';

const VAULT_LAYER = 0;

export async function loadRedZoneBalance(userId: string): Promise<number> {
  const row = await prisma.redZonePlayer.upsert({ where: { userId }, create: { userId, crystals: 0 }, update: {} });
  return row.crystals;
}

export async function loadRedZoneVault(): Promise<number> {
  const row = await prisma.vault.upsert({ where: { layer: VAULT_LAYER }, create: { layer: VAULT_LAYER, crystals: 0 }, update: {} });
  return row.crystals;
}

export interface KillSettlement {
  lost: number;
  killerBalance: number;
  vaultBalance: number;
}

/** DB-authoritative 80/20 transfer; safe when several kills settle together. */
export async function settleKill(killerId: string, victimId: string): Promise<KillSettlement> {
  return serializableTransaction(async (tx) => {
    const victim = await tx.redZonePlayer.upsert({ where: { userId: victimId }, create: { userId: victimId, crystals: 0 }, update: {} });
    const lost = victim.crystals;
    const killerShare = Math.round(lost * 0.8);
    const vaultShare = lost - killerShare;

    if (lost > 0) {
      await tx.redZonePlayer.update({ where: { userId: victimId }, data: { crystals: 0 } });
    }
    const killer = await tx.redZonePlayer.upsert({
      where: { userId: killerId },
      create: { userId: killerId, crystals: killerShare },
      update: { crystals: { increment: killerShare } },
    });
    const vault = await tx.vault.upsert({
      where: { layer: VAULT_LAYER },
      create: { layer: VAULT_LAYER, crystals: vaultShare },
      update: { crystals: { increment: vaultShare } },
    });

    return { lost, killerBalance: killer.crystals, vaultBalance: vault.crystals };
  });
}
