import { describe, it, expect } from 'vitest';
import { generateRegion, gatePositions, inWorldBounds, regionKey, Tile, isWalkable, World, EdgeDir, prepareAuthoritativeEnemyArea } from '../world';
import { WORLD_RADIUS, REGION_SIZE } from '../config';

const SEED = 987654321;

function bfsReachable(world: World, from: { x: number; y: number }): Set<number> {
  const seen = new Set<number>();
  const start = from.y * world.w + from.x;
  if (!isWalkable(world, from.x, from.y)) return seen;
  seen.add(start);
  const queue = [start];
  while (queue.length) {
    const cur = queue.pop()!;
    const cx = cur % world.w;
    const cy = (cur / world.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
      const ni = ny * world.w + nx;
      if (seen.has(ni) || !isWalkable(world, nx, ny)) continue;
      seen.add(ni);
      queue.push(ni);
    }
  }
  return seen;
}

describe('generateRegion', () => {
  it('is deterministic for a given world seed + coordinates', () => {
    const a = generateRegion(2, -1, SEED);
    const b = generateRegion(2, -1, SEED);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.entrance).toEqual(b.entrance);
    expect(a.props.length).toBe(b.props.length);
  });

  it('produces different regions for different coordinates', () => {
    const a = generateRegion(0, 1, SEED);
    const b = generateRegion(1, 0, SEED);
    expect(a.tiles).not.toEqual(b.tiles);
  });

  it('is REGION_SIZE-sized and tagged with its coordinates', () => {
    const r = generateRegion(-2, 3, SEED);
    expect(r.w).toBe(REGION_SIZE);
    expect(r.h).toBe(REGION_SIZE);
    expect(r.region).toEqual({ rx: -2, ry: 3 });
  });

  it('authors settlements and dungeon portals without using overworld layer tiles', () => {
    const capital = generateRegion(0, 0, SEED);
    expect(capital.profile?.settlement?.kind).toBe('capital');
    expect(capital.townBounds).toBeDefined();
    expect(capital.farmPlots.length).toBeGreaterThan(0);

    const minorTown = generateRegion(-1, 0, SEED);
    expect(minorTown.profile?.settlement?.name).toBe('Millhaven');
    expect(minorTown.townBounds).toBeDefined();

    const dungeonRegion = generateRegion(1, -1, SEED);
    expect(dungeonRegion.portals.some((portal) => portal.kind === 'dungeon' && portal.dungeonId === 'old-crown-mine')).toBe(true);

    const wild = generateRegion(2, 2, SEED);
    expect(wild.profile?.settlement).toBeUndefined();
    expect(wild.townBounds).toBeUndefined();
    let layerTiles = 0;
    for (const tile of wild.tiles) if (tile === Tile.Exit || tile === Tile.Entrance) layerTiles++;
    expect(layerTiles).toBe(0); // floors exist only inside generated dungeons
  });

  it('rejects coordinates outside the bounded world', () => {
    expect(() => generateRegion(WORLD_RADIUS + 1, 0, SEED)).toThrow();
    expect(inWorldBounds(WORLD_RADIUS, -WORLD_RADIUS)).toBe(true);
    expect(inWorldBounds(WORLD_RADIUS + 1, 0)).toBe(false);
  });

  it('agrees on gate positions across every shared edge (the travel invariant)', () => {
    for (let rx = -WORLD_RADIUS; rx < WORLD_RADIUS; rx++) {
      for (let ry = -WORLD_RADIUS; ry <= WORLD_RADIUS; ry++) {
        expect(gatePositions(SEED, rx, ry, 'e')).toEqual(gatePositions(SEED, rx + 1, ry, 'w'));
      }
    }
    for (let rx = -WORLD_RADIUS; rx <= WORLD_RADIUS; rx++) {
      for (let ry = -WORLD_RADIUS; ry < WORLD_RADIUS; ry++) {
        expect(gatePositions(SEED, rx, ry, 's')).toEqual(gatePositions(SEED, rx, ry + 1, 'n'));
      }
    }
  });

  it('carves no gates on the world border — the world is bounded', () => {
    expect(gatePositions(SEED, WORLD_RADIUS, 0, 'e')).toEqual([]);
    expect(gatePositions(SEED, -WORLD_RADIUS, 0, 'w')).toEqual([]);
    expect(gatePositions(SEED, 0, WORLD_RADIUS, 's')).toEqual([]);
    expect(gatePositions(SEED, 0, -WORLD_RADIUS, 'n')).toEqual([]);

    // and the border rows of an edge-of-world region are fully solid
    const corner = generateRegion(WORLD_RADIUS, WORLD_RADIUS, SEED);
    for (let x = 0; x < corner.w; x++) {
      expect(isWalkable(corner, x, corner.h - 1)).toBe(false); // south = world border
    }
    for (let y = 0; y < corner.h; y++) {
      expect(isWalkable(corner, corner.w - 1, y)).toBe(false); // east = world border
    }
  });

  it('makes every gate mouth walkable and connected to the region interior', () => {
    // several seeds x several regions — this is the empirical guarantee that
    // GATE_DEPTH corridors always reach the cave's main connected mass
    for (const seed of [SEED, 42, 20260711]) {
      for (const [rx, ry] of [[0, 0], [1, 0], [-1, 2], [3, -3], [-3, 0]] as const) {
        const world = generateRegion(rx, ry, seed);
        const reachable = bfsReachable(world, world.entrance);
        expect(reachable.size).toBeGreaterThan(100);
        for (const dir of ['n', 's', 'e', 'w'] as EdgeDir[]) {
          for (const pos of gatePositions(seed, rx, ry, dir)) {
            const mouth =
              dir === 'w' ? { x: 0, y: pos }
              : dir === 'e' ? { x: world.w - 1, y: pos }
              : dir === 'n' ? { x: pos, y: 0 }
              : { x: pos, y: world.h - 1 };
            expect(isWalkable(world, mouth.x, mouth.y), `${regionKey(rx, ry)} seed ${seed} ${dir}@${pos} walkable`).toBe(true);
            expect(reachable.has(mouth.y * world.w + mouth.x), `${regionKey(rx, ry)} seed ${seed} ${dir}@${pos} connected`).toBe(true);
          }
        }
      }
    }
  });
  it('keeps the server-authorized spawn square walkable and resource-free', () => {
    const center = Math.floor(REGION_SIZE / 2);
    for (const [rx, ry] of [[0, 0], [-4, -3], [4, -3], [-4, 3], [0, 4], [4, 3]] as const) {
      const world = generateRegion(rx, ry, SEED);
      for (let y = center - 2; y <= center + 2; y++) {
        for (let x = center - 2; x <= center + 2; x++) expect(isWalkable(world, x, y)).toBe(true);
      }
      expect(world.resourceNodes.every((node) => Math.max(Math.abs(node.tx - center), Math.abs(node.ty - center)) >= 7)).toBe(true);
    }
  });

  it('carves a reachable combat pocket for authoritative enemy homes', () => {
    const world = generateRegion(2, 2, SEED);
    const tx = 48;
    const ty = 48;
    for (let y = ty - 2; y <= ty + 2; y++) {
      for (let x = tx - 2; x <= tx + 2; x++) world.tiles[y * world.w + x] = Tile.Rock;
    }
    prepareAuthoritativeEnemyArea(world, (tx + 0.5) * 16, (ty + 0.5) * 16);
    for (let y = ty - 2; y <= ty + 2; y++) {
      for (let x = tx - 2; x <= tx + 2; x++) expect(isWalkable(world, x, y)).toBe(true);
    }
  });

});
