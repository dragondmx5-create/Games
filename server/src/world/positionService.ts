import { prisma } from '../db.js';
import { STARTER_WORLD_POSITION } from '../account/bootstrap.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from './resourceLayout.js';
import { isOverworldRegionCoordinate } from './worldBounds.js';

export interface AuthoritativeWorldPosition {
  rx: number;
  ry: number;
  x: number;
  y: number;
}

function validPosition(position: AuthoritativeWorldPosition): boolean {
  const max = RESOURCE_REGION_SIZE * RESOURCE_TILE_SIZE;
  return isOverworldRegionCoordinate(position.rx, position.ry)
    && Number.isFinite(position.x) && Number.isFinite(position.y)
    && position.x >= 0 && position.x <= max && position.y >= 0 && position.y <= max;
}

/** Claims the account's overworld position for one authenticated socket.
 * Older/superseded sockets cannot persist after a newer session takes over.
 * SaveGame is never consulted: missing canonical rows always start at the
 * server-authored spawn and can only move through verified gameplay. */
export async function claimWorldPositionSession(userId: string, sessionId: string): Promise<AuthoritativeWorldPosition> {
  const row = await prisma.playerWorldPosition.upsert({
    where: { userId },
    create: { userId, sessionId, ...STARTER_WORLD_POSITION },
    update: { sessionId },
  });
  return { rx: row.rx, ry: row.ry, x: row.x, y: row.y };
}

export async function persistWorldPosition(
  userId: string,
  sessionId: string,
  position: AuthoritativeWorldPosition,
): Promise<boolean> {
  if (!validPosition(position)) return false;
  const result = await prisma.playerWorldPosition.updateMany({
    where: { userId, sessionId },
    data: position,
  });
  return result.count === 1;
}

export async function getPersistedWorldPosition(userId: string): Promise<AuthoritativeWorldPosition | null> {
  const row = await prisma.playerWorldPosition.findUnique({ where: { userId } });
  return row ? { rx: row.rx, ry: row.ry, x: row.x, y: row.y } : null;
}

export async function relocateWorldPosition(userId: string, position: AuthoritativeWorldPosition): Promise<void> {
  if (!validPosition(position)) throw new Error('invalid relocation position');
  await prisma.playerWorldPosition.upsert({
    where: { userId },
    create: { userId, sessionId: '', ...position },
    update: position,
  });
}
