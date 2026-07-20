import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import { type ItemId, isItemId } from '../economy/catalog.js';
import { HttpError } from '../middleware/httpError.js';
import { applyDeltas, assertWeaponOwned, InventoryDomainError } from './domain.js';
import { planCraft, planEquip, planPurchase, type PlannedMutation } from './commands.js';
import { assertInventoryRevision, hashInventoryCommand, replayStoredCommand } from './idempotency.js';
import type { InventoryCommandMeta, InventoryCommandResult, InventorySnapshot, InventoryStacks } from './types.js';
import { assertInventoryNotLockedByPvp } from '../pvp/guard.js';
import { ensureStarterAccountState } from '../account/bootstrap.js';

interface InventoryRow {
  revision: number;
  progressionLevel: number;
  hasPet: boolean;
  equippedWeapon: string;
  migratedFromSave: boolean;
}

interface StackRow {
  itemId: string;
  quantity: number;
}

interface CommandRow {
  requestHash: string;
  result: unknown;
}

type Mutation = PlannedMutation;

function normalizeDomainError(error: unknown): never {
  if (error instanceof InventoryDomainError) {
    const status = error.code === 'invalid_item' || error.code === 'invalid_quantity' ? 400 : 409;
    throw new HttpError(status, error.message);
  }
  throw error;
}

async function readStacks(tx: Prisma.TransactionClient, userId: string): Promise<InventoryStacks> {
  const rows = await tx.$queryRaw<StackRow[]>`
    SELECT "itemId", "quantity"
    FROM "InventoryStack"
    WHERE "userId" = ${userId}
    ORDER BY "itemId"
  `;
  const stacks: Record<string, number> = {};
  for (const row of rows) {
    if (isItemId(row.itemId) && row.quantity > 0) stacks[row.itemId] = row.quantity;
  }
  return stacks as InventoryStacks;
}

async function snapshotFromRow(tx: Prisma.TransactionClient, userId: string, row: InventoryRow): Promise<InventorySnapshot> {
  if (!isItemId(row.equippedWeapon)) throw new Error(`database contains unknown equipped item: ${row.equippedWeapon}`);
  return {
    revision: row.revision,
    progressionLevel: row.progressionLevel,
    hasPet: row.hasPet,
    equippedWeapon: row.equippedWeapon,
    migratedFromSave: row.migratedFromSave,
    stacks: await readStacks(tx, userId),
  };
}

async function ensureInventory(tx: Prisma.TransactionClient, userId: string, lock: boolean): Promise<InventorySnapshot> {
  const lockClause = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty;
  let rows = await tx.$queryRaw<InventoryRow[]>(Prisma.sql`
    SELECT "revision", "progressionLevel", "hasPet", "equippedWeapon", "migratedFromSave"
    FROM "PlayerInventory"
    WHERE "userId" = ${userId}${lockClause}
  `);
  if (!rows[0]) {
    await ensureStarterAccountState(tx, userId);
    rows = await tx.$queryRaw<InventoryRow[]>(Prisma.sql`
      SELECT "revision", "progressionLevel", "hasPet", "equippedWeapon", "migratedFromSave"
      FROM "PlayerInventory"
      WHERE "userId" = ${userId}${lockClause}
    `);
  }
  if (!rows[0]) throw new Error('failed to create inventory');
  return snapshotFromRow(tx, userId, rows[0]);
}

async function persistSnapshot(tx: Prisma.TransactionClient, userId: string, snapshot: InventorySnapshot): Promise<void> {
  await tx.$executeRaw`
    UPDATE "PlayerInventory"
    SET "revision" = ${snapshot.revision},
        "progressionLevel" = ${snapshot.progressionLevel},
        "hasPet" = ${snapshot.hasPet},
        "equippedWeapon" = ${snapshot.equippedWeapon},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId}
  `;
  await tx.$executeRaw`DELETE FROM "InventoryStack" WHERE "userId" = ${userId}`;
  for (const [itemId, quantity] of Object.entries(snapshot.stacks)) {
    if (!quantity) continue;
    await tx.$executeRaw`
      INSERT INTO "InventoryStack" ("userId", "itemId", "quantity")
      VALUES (${userId}, ${itemId}, ${quantity})
    `;
  }
}

export async function replayInventoryCommandInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: string,
  payload: unknown,
  meta: InventoryCommandMeta,
): Promise<InventoryCommandResult | null> {
  const hash = hashInventoryCommand(kind, payload, meta.expectedRevision);
  const rows = await tx.$queryRaw<CommandRow[]>`
    SELECT "requestHash", "result"
    FROM "InventoryCommand"
    WHERE "userId" = ${userId} AND "idempotencyKey" = ${meta.idempotencyKey}
  `;
  return replayStoredCommand(rows[0], hash);
}

