import type { Prisma } from '@prisma/client';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from '../world/resourceLayout.js';

export const STARTER_WORLD_POSITION = Object.freeze({
  rx: 0,
  ry: 0,
  x: (RESOURCE_REGION_SIZE * RESOURCE_TILE_SIZE) / 2,
  y: (RESOURCE_REGION_SIZE * RESOURCE_TILE_SIZE) / 2,
});

/**
 * Creates every canonical row that a new account needs. The operation is
 * idempotent so old accounts created before this bootstrap existed are safely
 * repaired on first authenticated use without trusting their SaveGame blob.
 */
export async function ensureStarterAccountState(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "PlayerInventory"
      ("userId", "revision", "progressionLevel", "hasPet", "equippedWeapon", "migratedFromSave", "createdAt", "updatedAt")
    VALUES
      (${userId}, 0, 1, false, 'weapon.bone', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING
  `;
  await tx.$executeRaw`
    INSERT INTO "InventoryStack" ("userId", "itemId", "quantity")
    VALUES (${userId}, 'weapon.bone', 1)
    ON CONFLICT ("userId", "itemId") DO NOTHING
  `;
  await tx.$executeRaw`
    INSERT INTO "PlayerCombatState"
      ("userId", "hp", "maxHp", "xp", "level", "dead", "deaths", "kills", "updatedAt")
    VALUES (${userId}, 10, 10, 0, 1, false, 0, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING
  `;
  await tx.$executeRaw`
    INSERT INTO "PlayerWorldPosition"
      ("userId", "rx", "ry", "x", "y", "sessionId", "createdAt", "updatedAt")
    VALUES
      (${userId}, ${STARTER_WORLD_POSITION.rx}, ${STARTER_WORLD_POSITION.ry}, ${STARTER_WORLD_POSITION.x}, ${STARTER_WORLD_POSITION.y}, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING
  `;
  await tx.$executeRaw`
    INSERT INTO "PlayerUnderworldState"
      ("userId", "reputation", "discoveredRoutes", "revealedLostLands", "forbiddenDungeonKeys", "activeContracts", "inspectionProtection", "createdAt", "updatedAt")
    VALUES
      (${userId}, 0, ${JSON.stringify(['green-land'])}::jsonb, ${JSON.stringify([])}::jsonb, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING
  `;
}
