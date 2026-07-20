import { describe, expect, it } from 'vitest';
import {
  DUNGEON_TILE_ENTRANCE,
  DUNGEON_TILE_EXIT,
  DUNGEON_TILE_ROCK,
  canStandInDungeon,
  deriveDungeonFloorSeed,
  dungeonTileAt,
  generateDungeonTopology,
  moveInDungeon,
  tileCenter,
} from '../dungeon/topology.js';

function connected(topology: ReturnType<typeof generateDungeonTopology>): boolean {
  const queue = [{ ...topology.entrance }];
  const visited = new Set([`${topology.entrance.x},${topology.entrance.y}`]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.x === topology.exit.x && current.y === topology.exit.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (visited.has(key) || dungeonTileAt(topology, x, y) === DUNGEON_TILE_ROCK) continue;
      visited.add(key);
      queue.push({ x, y });
    }
  }
  return false;
}

describe('authoritative Dungeon topology', () => {
  it('is deterministic, checksummed, and varies by floor', () => {
    const runSeed = 918273;
    const floor1Seed = deriveDungeonFloorSeed(runSeed, 'old-crown-mine', 1);
    const a = generateDungeonTopology('old-crown-mine', 1, floor1Seed);
    const b = generateDungeonTopology('old-crown-mine', 1, floor1Seed);
    const floor2 = generateDungeonTopology('old-crown-mine', 2, deriveDungeonFloorSeed(runSeed, 'old-crown-mine', 2));
    expect(a).toEqual(b);
    expect(a.version).toBe(2);
    expect(a.theme).toBeTruthy();
    expect(a.mechanic).toBeTruthy();
    expect(a.hazards.length).toBeGreaterThan(0);
    expect(a.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(floor2.checksum).not.toBe(a.checksum);
    expect(dungeonTileAt(a, a.entrance.x, a.entrance.y)).toBe(DUNGEON_TILE_ENTRANCE);
    expect(dungeonTileAt(a, a.exit.x, a.exit.y)).toBe(DUNGEON_TILE_EXIT);
    expect(connected(a)).toBe(true);
    for (const hazard of a.hazards) {
      expect(canStandInDungeon(a, hazard.x, hazard.y)).toBe(true);
      expect(Math.hypot(hazard.x / 16 - a.entrance.x, hazard.y / 16 - a.entrance.y)).toBeGreaterThan(5);
      expect(Math.hypot(hazard.x / 16 - a.exit.x, hazard.y / 16 - a.exit.y)).toBeGreaterThan(2);
    }
  });

  it('owns collision and never lets intent cross rock', () => {
    const topology = generateDungeonTopology('hagspire-cellars', 1, 12345);
    const entrance = tileCenter(topology.entrance);
    expect(canStandInDungeon(topology, entrance.x, entrance.y)).toBe(true);
    expect(canStandInDungeon(topology, -1, -1)).toBe(false);

    const moved = moveInDungeon(topology, entrance, -10_000, -10_000);
    expect(canStandInDungeon(topology, moved.x, moved.y)).toBe(true);
    expect(moved).not.toEqual({ x: entrance.x - 10_000, y: entrance.y - 10_000 });
  });
});
