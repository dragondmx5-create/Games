import { describe, expect, it } from 'vitest';
import { TILE, WORLD_RADIUS } from '../config';
import { LAND_DEFINITIONS, regionProfileAt } from '../overworld/registry';
import { generateRegion, isWalkable, landmarkKeepRegion, tileAt, Tile } from '../world';
import { PATH_FLOOR_VARIANT } from '../../server/src/world/overworldTopology';

const WORLD_SEED = 1337;

describe('large world landmarks', () => {
  it('fortifies every capital while leaving minor settlements open', () => {
    for (const land of LAND_DEFINITIONS) {
      const world = generateRegion(land.capital.rx, land.capital.ry, WORLD_SEED);
      const walls = world.props.filter((prop) => prop.kind === 'wallSection');
      const towers = world.props.filter((prop) => prop.kind === 'wallTower');
      const gates = world.props.filter((prop) => prop.kind === 'gatehouse');

      expect(walls.length).toBeGreaterThanOrEqual(10);
      expect(towers).toHaveLength(4);
      expect(gates).toHaveLength(1);

      const gate = gates[0];
      const tx = Math.floor(gate.x / TILE);
      const ty = Math.floor(gate.y / TILE);
      expect(isWalkable(world, tx, ty)).toBe(true);
      expect(world.floorVariant[ty * world.w + tx]).toBe(PATH_FLOOR_VARIANT);
    }

    const minor = LAND_DEFINITIONS.flatMap((land) => land.settlements).find((settlement) => settlement.kind === 'town');
    expect(minor).toBeDefined();
    const minorWorld = generateRegion(minor!.rx, minor!.ry, WORLD_SEED);
    expect(minorWorld.props.some((prop) => prop.kind === 'wallSection' || prop.kind === 'wallTower' || prop.kind === 'gatehouse')).toBe(false);
  });

  it('selects and places exactly one deterministic keep region per land', () => {
    for (const land of LAND_DEFINITIONS) {
      const first = landmarkKeepRegion(land.id, WORLD_SEED);
      const second = landmarkKeepRegion(land.id, WORLD_SEED);
      expect(second).toEqual(first);
      expect(Math.abs(first.rx)).toBeLessThanOrEqual(WORLD_RADIUS);
      expect(Math.abs(first.ry)).toBeLessThanOrEqual(WORLD_RADIUS);

      const profile = regionProfileAt(first.rx, first.ry);
      expect(profile.landId).toBe(land.id);
      expect(profile.settlement).toBeUndefined();
      expect(profile.features).toHaveLength(0);

      const world = generateRegion(first.rx, first.ry, WORLD_SEED);
      const keeps = world.props.filter((prop) => prop.kind === 'keep');
      expect(keeps).toHaveLength(1);
      const tx = Math.floor(keeps[0].x / TILE);
      const ty = Math.floor(keeps[0].y / TILE);
      expect(isWalkable(world, tx, ty)).toBe(true);
    }
  });

  it('adds Emberport dock art at a real shoreline', () => {
    const emberport = LAND_DEFINITIONS.find((land) => land.id === 'cinder-coast')!.capital;
    const world = generateRegion(emberport.rx, emberport.ry, WORLD_SEED);
    const docks = world.props.filter((prop) => prop.kind === 'dock');
    expect(docks).toHaveLength(1);

    const dock = docks[0];
    const tx = Math.floor(dock.x / TILE);
    const ty = Math.floor(dock.y / TILE);
    expect(tileAt(world, tx, ty)).toBe(Tile.Floor);
    const direction = dock.rotationY === 0
      ? [1, 0]
      : dock.rotationY === Math.PI
        ? [-1, 0]
        : dock.rotationY === Math.PI * 0.5
          ? [0, -1]
          : [0, 1];
    for (let step = 1; step <= 5; step++) {
      expect(tileAt(world, tx + direction[0] * step, ty + direction[1] * step)).toBe(Tile.Water);
    }
  });

  it('places bridges only on path crossings flanked by water', () => {
    const world = generateRegion(-2, -5, WORLD_SEED);
    const bridges = world.props.filter((prop) => prop.kind === 'bridge');
    expect(bridges.length).toBeGreaterThan(0);
    for (const bridge of bridges) {
      const tx = Math.floor(bridge.x / TILE);
      const ty = Math.floor(bridge.y / TILE);
      expect(world.floorVariant[ty * world.w + tx]).toBe(PATH_FLOOR_VARIANT);
      if (bridge.rotationY === 0) {
        expect(tileAt(world, tx, ty - 2)).toBe(Tile.Water);
        expect(tileAt(world, tx, ty + 2)).toBe(Tile.Water);
      } else {
        expect(tileAt(world, tx - 2, ty)).toBe(Tile.Water);
        expect(tileAt(world, tx + 2, ty)).toBe(Tile.Water);
      }
    }
  });
});

describe('dungeon entrance art placement', () => {
  it('dresses canonical dungeon entrances without blocking the portal tile', () => {
    let found = false;
    for (let ry = -WORLD_RADIUS; ry <= WORLD_RADIUS && !found; ry++) {
      for (let rx = -WORLD_RADIUS; rx <= WORLD_RADIUS && !found; rx++) {
        const profile = regionProfileAt(rx, ry);
        if (!profile.features.some((feature) => feature.kind === 'dungeon')) continue;
        const world = generateRegion(rx, ry, WORLD_SEED);
        const portal = world.portals.find((entry) => entry.kind === 'dungeon');
        if (!portal) continue;
        found = true;
        expect(isWalkable(world, Math.floor(portal.x / TILE), Math.floor(portal.y / TILE))).toBe(true);
        const dressing = world.props.filter((prop) => ['dungeonPillar', 'dungeonBrazier', 'dungeonRubble'].includes(prop.kind));
        expect(dressing.filter((prop) => prop.kind === 'dungeonPillar')).toHaveLength(2);
        expect(dressing.filter((prop) => prop.kind === 'dungeonBrazier')).toHaveLength(2);
        expect(dressing.length).toBeGreaterThanOrEqual(4);
        for (const prop of dressing) expect(isWalkable(world, Math.floor(prop.x / TILE), Math.floor(prop.y / TILE))).toBe(true);
      }
    }
    expect(found).toBe(true);
  });
});
