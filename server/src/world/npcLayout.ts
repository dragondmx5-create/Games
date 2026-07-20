import { SAFE_SPAWN_TILE } from './landLocations.js';
import { generateCanonicalOverworldTopology, isCanonicalOverworldTileWalkable } from './overworldTopology.js';
import { RESOURCE_TILE_SIZE } from './resourceLayout.js';
import { regionResourceProfileAt } from './regionResourceProfiles.js';
import { settlementAt } from './settlementLayout.js';

export const NPC_LAYOUT_VERSION = 1;
export type WorldNpcRole = 'merchant' | 'archivist' | 'scout';
export type WorldNpcBehavior = 'stationary' | 'patrol';

export interface WorldNpcDefinition {
  id: string;
  rx: number;
  ry: number;
  role: WorldNpcRole;
  name: string;
  behavior: WorldNpcBehavior;
  x: number;
  y: number;
  wanderRadius: number;
}

const ROLE_OFFSETS: Readonly<Record<WorldNpcRole, readonly [number, number]>> = Object.freeze({
  merchant: [4, 1],
  archivist: [-4, 1],
  scout: [0, -5],
});

function nearestWalkableTile(
  topology: ReturnType<typeof generateCanonicalOverworldTopology>,
  desiredX: number,
  desiredY: number,
): { tx: number; ty: number } {
  for (let radius = 0; radius <= 12; radius += 1) {
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
        const tx = desiredX + ox;
        const ty = desiredY + oy;
        if (isCanonicalOverworldTileWalkable(topology, tx, ty)) return { tx, ty };
      }
    }
  }
  throw new Error('canonical settlement has no walkable NPC anchor');
}

function roleName(role: WorldNpcRole, landId: string): string {
  if (role === 'merchant') return landId === 'cinder-coast' ? 'Quartermaster Vey' : 'Mara the Provisioner';
  if (role === 'archivist') return landId === 'witchlands' ? 'Archivist Nhal' : 'Archivist Elian';
  return landId === 'frostlands' ? 'Rime Scout Iri' : 'Border Scout Tamsin';
}

export function worldNpcId(rx: number, ry: number, role: WorldNpcRole): string {
  return `npc:v${NPC_LAYOUT_VERSION}:${rx}:${ry}:${role}`;
}

export function parseWorldNpcId(value: string): { rx: number; ry: number; role: WorldNpcRole } | null {
  const match = /^npc:v(\d+):(-?\d+):(-?\d+):(merchant|archivist|scout)$/.exec(value);
  if (!match || Number(match[1]) !== NPC_LAYOUT_VERSION) return null;
  const rx = Number(match[2]);
  const ry = Number(match[3]);
  if (!Number.isInteger(rx) || !Number.isInteger(ry)) return null;
  return { rx, ry, role: match[4] as WorldNpcRole };
}

export function generateRegionNpcs(worldSeed: number, rx: number, ry: number): WorldNpcDefinition[] {
  const settlement = settlementAt(rx, ry);
  if (!settlement) return [];
  const profile = regionResourceProfileAt(rx, ry);
  const topology = generateCanonicalOverworldTopology(worldSeed, rx, ry);
  return (Object.keys(ROLE_OFFSETS) as WorldNpcRole[]).map((role) => {
    const [ox, oy] = ROLE_OFFSETS[role];
    const anchor = nearestWalkableTile(topology, SAFE_SPAWN_TILE + ox, SAFE_SPAWN_TILE + oy);
    return {
      id: worldNpcId(rx, ry, role),
      rx,
      ry,
      role,
      name: roleName(role, profile.landId),
      // Dynamic patrol is intentionally fail-closed until the server exposes
      // an authoritative NPC motion stream. Dialogue/reaction state is already
      // authoritative; the canonical interaction anchor remains stationary.
      behavior: 'stationary',
      x: (anchor.tx + 0.5) * RESOURCE_TILE_SIZE,
      y: (anchor.ty + 0.5) * RESOURCE_TILE_SIZE,
      wanderRadius: 0,
    };
  });
}
