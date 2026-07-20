export const DUNGEON_TILE_SIZE = 16;
export const DUNGEON_PLAYER_RADIUS = 5;
export const DUNGEON_TILE_ROCK = 0;
export const DUNGEON_TILE_FLOOR = 1;
export const DUNGEON_TILE_EXIT = 5;
export const DUNGEON_TILE_ENTRANCE = 6;

export interface DungeonPoint { x: number; y: number }
export type DungeonTheme = 'crypt' | 'flooded' | 'crystal' | 'foundry' | 'frost' | 'thorn';
export type DungeonMechanic = 'spike_traps' | 'slow_water' | 'crystal_pulses' | 'ember_vents' | 'frost_runes' | 'thorn_blight';
export type DungeonHazardKind = 'spike' | 'water' | 'crystal' | 'ember' | 'frost' | 'thorn';

export interface DungeonHazard {
  id: string;
  kind: DungeonHazardKind;
  x: number;
  y: number;
  radius: number;
  damage: number;
  slowMultiplier: number;
  cooldownMs: number;
}

export interface DungeonTopology {
  version: 1 | 2;
  dungeonId: string;
  floor: number;
  floorSeed: number;
  theme: DungeonTheme;
  mechanic: DungeonMechanic;
  w: number;
  h: number;
  tiles: number[];
  floorVariant: number[];
  entrance: DungeonPoint;
  exit: DungeonPoint;
  hazards: DungeonHazard[];
  checksum: string;
}

export type DungeonEnemyAffix = 'none' | 'swift' | 'armored' | 'venomous';
export interface DungeonEnemyState {
  id: string;
  kind: 'bug' | 'shellbug' | 'wallworm' | 'spitter';
  boss: boolean;
  elite?: boolean;
  affix?: DungeonEnemyAffix;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackReadyAt: number;
  alive: boolean;
}

export interface DungeonChestState {
  id: string;
  kind: 'standard' | 'forbidden';
  x: number;
  y: number;
  opened: boolean;
}

interface Room { x: number; y: number; w: number; h: number }

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashText(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

export function deriveDungeonFloorSeed(runSeed: number, dungeonId: string, floor: number): number {
  return (runSeed ^ hashText(dungeonId) ^ Math.imul(floor, 0x45d9f3b)) | 0;
}

function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}
function carveRoom(tiles: number[], width: number, room: Room): void {
  for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) tiles[y * width + x] = DUNGEON_TILE_FLOOR;
}
function carveHorizontal(tiles: number[], width: number, x0: number, x1: number, y: number): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) for (let offset = -1; offset <= 1; offset += 1) tiles[(y + offset) * width + x] = DUNGEON_TILE_FLOOR;
}
function carveVertical(tiles: number[], width: number, y0: number, y1: number, x: number): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y += 1) for (let offset = -1; offset <= 1; offset += 1) tiles[y * width + x + offset] = DUNGEON_TILE_FLOOR;
}
function roomCenter(room: Room): DungeonPoint { return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) } }

const THEMES: readonly DungeonTheme[] = ['crypt', 'flooded', 'crystal', 'foundry', 'frost', 'thorn'];
const MECHANIC_BY_THEME: Record<DungeonTheme, DungeonMechanic> = {
  crypt: 'spike_traps', flooded: 'slow_water', crystal: 'crystal_pulses', foundry: 'ember_vents', frost: 'frost_runes', thorn: 'thorn_blight',
};
const HAZARD_BY_THEME: Record<DungeonTheme, Omit<DungeonHazard, 'id' | 'x' | 'y'>> = {
  crypt: { kind: 'spike', radius: 10, damage: 2, slowMultiplier: 1, cooldownMs: 900 },
  flooded: { kind: 'water', radius: 23, damage: 0, slowMultiplier: 0.58, cooldownMs: 1000 },
  crystal: { kind: 'crystal', radius: 13, damage: 2, slowMultiplier: 0.82, cooldownMs: 1250 },
  foundry: { kind: 'ember', radius: 15, damage: 3, slowMultiplier: 0.9, cooldownMs: 1100 },
  frost: { kind: 'frost', radius: 18, damage: 1, slowMultiplier: 0.48, cooldownMs: 1200 },
  thorn: { kind: 'thorn', radius: 14, damage: 2, slowMultiplier: 0.72, cooldownMs: 1000 },
};

