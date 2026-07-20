import { randomUUID } from 'node:crypto';
import { serializableTransaction } from '../db/transaction.js';
import type { SaveData } from '../save/schema.js';
import { canonicalizeSaveData } from '../save/canonicalize.js';
import { executeInventoryCommandInTransaction, getInventoryInTransaction } from '../inventory/service.js';
import type { InventorySnapshot } from '../inventory/types.js';
import { HttpError } from '../middleware/httpError.js';

export type VaultLayer = 1 | 5;

interface DungeonVaultProofRow {
  id: string;
  layer: number;
  claimedAt: Date | null;
}

interface VaultClaimRow {
  claimed: number;
}

export interface PendingDungeonVaultProof {
  id: string;
  runId: string;
  layer: VaultLayer;
  proofHash: string;
  createdAt: string;
}

interface PendingDungeonVaultProofRow {
  id: string;
  runId: string;
  layer: number;
  proofHash: string;
  createdAt: Date;
}

export async function listPendingDungeonVaultProofs(userId: string): Promise<PendingDungeonVaultProof[]> {
  const rows = await serializableTransaction((tx) => tx.$queryRaw<PendingDungeonVaultProofRow[]>`
    SELECT "id", "runId", "layer", "proofHash", "createdAt"
    FROM "DungeonVaultProof"
    WHERE "userId" = ${userId} AND "claimedAt" IS NULL
    ORDER BY "createdAt" ASC
    LIMIT 20
  `);
  return rows.map((row) => {
    if (row.layer !== 1 && row.layer !== 5) throw new Error('corrupt Dungeon Vault proof layer');
    return {
      id: row.id,
      runId: row.runId,
      layer: row.layer,
      proofHash: row.proofHash,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * Compatibility save endpoint only. Legacy client-authored bags can no longer
 * contribute to a shared vault: their contents were never proven by an
 * authoritative Dungeon service and could otherwise inflate global value.
 */
export async function persistDeathAndForfeit(userId: string, nextSave: SaveData, _requestedBagIds: string[]) {
  return serializableTransaction(async (tx) => {
    const sanitizedNextSave = await canonicalizeSaveData(tx, userId, { ...nextSave, bags: [] });
    const row = await tx.saveGame.upsert({
      where: { userId },
      create: { userId, data: sanitizedNextSave },
      update: { data: sanitizedNextSave },
    });
    return {
      save: row.data,
      contributed: 0,
      split: { layer1: 0, layer5: 0 },
      forfeitedBagIds: [],
    };
  });
}

/**
 * Consumes a server-authored DungeonVaultProof. The proof, vault reset,
 * canonical inventory credit and replay receipt are one serializable
 * transaction; client floor/save state is never consulted.
 */
export async function claimDungeonVaultProof(
  userId: string,
  proofId: string,
): Promise<{ proofId: string; layer: VaultLayer; claimed: number; replay: boolean; canonicalSettled: boolean; inventory: InventorySnapshot }> {
  return serializableTransaction(async (tx) => {
    const proofs = await tx.$queryRaw<DungeonVaultProofRow[]>`
      SELECT "id", "layer", "claimedAt"
      FROM "DungeonVaultProof"
      WHERE "id" = ${proofId} AND "userId" = ${userId}
      FOR UPDATE
    `;
    const proof = proofs[0];
    if (!proof) throw new HttpError(409, 'vault claim requires the matching server-authored Dungeon proof');
    if (proof.layer !== 1 && proof.layer !== 5) throw new Error('corrupt Dungeon Vault proof layer');
    const layer = proof.layer as VaultLayer;

    const runKey = `dungeon-proof:${proof.id}`;
    const prior = await tx.$queryRaw<VaultClaimRow[]>`
      SELECT "claimed" FROM "VaultClaim" WHERE "runKey" = ${runKey}
    `;
    if (prior[0]) {
      const inventoryCommand = prior[0].claimed > 0
        ? await executeInventoryCommandInTransaction(
          tx,
          userId,
          'dungeon_vault_claim',
          { proofId: proof.id, layer, claimed: prior[0].claimed },
          { idempotencyKey: `dungeon_vault_claim:${proof.id}` },
          () => ({ deltas: { 'currency.crystal': prior[0].claimed } }),
        )
        : null;
      const inventory = inventoryCommand?.inventory ?? await getInventoryInTransaction(tx, userId, false);
      return { proofId: proof.id, layer, claimed: prior[0].claimed, replay: true, canonicalSettled: true, inventory };
    }
    if (proof.claimedAt) throw new HttpError(409, 'Dungeon vault proof was consumed without a claim receipt');

    const vaultRows = await tx.$queryRaw<Array<{ crystals: number }>>`
      INSERT INTO "Vault" ("layer", "crystals") VALUES (${layer}, 0)
      ON CONFLICT ("layer") DO UPDATE SET "crystals" = "Vault"."crystals"
      RETURNING "crystals"
    `;
    const claimed = vaultRows[0]?.crystals ?? 0;
    const inventoryCommand = claimed > 0
      ? await executeInventoryCommandInTransaction(
        tx,
        userId,
        'dungeon_vault_claim',
        { proofId: proof.id, layer, claimed },
        { idempotencyKey: `dungeon_vault_claim:${proof.id}` },
        () => ({ deltas: { 'currency.crystal': claimed } }),
      )
      : null;
    const inventory = inventoryCommand?.inventory ?? await getInventoryInTransaction(tx, userId, false);

    await tx.$executeRaw`UPDATE "Vault" SET "crystals" = 0 WHERE "layer" = ${layer}`;
    await tx.$executeRaw`
      INSERT INTO "VaultClaim" ("id", "runKey", "userId", "layer", "claimed", "createdAt")
      VALUES (${randomUUID()}, ${runKey}, ${userId}, ${layer}, ${claimed}, CURRENT_TIMESTAMP)
    `;
    await tx.$executeRaw`
      UPDATE "DungeonVaultProof" SET "claimedAt" = CURRENT_TIMESTAMP WHERE "id" = ${proof.id}
    `;
    return { proofId: proof.id, layer, claimed, replay: false, canonicalSettled: true, inventory };
  });
}
