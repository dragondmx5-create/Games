import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PATH_FLOOR_VARIANT } from '../../server/src/world/overworldTopology';
import { TerrainDetailSystem, type TerrainDetailPalette } from '../art3d/terrainDetails';
import { Tile, type World } from '../world';

const palette: TerrainDetailPalette = {
  floor: 0x557c45,
  floorAlt: 0x416b3a,
  rock: 0x555b58,
  accent: 0x8ee6c8,
};

function flatWorld(size: number, variant: number): World {
  return {
    layer: 1,
    w: size,
    h: size,
    tiles: new Uint8Array(size * size).fill(Tile.Floor),
    floorVariant: new Uint8Array(size * size).fill(variant),
    props: [],
    weaponSpots: [],
    chests: [],
    farmPlots: [],
    npcSpawns: [],
    animalSpawns: [],
    portals: [],
    resourceNodes: [],
    miningNodes: [],
    entrance: { x: 0, y: 0 },
    exit: { x: size - 1, y: size - 1 },
  };
}

function grassCounts(system: TerrainDetailSystem): [number, number] {
  const shortGrass = system.root.children[0] as THREE.InstancedMesh;
  const tallGrass = system.root.children[1] as THREE.InstancedMesh;
  return [shortGrass.count, tallGrass.count];
}

describe('terrain detail placement', () => {
  it('never places grass geometry on canonical road tiles', () => {
    const system = new TerrainDetailSystem();
    system.setQuality('high');
    const world = flatWorld(8, PATH_FLOOR_VARIANT);
    system.rebuild(world, 0, 7, 0, 7, () => 0, palette);
    expect(grassCounts(system)).toEqual([0, 0]);
    system.dispose();
  });

  it('treats ordinary variant 5 as natural floor rather than a road', () => {
    const system = new TerrainDetailSystem();
    system.setQuality('high');
    const world = flatWorld(8, 5);
    system.rebuild(world, 0, 7, 0, 7, () => 0, palette);
    const [shortGrass] = grassCounts(system);
    expect(shortGrass).toBeGreaterThan(0);
    system.dispose();
  });
});
