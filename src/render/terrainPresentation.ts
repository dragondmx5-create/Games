import { PATH_FLOOR_VARIANT, RESOURCE_TRAIL_FLOOR_VARIANT, STONE_ROAD_FLOOR_VARIANT } from '../../server/src/world/overworldTopology';
import { inGreenZone, type World } from '../world';
import { Tile } from '../world/types';

export interface TerrainPaletteColors {
  floor: number;
  floorAlt: number;
  path: number;
  farm: number;
  accent: number;
  brick?: number;
}

/** Base terrain tint before deterministic lightness jitter is applied. */
export function terrainBaseColorHex(
  world: World,
  tx: number,
  ty: number,
  tile: Tile,
  palette: TerrainPaletteColors,
): number {
  if (tile === Tile.Farmland) return palette.farm;
  if (tile === Tile.Entrance || tile === Tile.Exit) return palette.accent;
  const variant = world.floorVariant[ty * world.w + tx] ?? 0;
  // Paths must win over the town/farm green-zone override. Otherwise roads in
  // settlements become grass-coloured and the shader cannot identify them.
  if (variant === STONE_ROAD_FLOOR_VARIANT) return palette.brick ?? palette.accent;
  if (variant === RESOURCE_TRAIL_FLOOR_VARIANT) return palette.path;
  if (variant === PATH_FLOOR_VARIANT) return palette.path;
  if (inGreenZone(world, tx, ty)) return 0x557a45;
  return variant % 2 === 0 ? palette.floor : palette.floorAlt;
}