export function dungeonThemeFor(dungeonId: string, floor: number): DungeonTheme {
  return THEMES[Math.abs(hashText(dungeonId) + floor * 13) % THEMES.length];
}

function mixText(mix: (value: number) => void, text: string): void { for (const char of text) mix(char.charCodeAt(0)); }
function topologyChecksum(topology: Omit<DungeonTopology, 'checksum'>): string {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => { hash ^= value & 0xff; hash = Math.imul(hash, 0x01000193); };
  mixText(mix, topology.dungeonId); mix(topology.floor); mix(topology.floorSeed); mixText(mix, topology.theme); mixText(mix, topology.mechanic); mix(topology.w); mix(topology.h);
  for (const tile of topology.tiles) mix(tile);
  for (const variant of topology.floorVariant) mix(variant);
  for (const hazard of topology.hazards) {
    mixText(mix, hazard.id); mixText(mix, hazard.kind);
    for (const value of [Math.round(hazard.x), Math.round(hazard.y), Math.round(hazard.radius * 10), hazard.damage, Math.round(hazard.slowMultiplier * 100), hazard.cooldownMs]) mix(value);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function floorCandidates(unsigned: Pick<DungeonTopology, 'w' | 'h' | 'tiles' | 'entrance' | 'exit'>): DungeonPoint[] {
  const result: DungeonPoint[] = [];
  for (let y = 2; y < unsigned.h - 2; y += 1) for (let x = 2; x < unsigned.w - 2; x += 1) {
    if (unsigned.tiles[y * unsigned.w + x] !== DUNGEON_TILE_FLOOR) continue;
    if (Math.hypot(x - unsigned.entrance.x, y - unsigned.entrance.y) < 7) continue;
    if (Math.hypot(x - unsigned.exit.x, y - unsigned.exit.y) < 4) continue;
    if ((x * 5 + y * 3) % 7 !== 0) continue;
    result.push({ x, y });
  }
  return result;
}

export function generateDungeonTopology(dungeonId: string, floor: number, floorSeed: number): DungeonTopology {
  const rand = mulberry32(floorSeed);
  const theme = dungeonThemeFor(dungeonId, floor);
  const w = theme === 'flooded' ? 56 : theme === 'crypt' ? 50 : 52;
  const h = theme === 'foundry' ? 42 : 40;
  const tiles = new Array<number>(w * h).fill(DUNGEON_TILE_ROCK);
  const floorVariant = Array.from({ length: w * h }, () => Math.floor(rand() * 4));
  const rooms: Room[] = [];
  const roomCount = 6 + Math.min(5, Math.max(0, floor - 1)) + (theme === 'crypt' ? 2 : 0);
  const start: Room = { x: 3, y: Math.floor(h / 2) - 4, w: 9, h: 9 };
  rooms.push(start); carveRoom(tiles, w, start);
  for (let index = 1; index < roomCount; index += 1) {
    const progress = index / (roomCount - 1);
    const base = theme === 'flooded' ? 8 : theme === 'crypt' ? 6 : 7;
    const roomWidth = base + Math.floor(rand() * (theme === 'flooded' ? 7 : 6));
    const roomHeight = base + Math.floor(rand() * (theme === 'crypt' ? 4 : 6));
    const centerX = clampInt(7 + progress * (w - 15) + (rand() - 0.5) * 7, 7, w - 8);
    const centerY = clampInt(6 + rand() * (h - 12), 6, h - 7);
    const room: Room = { x: clampInt(centerX - roomWidth / 2, 2, w - roomWidth - 2), y: clampInt(centerY - roomHeight / 2, 2, h - roomHeight - 2), w: roomWidth, h: roomHeight };
    rooms.push(room); carveRoom(tiles, w, room);
    const previous = roomCenter(rooms[index - 1]); const current = roomCenter(room);
    if (rand() < 0.5) { carveHorizontal(tiles, w, previous.x, current.x, previous.y); carveVertical(tiles, w, previous.y, current.y, current.x); }
    else { carveVertical(tiles, w, previous.y, current.y, previous.x); carveHorizontal(tiles, w, previous.x, current.x, current.y); }
  }
  const entrance = roomCenter(rooms[0]); const exit = roomCenter(rooms[rooms.length - 1]);
  tiles[entrance.y * w + entrance.x] = DUNGEON_TILE_ENTRANCE; tiles[exit.y * w + exit.x] = DUNGEON_TILE_EXIT;
  const base = { version: 2 as const, dungeonId, floor, floorSeed, theme, mechanic: MECHANIC_BY_THEME[theme], w, h, tiles, floorVariant, entrance, exit };
  const candidates = deterministicShuffle(floorCandidates(base), floorSeed ^ 0x6a09e667);
  const hazardCount = Math.min(candidates.length, 3 + Math.min(7, floor) + (theme === 'flooded' ? 3 : 0));
  const profile = HAZARD_BY_THEME[theme];
  const hazards = candidates.slice(0, hazardCount).map((point, index): DungeonHazard => ({
    id: `hazard:${dungeonId}:${floor}:${index}:${floorSeed}`,
    ...profile,
    x: (point.x + 0.5) * DUNGEON_TILE_SIZE,
    y: (point.y + 0.5) * DUNGEON_TILE_SIZE,
  }));
  const unsigned: Omit<DungeonTopology, 'checksum'> = { ...base, hazards };
  return { ...unsigned, checksum: topologyChecksum(unsigned) };
}

export function dungeonTileAt(topology: DungeonTopology, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= topology.w || ty >= topology.h) return DUNGEON_TILE_ROCK;
  return topology.tiles[ty * topology.w + tx] ?? DUNGEON_TILE_ROCK;
}
export function dungeonTileWalkable(tile: number): boolean { return tile !== DUNGEON_TILE_ROCK }
export function canStandInDungeon(topology: DungeonTopology, x: number, y: number, radius = DUNGEON_PLAYER_RADIUS): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const points = [[x - radius, y - radius], [x + radius, y - radius], [x - radius, y + radius], [x + radius, y + radius], [x, y]] as const;
  return points.every(([px, py]) => dungeonTileWalkable(dungeonTileAt(topology, Math.floor(px / DUNGEON_TILE_SIZE), Math.floor(py / DUNGEON_TILE_SIZE))));
}
export function moveInDungeon(topology: DungeonTopology, position: DungeonPoint, dx: number, dy: number, radius = DUNGEON_PLAYER_RADIUS): DungeonPoint {
  let x = position.x; let y = position.y;
  const distance = Math.hypot(dx, dy); const steps = Math.max(1, Math.ceil(distance / Math.max(2, radius * 0.75)));
  for (let step = 0; step < steps; step += 1) {
    const sx = dx / steps; const sy = dy / steps;
    if (canStandInDungeon(topology, x + sx, y, radius)) x += sx;
    if (canStandInDungeon(topology, x, y + sy, radius)) y += sy;
  }
  return { x, y };
}
export function tileCenter(point: DungeonPoint): DungeonPoint { return { x: (point.x + 0.5) * DUNGEON_TILE_SIZE, y: (point.y + 0.5) * DUNGEON_TILE_SIZE } }
export function dungeonSpawnCandidates(topology: DungeonTopology, minimumEntranceDistanceTiles = 8): DungeonPoint[] {
  const candidates: DungeonPoint[] = [];
  for (let y = 2; y < topology.h - 2; y += 1) for (let x = 2; x < topology.w - 2; x += 1) {
    if (dungeonTileAt(topology, x, y) !== DUNGEON_TILE_FLOOR) continue;
    if (Math.hypot(x - topology.entrance.x, y - topology.entrance.y) < minimumEntranceDistanceTiles) continue;
    if (Math.hypot(x - topology.exit.x, y - topology.exit.y) < 2.5) continue;
    const center = tileCenter({ x, y });
    if (topology.hazards.some((hazard) => Math.hypot(center.x - hazard.x, center.y - hazard.y) < hazard.radius + 12)) continue;
    if ((x + y) % 3 !== 0) continue;
    candidates.push({ x, y });
  }
  return candidates;
}
export function deterministicShuffle<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed); const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) { const swap = Math.floor(rand() * (index + 1)); [result[index], result[swap]] = [result[swap], result[index]]; }
  return result;
}
