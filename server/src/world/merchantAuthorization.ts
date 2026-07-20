import { HttpError } from '../middleware/httpError.js';
import { getFreshWorldPresence } from './presence.js';
import { getOrCreateWorldSeed } from './service.js';
import { generateRegionNpcs } from './npcLayout.js';

const MERCHANT_INTERACT_RADIUS = 38;

/** Ensures economy mutations that are presented as merchant actions cannot be
 * invoked remotely by a modified client. */
export async function assertNearCanonicalMerchant(userId: string): Promise<void> {
  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'world presence is not connected');
  const worldSeed = await getOrCreateWorldSeed();
  const merchant = generateRegionNpcs(worldSeed, presence.rx, presence.ry)
    .find((npc) => npc.role === 'merchant');
  if (!merchant) throw new HttpError(409, 'no merchant is present in this region');
  if (Math.hypot(presence.x - merchant.x, presence.y - merchant.y) > MERCHANT_INTERACT_RADIUS) {
    throw new HttpError(409, 'move closer to the merchant');
  }
}


/** Read-only companion used by UI/network discovery. Validation failures that
 * simply mean the player is not at a merchant become false; unexpected
 * infrastructure errors still propagate. */
export async function isNearCanonicalMerchant(userId: string): Promise<boolean> {
  try {
    await assertNearCanonicalMerchant(userId);
    return true;
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) return false;
    throw error;
  }
}
