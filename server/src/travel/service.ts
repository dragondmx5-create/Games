import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import { executeInventoryCommandInTransaction } from '../inventory/service.js';
import type { InventoryCommandResult } from '../inventory/types.js';
import { HttpError } from '../middleware/httpError.js';
import { SAFE_SPAWN_POSITION } from '../world/landLocations.js';
import { assertNearCanonicalMerchant, isNearCanonicalMerchant } from '../world/merchantAuthorization.js';
import { getFreshWorldPresence, relocateWorldPresence } from '../world/presence.js';
import { allSettlements, publicSettlements, settlementAt, settlementById, type SettlementLocation } from '../world/settlementLayout.js';
import { caravanFare, isPublicTravelSettlement } from './domain.js';

export interface PublicTravelDestination {
  id: string;
  name: string;
  landId: SettlementLocation['landId'];
  kind: SettlementLocation['kind'];
  rx: number;
  ry: number;
  fare: number | null;
}

export interface TravelNetworkResult {
  currentSettlementId: string | null;
  canDepart: boolean;
  destinations: PublicTravelDestination[];
}

export async function getTravelNetwork(userId: string): Promise<TravelNetworkResult> {
  const presence = getFreshWorldPresence(userId);
  const source = presence ? settlementAt(presence.rx, presence.ry) : undefined;
  const canDepart = !!source && source.kind !== 'hidden' && await isNearCanonicalMerchant(userId);
  return {
    currentSettlementId: source?.id ?? null,
    canDepart,
    destinations: publicSettlements().map((destination) => ({
      id: destination.id,
      name: destination.name,
      landId: destination.landId,
      kind: destination.kind,
      rx: destination.rx,
      ry: destination.ry,
      fare: canDepart && source ? caravanFare(source, destination) : null,
    })),
  };
}

export async function travelByCaravan(
  userId: string,
  settlementId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<{ destination: PublicTravelDestination; inventoryCommand: InventoryCommandResult; position: { rx: number; ry: number; x: number; y: number } }> {
  const destination = settlementById(settlementId);
  if (!destination || !isPublicTravelSettlement(destination)) throw new HttpError(404, 'travel destination was not found');
  const position = { rx: destination.rx, ry: destination.ry, ...SAFE_SPAWN_POSITION };
  const payload = { destinationSettlementId: destination.id };

  const inventoryCommand = await serializableTransaction(async (tx) => {
    const result = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'caravan_travel',
      payload,
      { expectedRevision, idempotencyKey },
      async () => {
        const presence = getFreshWorldPresence(userId);
        if (!presence) throw new HttpError(409, 'world presence is not connected');
        const source = settlementAt(presence.rx, presence.ry);
        if (!source || !isPublicTravelSettlement(source)) throw new HttpError(409, 'caravan travel starts from a public settlement');
        if (destination.id === source.id) throw new HttpError(409, 'already at this settlement');
        await assertNearCanonicalMerchant(userId);
        const fare = caravanFare(source, destination);
        return { deltas: { 'currency.crystal': -fare } };
      },
    );
    if (!result.replayed) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PlayerWorldPosition"
        SET "rx" = ${position.rx}, "ry" = ${position.ry}, "x" = ${position.x}, "y" = ${position.y}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ${userId}
      `);
    }
    return result;
  });
  // Replaying the same command is safe even after the first response was lost:
  // the stored inventory receipt carries the original fare and the canonical
  // destination is deterministic from the request.
  relocateWorldPresence(userId, position);
  const fare = Math.max(0, -(inventoryCommand.deltas['currency.crystal'] ?? 0));
  return {
    destination: {
      id: destination.id,
      name: destination.name,
      landId: destination.landId,
      kind: destination.kind,
      rx: destination.rx,
      ry: destination.ry,
      fare,
    },
    inventoryCommand,
    position,
  };
}

export function travelDestinationCount(): number {
  return allSettlements().filter(isPublicTravelSettlement).length;
}