export async function executeInventoryCommandInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: string,
  payload: unknown,
  meta: InventoryCommandMeta,
  mutate: (snapshot: InventorySnapshot) => Mutation | Promise<Mutation>,
  options: { allowActivePvpSessionId?: string } = {},
): Promise<InventoryCommandResult> {
  const hash = hashInventoryCommand(kind, payload, meta.expectedRevision);
  const findStored = async (): Promise<CommandRow | undefined> => {
    const rows = await tx.$queryRaw<CommandRow[]>`
      SELECT "requestHash", "result"
      FROM "InventoryCommand"
      WHERE "userId" = ${userId} AND "idempotencyKey" = ${meta.idempotencyKey}
    `;
    return rows[0];
  };

  const earlyReplay = replayStoredCommand(await findStored(), hash);
  if (earlyReplay) return earlyReplay;

  const current = await ensureInventory(tx, userId, true);

  // A concurrent request with the same key may have committed while this
  // transaction was waiting on the inventory row lock. Re-check after the
  // lock so an idempotent retry returns the original receipt instead of
  // applying the mutation and failing on the unique constraint.
  const lockedReplay = replayStoredCommand(await findStored(), hash);
  if (lockedReplay) return lockedReplay;

  await assertInventoryNotLockedByPvp(tx, userId, options.allowActivePvpSessionId);
  assertInventoryRevision(current.revision, meta.expectedRevision);

  let mutation: Mutation;
  let stacks: InventoryStacks;
  try {
    mutation = await mutate(current);
    stacks = mutation.deltas ? applyDeltas(current.stacks, mutation.deltas) : current.stacks;
    if (mutation.equippedWeapon) {
      assertWeaponOwned({ ...current, stacks }, mutation.equippedWeapon);
    }
  } catch (error) {
    normalizeDomainError(error);
  }

  const next: InventorySnapshot = {
    ...current,
    revision: current.revision + 1,
    stacks,
    equippedWeapon: mutation.equippedWeapon ?? current.equippedWeapon,
    hasPet: mutation.hasPet ?? current.hasPet,
    progressionLevel: mutation.progressionLevel ?? current.progressionLevel,
  };
  await persistSnapshot(tx, userId, next);

  const result: InventoryCommandResult = {
    kind,
    replayed: false,
    inventory: next,
    deltas: mutation.deltas ?? {},
  };
  await tx.$executeRaw`
    INSERT INTO "InventoryCommand"
      ("id", "userId", "idempotencyKey", "kind", "requestHash", "result", "createdAt")
    VALUES
      (${randomUUID()}, ${userId}, ${meta.idempotencyKey}, ${kind}, ${hash}, ${JSON.stringify(result)}::jsonb, CURRENT_TIMESTAMP)
  `;
  return result;
}

async function executeCommand(
  userId: string,
  kind: string,
  payload: unknown,
  meta: InventoryCommandMeta,
  mutate: (snapshot: InventorySnapshot) => Mutation | Promise<Mutation>,
  options: { allowActivePvpSessionId?: string } = {},
): Promise<InventoryCommandResult> {
  return serializableTransaction((tx) => executeInventoryCommandInTransaction(tx, userId, kind, payload, meta, mutate, options));
}

export function getInventoryInTransaction(tx: Prisma.TransactionClient, userId: string, lock = false): Promise<InventorySnapshot> {
  return ensureInventory(tx, userId, lock);
}

export function getInventory(userId: string): Promise<InventorySnapshot> {
  return serializableTransaction((tx) => ensureInventory(tx, userId, false));
}

export function craftInventoryItem(userId: string, recipeId: string, meta: InventoryCommandMeta): Promise<InventoryCommandResult> {
  return executeCommand(userId, 'craft', { recipeId }, meta, (snapshot) => planCraft(snapshot, recipeId));
}

export function purchaseInventoryItem(userId: string, offerId: string, meta: InventoryCommandMeta): Promise<InventoryCommandResult> {
  return executeCommand(userId, 'purchase', { offerId }, meta, () => planPurchase(offerId));
}

export function equipInventoryWeapon(userId: string, weaponId: ItemId, meta: InventoryCommandMeta): Promise<InventoryCommandResult> {
  return executeCommand(userId, 'equip', { weaponId }, meta, (snapshot) => {
    try {
      return planEquip(snapshot, weaponId);
    } catch (error) {
      normalizeDomainError(error);
    }
  });
}

/** Internal building block for the next Phase 4 steps (harvest, loot, quests).
 * It is deliberately not exposed as a public HTTP endpoint: only a validated
 * gameplay service may decide these deltas. */
export function applySystemInventoryDeltas(
  userId: string,
  kind: string,
  sourceId: string,
  deltas: InventoryStacks,
): Promise<InventoryCommandResult> {
  return executeCommand(userId, kind, { sourceId, deltas }, { idempotencyKey: `${kind}:${sourceId}` }, () => ({ deltas }));
}
