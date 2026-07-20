import { describe, it, expect } from 'vitest';
import { canHit, REDZONE_WEAPON } from '../redzone/combat.js';
import { generateRedZoneWorld, isWalkable, Tile } from '../redzone/world.js';

describe('canHit', () => {
  it('hits a target directly in front, in range', () => {
    // attacker at origin facing right (facing=0), target 10px to the right
    expect(canHit(0, 0, 0, 10, 0)).toBe(true);
  });

  it('misses a target beyond weapon range', () => {
    expect(canHit(0, 0, 0, REDZONE_WEAPON.range + 5, 0)).toBe(false);
  });

  it('misses a target behind the attacker, even in range', () => {
    // facing right (0), target directly behind (negative x)
    expect(canHit(0, 0, 0, -10, 0)).toBe(false);
  });

  it('misses a target just outside the arc, hits just inside it', () => {
    const halfArc = REDZONE_WEAPON.arc / 2;
    const r = 10;
    // just inside the arc edge
    const insideAngle = halfArc - 0.05;
    expect(canHit(0, 0, 0, Math.cos(insideAngle) * r, Math.sin(insideAngle) * r)).toBe(true);
    // just outside the arc edge
    const outsideAngle = halfArc + 0.05;
    expect(canHit(0, 0, 0, Math.cos(outsideAngle) * r, Math.sin(outsideAngle) * r)).toBe(false);
  });

  it('handles the angle-wraparound case (facing near +-PI)', () => {
    // facing almost exactly backwards (PI), target slightly past the wrap point
    const facing = Math.PI - 0.05;
    const target = { x: -10 * Math.cos(0.1), y: -10 * Math.sin(0.1) };
    expect(canHit(0, 0, facing, target.x, target.y)).toBe(true);
  });
});

describe('generateRedZoneWorld', () => {
  it('is deterministic for a given seed', () => {
    const a = generateRedZoneWorld(42);
    const b = generateRedZoneWorld(42);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.spawn).toEqual(b.spawn);
  });

  it('surrounds the map with solid border walls', () => {
    const w = generateRedZoneWorld(1);
    for (let x = 0; x < w.w; x++) {
      expect(w.tiles[x]).toBe(Tile.Rock);
      expect(w.tiles[(w.h - 1) * w.w + x]).toBe(Tile.Rock);
    }
    for (let y = 0; y < w.h; y++) {
      expect(w.tiles[y * w.w]).toBe(Tile.Rock);
      expect(w.tiles[y * w.w + (w.w - 1)]).toBe(Tile.Rock);
    }
  });

  it('keeps the spawn point walkable', () => {
    const w = generateRedZoneWorld(7);
    const tx = Math.floor(w.spawn.x / 16);
    const ty = Math.floor(w.spawn.y / 16);
    expect(isWalkable(w, tx, ty)).toBe(true);
  });
});
