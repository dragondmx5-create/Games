import { describe, expect, it } from 'vitest';
import { PATH_FLOOR_VARIANT } from '../../server/src/world/overworldTopology';
import { terrainBaseColorHex, type TerrainPaletteColors } from '../render/terrainPresentation';
import { Tile, type World } from '../world';

const palette: TerrainPaletteColors = {
  floor: 0x112233,
  floorAlt: 0x223344,
  path: 0x8d7656,
  farm: 0x6e4a2f,
  accent: 0x8ee6c8,
};

function worldWithVariant(variant: number, greenZone = false): World {
  return {
    layer: 1,
    w: 1,
    h: 1,
    tiles: Uint8Array.of(Tile.Floor),
    floorVariant: Uint8Array.of(variant),
    props: [],
    weaponSpots: [],
    chests: [],
    farmPlots: [],
    npcSpawns: [],
    animalSpawns: [],
    portals: [],
    resourceNodes: [],
    miningNodes: [],
    townBounds: greenZone ? { x0: 0, y0: 0, x1: 0, y1: 0 } : undefined,
    entrance: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
  };
}

describe('3D terrain presentation', () => {
  it('does not mistake ordinary floor variant 5 for a road', () => {
    expect(terrainBaseColorHex(worldWithVariant(5), 0, 0, Tile.Floor, palette)).toBe(palette.floorAlt);
  });

  it('keeps real roads visible inside settlement green zones', () => {
    expect(terrainBaseColorHex(worldWithVariant(PATH_FLOOR_VARIANT, true), 0, 0, Tile.Floor, palette)).toBe(palette.path);
  });

  it('still gives non-road settlement ground its tended green tint', () => {
    expect(terrainBaseColorHex(worldWithVariant(0, true), 0, 0, Tile.Floor, palette)).toBe(0x557a45);
  });
});
