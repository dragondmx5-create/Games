import { describe, it, expect } from 'vitest';
import { generateWorld, Tile, tileAt, isWalkable, inTown, inFarmZone, inGreenZone, enemySpawnPoints } from '../world';
import { MAP_W, MAP_H, TILE, enemyCountFor } from '../config';

describe('generateWorld', () => {
  it('is deterministic for a given layer + seed', () => {
    const a = generateWorld(2, 12345);
    const b = generateWorld(2, 12345);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.entrance).toEqual(b.entrance);
    expect(a.exit).toEqual(b.exit);
  });

  it('produces a map of the configured size', () => {
    const w = generateWorld(1, 1);
    expect(w.w).toBe(MAP_W);
    expect(w.h).toBe(MAP_H);
    expect(w.tiles.length).toBe(MAP_W * MAP_H);
  });

  it('places a walkable entrance and exit, far apart from each other', () => {
    for (const seed of [1, 2, 3]) {
      const w = generateWorld(1, seed);
      expect(tileAt(w, w.entrance.x, w.entrance.y)).toBe(Tile.Entrance);
      expect(tileAt(w, w.exit.x, w.exit.y)).toBe(Tile.Exit);
      expect(isWalkable(w, w.entrance.x, w.entrance.y)).toBe(true);
      expect(isWalkable(w, w.exit.x, w.exit.y)).toBe(true);
      const dist = Math.hypot(w.entrance.x - w.exit.x, w.entrance.y - w.exit.y);
      expect(dist).toBeGreaterThan(20); // should be roughly opposite corners of a 220x220 map
    }
  });

  it('keeps all dungeon floors free of overworld settlements and farms', () => {
    for (const layer of [1, 2, 3, 4, 5]) {
      for (const seed of [1, 42, 99]) {
        const world = generateWorld(layer, seed);
        expect(world.townBounds).toBeUndefined();
        expect(world.farmBounds).toBeUndefined();
        expect(world.farmPlots).toHaveLength(0);
        expect(world.npcSpawns).toHaveLength(0);
        expect(world.animalSpawns).toHaveLength(0);
      }
    }
  });

  it('scales enemy count with layer via enemyCountFor', () => {
    for (let layer = 1; layer <= 5; layer++) {
      const w = generateWorld(layer, 7);
      const pts = enemySpawnPoints(w, enemyCountFor(layer), 7 ^ layer);
      // may fall short of `count` if the map is too cramped/full of safe zones,
      // but should get reasonably close for an open map
      expect(pts.length).toBeGreaterThan(0);
      expect(pts.length).toBeLessThanOrEqual(enemyCountFor(layer));
    }
  });

  it('never spawns an enemy point inside the town/farm safe zone', () => {
    const w = generateWorld(1, 42);
    const pts = enemySpawnPoints(w, enemyCountFor(1), 42);
    for (const p of pts) {
      expect(inGreenZone(w, p.x, p.y)).toBe(false);
    }
  });

  it('scatters iron ore tiles, more of them on deeper layers', () => {
    const countIronOre = (w: ReturnType<typeof generateWorld>) => {
      let n = 0;
      for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === Tile.IronOre) n++;
      return n;
    };
    const shallow = countIronOre(generateWorld(1, 10));
    const deep = countIronOre(generateWorld(5, 10));
    expect(shallow).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(shallow);
  });

  it('places an unopened chest alongside the weapon spot in most ruins', () => {
    let withChest = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const w = generateWorld(2, seed);
      if (w.chests.length === 0) continue;
      withChest++;
      for (const c of w.chests) {
        expect(c.opened).toBe(false);
        expect(isWalkable(w, Math.floor(c.x / TILE), Math.floor(c.y / TILE))).toBe(true);
      }
      expect(w.chests.length).toBe(w.weaponSpots.length); // one chest per ruin, same as the weapon spot
    }
    expect(withChest).toBeGreaterThanOrEqual(5);
  });

  it('never tills a farm plot inside the town', () => {
    // the flood-fill used to leak through the town doorway when its anchor
    // landed just outside the walls — now every claimed tile must be outside
    for (let seed = 1; seed <= 12; seed++) {
      const w = generateWorld(1, seed);
      if (!w.townBounds) continue;
      for (const plot of w.farmPlots) {
        expect(inTown(w, plot.tx, plot.ty)).toBe(false);
      }
    }
  });

  it('carves a walkable road that gets most of the way from entrance to exit', () => {
    const w = generateWorld(1, 11);
    let steps = 0;
    let walkableSteps = 0;
    const a = w.entrance;
    const b = w.exit;
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const tx = Math.round(a.x + (b.x - a.x) * t);
      const ty = Math.round(a.y + (b.y - a.y) * t);
      steps++;
      if (isWalkable(w, tx, ty)) walkableSteps++;
    }
    // the road is a straight corridor cleared through the terrain — nearly the
    // whole line should be walkable (some tolerance for town/ruin walls it
    // deliberately routes around instead of cutting through)
    expect(walkableSteps / steps).toBeGreaterThan(0.9);
  });
});

describe('inTown / inFarmZone / inGreenZone', () => {
  it('agree with each other: inGreenZone is the union of the other two', () => {
    const w = generateWorld(1, 5);
    for (let ty = 0; ty < w.h; ty += 7) {
      for (let tx = 0; tx < w.w; tx += 7) {
        const town = inTown(w, tx, ty);
        const farm = inFarmZone(w, tx, ty);
        expect(inGreenZone(w, tx, ty)).toBe(town || farm);
      }
    }
  });

  it('is false everywhere when no townBounds/farmBounds are set', () => {
    const w = generateWorld(1, 5);
    w.townBounds = undefined;
    w.farmBounds = undefined;
    expect(inTown(w, 10, 10)).toBe(false);
    expect(inFarmZone(w, 10, 10)).toBe(false);
    expect(inGreenZone(w, 10, 10)).toBe(false);
  });
});
