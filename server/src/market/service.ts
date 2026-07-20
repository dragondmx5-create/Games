import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import { type ItemId } from '../economy/catalog.js';
import { executeInventoryCommandInTransaction, getInventoryInTransaction } from '../inventory/service.js';
import type { InventorySnapshot } from '../inventory/types.js';
import { HttpError } from '../middleware/httpError.js';
import { assertNearCanonicalMerchant } from '../world/merchantAuthorization.js';
import { getFreshWorldPresence } from '../world/presence.js';
import { settlementAt } from '../world/settlementLayout.js';
import { isMarketTradableItem, sellerMarketProceeds } from './domain.js';

interface ListingRow {
  id: string;
  sellerUserId: string;
  buyerUserId: string | null;
  sellerName: string;
  landId: string;
  settlementId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  status: string;
  createCommandKey: string;
  closeCommandKey: string | null;
  createdAt: Date;
  soldAt: Date | null;
}

export interface PublicMarketListing {
  id: string;
  sellerName: string;
  sellerUserId: string;
  itemId: ItemId;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  landId: string;
  settlementId: string;
  status: 'active' | 'sold' | 'cancelled';
  createdAt: string;
  soldAt: string | null;
  ownedByViewer: boolean;
}

function publicListing(row: ListingRow, viewerUserId: string): PublicMarketListing {
  return {
    id: row.id,
    sellerName: row.sellerName,
    sellerUserId: row.sellerUserId,
    itemId: row.itemId as ItemId,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    totalPrice: row.quantity * row.unitPrice,
    landId: row.landId,
    settlementId: row.settlementId,
    status: row.status as PublicMarketListing['status'],
    createdAt: row.createdAt.toISOString(),
    soldAt: row.soldAt?.toISOString() ?? null,
    ownedByViewer: row.sellerUserId === viewerUserId,
  };
}

async function requireMarketLocation(userId: string): Promise<{ landId: string; settlementId: string }> {
  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'world presence is not connected');
  const settlement = settlementAt(presence.rx, presence.ry);
  if (!settlement || settlement.kind === 'hidden') throw new HttpError(409, 'the public market is available in settlements');
  await assertNearCanonicalMerchant(userId);
  return { landId: settlement.landId, settlementId: settlement.id };
}

async function listingById(tx: Prisma.TransactionClient, listingId: string, lock: boolean): Promise<ListingRow | undefined> {
  const lockSql = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty;
  const rows = await tx.$queryRaw<ListingRow[]>(Prisma.sql`
    SELECT ml."id", ml."sellerUserId", ml."buyerUserId", u."username" AS "sellerName", ml."landId", ml."settlementId",
           ml."itemId", ml."quantity", ml."unitPrice", ml."status", ml."createCommandKey", ml."closeCommandKey",
           ml."createdAt", ml."soldAt"
    FROM "MarketListing" ml
    JOIN "User" u ON u."id" = ml."sellerUserId"
    WHERE ml."id" = ${listingId}${lockSql}
  `);
  return rows[0];
}


async function listingByCreateCommand(
  tx: Prisma.TransactionClient,
  userId: string,
  idempotencyKey: string,
): Promise<ListingRow | undefined> {
  const rows = await tx.$queryRaw<ListingRow[]>`
    SELECT ml."id", ml."sellerUserId", ml."buyerUserId", u."username" AS "sellerName", ml."landId", ml."settlementId",
           ml."itemId", ml."quantity", ml."unitPrice", ml."status", ml."createCommandKey", ml."closeCommandKey",
           ml."createdAt", ml."soldAt"
    FROM "MarketListing" ml
    JOIN "User" u ON u."id" = ml."sellerUserId"
    WHERE ml."sellerUserId" = ${userId} AND ml."createCommandKey" = ${idempotencyKey}
  `;
  return rows[0];
}

function assertCreateReplayMatches(row: ListingRow, itemId: ItemId, quantity: number, unitPrice: number): void {
  if (row.itemId !== itemId || row.quantity !== quantity || row.unitPrice !== unitPrice) {
    throw new HttpError(409, 'idempotency key was already used for a different market listing');
  }
}

