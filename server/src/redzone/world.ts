// A small, purpose-built world generator for the Red Zone PvP arena — NOT
// the solo dungeon's cellular-automata cave generator (the game project's
// src/world.ts). Reusing that algorithm here would mean either converting
// this repo into an npm workspace or hand-duplicating a large, actively-
// changing surface; this is a small, stable, purpose-built alternative
// instead (see CLAUDE.md's Red Zone section). Only the Tile *values* are
// duplicated from the game project (Rock/Floor/Water), since they must
// exactly match what the existing client-side renderer expects — those
// three values haven't changed since the tile enum was introduced and are
// unlikely to.
export const Tile = { Rock: 0, Floor: 1, Water: 2 } as const;

export const TILE_PX = 16; // must match config.ts's TILE in the game project
export const RED_ZONE_W = 100;
export const RED_ZONE_H = 100;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RedZoneWorld {
  w: number;
  h: number;
  tiles: Uint8Array;
  floorVariant: Uint8Array;
  spawn: { x: number; y: number }; // px, center of the map
}

/** carves a circular patch of `tile` into the grid, clamped to the 1px border */
function carveCircle(tiles: Uint8Array, w: number, h: number, cx: number, cy: number, radius: number, tile: number, onlyIfFloor = false): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const idx = y * w + x;
      if (onlyIfFloor && tiles[idx] !== Tile.Floor) continue;
      tiles[idx] = tile;
    }
  }
}

export function generateRedZoneWorld(seed = Date.now()): RedZoneWorld {
  const rand = mulberry32(seed);
  const w = RED_ZONE_W;
  const h = RED_ZONE_H;
  const tiles = new Uint8Array(w * h).fill(Tile.Floor);
  const floorVariant = new Uint8Array(w * h);

  // border walls
  for (let x = 0; x < w; x++) {
    tiles[x] = Tile.Rock;
    tiles[(h - 1) * w + x] = Tile.Rock;
  }
  for (let y = 0; y < h; y++) {
    tiles[y * w] = Tile.Rock;
    tiles[y * w + (w - 1)] = Tile.Rock;
  }

  // scattered rock clusters for cover
  for (let i = 0; i < 40; i++) {
    const cx = 3 + Math.floor(rand() * (w - 6));
    const cy = 3 + Math.floor(rand() * (h - 6));
    carveCircle(tiles, w, h, cx, cy, 1 + Math.floor(rand() * 3), Tile.Rock);
  }

  // a few ponds, decorative only (water isn't solid — see isWalkable below)
  for (let i = 0; i < 6; i++) {
    const cx = 3 + Math.floor(rand() * (w - 6));
    const cy = 3 + Math.floor(rand() * (h - 6));
    carveCircle(tiles, w, h, cx, cy, 2 + Math.floor(rand() * 3), Tile.Water, true);
  }

  for (let i = 0; i < w * h; i++) floorVariant[i] = Math.floor(rand() * 6);

  // guaranteed-clear spawn circle at the center, carved last so it always wins
  const scx = Math.floor(w / 2);
  const scy = Math.floor(h / 2);
  carveCircle(tiles, w, h, scx, scy, 4, Tile.Floor);

  return { w, h, tiles, floorVariant, spawn: { x: (scx + 0.5) * TILE_PX, y: (scy + 0.5) * TILE_PX } };
}

export function isWalkable(world: RedZoneWorld, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return false;
  return world.tiles[ty * world.w + tx] !== Tile.Rock;
}
