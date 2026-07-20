import { capitalSpawnForLand } from './landLocations.js';
import { getFreshWorldPresence, relocateWorldPresence } from './presence.js';
import { getPersistedWorldPosition, relocateWorldPosition } from './positionService.js';
import { regionResourceProfileAt } from './regionResourceProfiles.js';

export async function returnPlayerToCapital(userId: string): Promise<{ rx: number; ry: number; x: number; y: number }> {
  const live = getFreshWorldPresence(userId);
  const persisted = live
    ? { rx: live.rx, ry: live.ry, x: live.x, y: live.y }
    : await getPersistedWorldPosition(userId);
  const source = persisted ?? { rx: 0, ry: 0, x: 0, y: 0 };
  const profile = regionResourceProfileAt(source.rx, source.ry);
  const destination = capitalSpawnForLand(profile.landId);
  await relocateWorldPosition(userId, destination);
  relocateWorldPresence(userId, destination);
  return destination;
}