export async function listMarketListings(userId: string, limit: number): Promise<{ landId: string; listings: PublicMarketListing[] }> {
  const location = await requireMarketLocation(userId);
  const rows = await serializableTransaction((tx) => tx.$queryRaw<ListingRow[]>`
    SELECT ml."id", ml."sellerUserId", ml."buyerUserId", u."username" AS "sellerName", ml."landId", ml."settlementId",
           ml."itemId", ml."quantity", ml."unitPrice", ml."status", ml."createCommandKey", ml."closeCommandKey",
           ml."createdAt", ml."soldAt"
    FROM "MarketListing" ml
    JOIN "User" u ON u."id" = ml."sellerUserId"
    WHERE ml."status" = 'active' AND ml."landId" = ${location.landId}
    ORDER BY ml."unitPrice" ASC, ml."createdAt" ASC
    LIMIT ${limit}
  `);
  return { landId: location.landId, listings: rows.map((row) => publicListing(row, userId)) };
}

export async function createMarketListing(
  userId: string,
  itemId: ItemId,
  quantity: number,
  unitPrice: number,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<{ listing: PublicMarketListing; inventory: InventorySnapshot }> {
  if (!isMarketTradableItem(itemId)) throw new HttpError(400, 'item cannot be listed on the public market');
  sellerMarketProceeds(quantity, unitPrice);

  const replay = await serializableTransaction(async (tx) => {
    const existing = await listingByCreateCommand(tx, userId, idempotencyKey);
    if (!existing) return null;
    assertCreateReplayMatches(existing, itemId, quantity, unitPrice);
    return { listing: publicListing(existing, userId), inventory: await getInventoryInTransaction(tx, userId, false) };
  });
  if (replay) return replay;
  const location = await requireMarketLocation(userId);

  return serializableTransaction(async (tx) => {
    const existing = await listingByCreateCommand(tx, userId, idempotencyKey);
    if (existing) {
      assertCreateReplayMatches(existing, itemId, quantity, unitPrice);
      return { listing: publicListing(existing, userId), inventory: await getInventoryInTransaction(tx, userId, false) };
    }

    const command = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'market_list',
      { itemId, quantity, unitPrice, landId: location.landId },
      { expectedRevision, idempotencyKey },
      (snapshot) => {
        if (snapshot.equippedWeapon === itemId) throw new HttpError(409, 'equip another weapon before listing this one');
        return { deltas: { [itemId]: -quantity } };
      },
    );
    const listingId = randomUUID();
    await tx.$executeRaw`
      INSERT INTO "MarketListing"
        ("id", "sellerUserId", "landId", "settlementId", "itemId", "quantity", "unitPrice", "status", "createCommandKey", "createdAt", "updatedAt")
      VALUES
        (${listingId}, ${userId}, ${location.landId}, ${location.settlementId}, ${itemId}, ${quantity}, ${unitPrice}, 'active', ${idempotencyKey}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    const listing = await listingById(tx, listingId, false);
    if (!listing) throw new Error('failed to create market listing');
    return { listing: publicListing(listing, userId), inventory: command.inventory };
  });
}

export async function cancelMarketListing(
  userId: string,
  listingId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<{ listing: PublicMarketListing; inventory: InventorySnapshot }> {
  const replay = await serializableTransaction(async (tx) => {
    const listing = await listingById(tx, listingId, false);
    if (!listing || listing.sellerUserId !== userId || listing.status !== 'cancelled' || listing.closeCommandKey !== idempotencyKey) return null;
    return { listing: publicListing(listing, userId), inventory: await getInventoryInTransaction(tx, userId, false) };
  });
  if (replay) return replay;
  await requireMarketLocation(userId);
  return serializableTransaction(async (tx) => {
    const listing = await listingById(tx, listingId, true);
    if (!listing) throw new HttpError(404, 'market listing was not found');
    if (listing.sellerUserId !== userId) throw new HttpError(403, 'only the seller can cancel this listing');
    if (listing.status === 'cancelled' && listing.closeCommandKey === idempotencyKey) {
      return { listing: publicListing(listing, userId), inventory: await getInventoryInTransaction(tx, userId, false) };
    }
    if (listing.status !== 'active') throw new HttpError(409, 'market listing is no longer active');
    const command = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'market_cancel',
      { listingId, itemId: listing.itemId, quantity: listing.quantity },
      { expectedRevision, idempotencyKey },
      () => ({ deltas: { [listing.itemId]: listing.quantity } }),
    );
    await tx.$executeRaw`
      UPDATE "MarketListing"
      SET "status" = 'cancelled', "closeCommandKey" = ${idempotencyKey}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${listingId}
    `;
    const updated = await listingById(tx, listingId, false);
    if (!updated) throw new Error('failed to cancel market listing');
    return { listing: publicListing(updated, userId), inventory: command.inventory };
  });
}

export async function buyMarketListing(
  userId: string,
  listingId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<{ listing: PublicMarketListing; inventory: InventorySnapshot; fee: number }> {
  const replay = await serializableTransaction(async (tx) => {
    const listing = await listingById(tx, listingId, false);
    if (!listing || listing.status !== 'sold' || listing.buyerUserId !== userId || listing.closeCommandKey !== idempotencyKey) return null;
    const totals = sellerMarketProceeds(listing.quantity, listing.unitPrice);
    return { listing: publicListing(listing, userId), inventory: await getInventoryInTransaction(tx, userId, false), fee: totals.fee };
  });
  if (replay) return replay;
  const location = await requireMarketLocation(userId);
  return serializableTransaction(async (tx) => {
    const listing = await listingById(tx, listingId, true);
    if (!listing) throw new HttpError(404, 'market listing was not found');
    if (listing.status === 'sold' && listing.buyerUserId === userId && listing.closeCommandKey === idempotencyKey) {
      const totals = sellerMarketProceeds(listing.quantity, listing.unitPrice);
      return { listing: publicListing(listing, userId), inventory: await getInventoryInTransaction(tx, userId, false), fee: totals.fee };
    }
    if (listing.status !== 'active') throw new HttpError(409, 'market listing is no longer active');
    if (listing.sellerUserId === userId) throw new HttpError(409, 'cannot buy your own listing');
    if (listing.landId !== location.landId) throw new HttpError(409, 'this listing belongs to another regional market');
    const totals = sellerMarketProceeds(listing.quantity, listing.unitPrice);
    const buyerDelta = { 'currency.crystal': -totals.total, [listing.itemId]: listing.quantity };
    const sellerDelta = { 'currency.crystal': totals.proceeds };
    const users = [userId, listing.sellerUserId].sort();
    let buyerInventory: InventorySnapshot | null = null;
    for (const accountId of users) {
      if (accountId === userId) {
        const command = await executeInventoryCommandInTransaction(
          tx,
          userId,
          'market_buy',
          { listingId, total: totals.total },
          { expectedRevision, idempotencyKey },
          () => ({ deltas: buyerDelta }),
        );
        buyerInventory = command.inventory;
      } else {
        await executeInventoryCommandInTransaction(
          tx,
          listing.sellerUserId,
          'market_sale',
          { listingId, proceeds: totals.proceeds },
          { idempotencyKey: `market-sale:${listingId}` },
          () => ({ deltas: sellerDelta }),
        );
      }
    }
    if (!buyerInventory) throw new Error('buyer inventory was not updated');
    await tx.$executeRaw`
      UPDATE "MarketListing"
      SET "status" = 'sold', "buyerUserId" = ${userId}, "closeCommandKey" = ${idempotencyKey},
          "soldAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${listingId}
    `;
    const updated = await listingById(tx, listingId, false);
    if (!updated) throw new Error('failed to settle market listing');
    return { listing: publicListing(updated, userId), inventory: buyerInventory, fee: totals.fee };
  });
}
