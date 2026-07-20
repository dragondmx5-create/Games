export interface PbrTextureUrls {
  baseColor: string;
  normal: string;
  orm: string;
  height: string;
}

function asset(name: string): string {
  // Vite rewrites each literal URL into a hashed production asset.
  switch (name) {
    case 'wood_basecolor': return new URL('../assets3d/pbr/wood_basecolor.png', import.meta.url).href;
    case 'wood_normal': return new URL('../assets3d/pbr/wood_normal.png', import.meta.url).href;
    case 'wood_orm': return new URL('../assets3d/pbr/wood_orm.png', import.meta.url).href;
    case 'wood_height': return new URL('../assets3d/pbr/wood_height.png', import.meta.url).href;
    case 'plaster_basecolor': return new URL('../assets3d/pbr/plaster_basecolor.png', import.meta.url).href;
    case 'plaster_normal': return new URL('../assets3d/pbr/plaster_normal.png', import.meta.url).href;
    case 'plaster_orm': return new URL('../assets3d/pbr/plaster_orm.png', import.meta.url).href;
    case 'plaster_height': return new URL('../assets3d/pbr/plaster_height.png', import.meta.url).href;
    case 'stone_basecolor': return new URL('../assets3d/pbr/stone_basecolor.png', import.meta.url).href;
    case 'stone_normal': return new URL('../assets3d/pbr/stone_normal.png', import.meta.url).href;
    case 'stone_orm': return new URL('../assets3d/pbr/stone_orm.png', import.meta.url).href;
    case 'stone_height': return new URL('../assets3d/pbr/stone_height.png', import.meta.url).href;
    case 'roof_basecolor': return new URL('../assets3d/pbr/roof_basecolor.png', import.meta.url).href;
    case 'roof_normal': return new URL('../assets3d/pbr/roof_normal.png', import.meta.url).href;
    case 'roof_orm': return new URL('../assets3d/pbr/roof_orm.png', import.meta.url).href;
    case 'roof_height': return new URL('../assets3d/pbr/roof_height.png', import.meta.url).href;
    case 'metal_basecolor': return new URL('../assets3d/pbr/metal_basecolor.png', import.meta.url).href;
    case 'metal_normal': return new URL('../assets3d/pbr/metal_normal.png', import.meta.url).href;
    case 'metal_orm': return new URL('../assets3d/pbr/metal_orm.png', import.meta.url).href;
    case 'metal_height': return new URL('../assets3d/pbr/metal_height.png', import.meta.url).href;
    case 'cloth_basecolor': return new URL('../assets3d/pbr/cloth_basecolor.png', import.meta.url).href;
    case 'cloth_normal': return new URL('../assets3d/pbr/cloth_normal.png', import.meta.url).href;
    case 'cloth_orm': return new URL('../assets3d/pbr/cloth_orm.png', import.meta.url).href;
    case 'cloth_height': return new URL('../assets3d/pbr/cloth_height.png', import.meta.url).href;
    case 'leather_basecolor': return new URL('../assets3d/pbr/leather_basecolor.png', import.meta.url).href;
    case 'leather_normal': return new URL('../assets3d/pbr/leather_normal.png', import.meta.url).href;
    case 'leather_orm': return new URL('../assets3d/pbr/leather_orm.png', import.meta.url).href;
    case 'leather_height': return new URL('../assets3d/pbr/leather_height.png', import.meta.url).href;
    case 'ground_basecolor': return new URL('../assets3d/pbr/ground_basecolor.png', import.meta.url).href;
    case 'ground_normal': return new URL('../assets3d/pbr/ground_normal.png', import.meta.url).href;
    case 'ground_orm': return new URL('../assets3d/pbr/ground_orm.png', import.meta.url).href;
    case 'ground_height': return new URL('../assets3d/pbr/ground_height.png', import.meta.url).href;
    case 'grass_basecolor': return new URL('../assets3d/pbr/grass_basecolor.png', import.meta.url).href;
    case 'grass_normal': return new URL('../assets3d/pbr/grass_normal.png', import.meta.url).href;
    case 'grass_orm': return new URL('../assets3d/pbr/grass_orm.png', import.meta.url).href;
    case 'grass_height': return new URL('../assets3d/pbr/grass_height.png', import.meta.url).href;
    case 'dirt_basecolor': return new URL('../assets3d/pbr/dirt_basecolor.png', import.meta.url).href;
    case 'dirt_normal': return new URL('../assets3d/pbr/dirt_normal.png', import.meta.url).href;
    case 'dirt_orm': return new URL('../assets3d/pbr/dirt_orm.png', import.meta.url).href;
    case 'dirt_height': return new URL('../assets3d/pbr/dirt_height.png', import.meta.url).href;
    case 'mud_basecolor': return new URL('../assets3d/pbr/mud_basecolor.png', import.meta.url).href;
    case 'mud_normal': return new URL('../assets3d/pbr/mud_normal.png', import.meta.url).href;
    case 'mud_orm': return new URL('../assets3d/pbr/mud_orm.png', import.meta.url).href;
    case 'mud_height': return new URL('../assets3d/pbr/mud_height.png', import.meta.url).href;
    case 'moss_basecolor': return new URL('../assets3d/pbr/moss_basecolor.png', import.meta.url).href;
    case 'moss_normal': return new URL('../assets3d/pbr/moss_normal.png', import.meta.url).href;
    case 'moss_orm': return new URL('../assets3d/pbr/moss_orm.png', import.meta.url).href;
    case 'moss_height': return new URL('../assets3d/pbr/moss_height.png', import.meta.url).href;
    case 'pebble_basecolor': return new URL('../assets3d/pbr/pebble_basecolor.png', import.meta.url).href;
    case 'pebble_normal': return new URL('../assets3d/pbr/pebble_normal.png', import.meta.url).href;
    case 'pebble_orm': return new URL('../assets3d/pbr/pebble_orm.png', import.meta.url).href;
    case 'pebble_height': return new URL('../assets3d/pbr/pebble_height.png', import.meta.url).href;
    case 'leaflitter_basecolor': return new URL('../assets3d/pbr/leaflitter_basecolor.png', import.meta.url).href;
    case 'leaflitter_normal': return new URL('../assets3d/pbr/leaflitter_normal.png', import.meta.url).href;
    case 'leaflitter_orm': return new URL('../assets3d/pbr/leaflitter_orm.png', import.meta.url).href;
    case 'leaflitter_height': return new URL('../assets3d/pbr/leaflitter_height.png', import.meta.url).href;
    case 'foliage_basecolor': return new URL('../assets3d/pbr/foliage_basecolor.png', import.meta.url).href;
    case 'foliage_normal': return new URL('../assets3d/pbr/foliage_normal.png', import.meta.url).href;
    case 'foliage_orm': return new URL('../assets3d/pbr/foliage_orm.png', import.meta.url).href;
    case 'foliage_height': return new URL('../assets3d/pbr/foliage_height.png', import.meta.url).href;
    case 'hair_basecolor': return new URL('../assets3d/pbr/hair_basecolor.png', import.meta.url).href;
    case 'hair_normal': return new URL('../assets3d/pbr/hair_normal.png', import.meta.url).href;
    case 'hair_orm': return new URL('../assets3d/pbr/hair_orm.png', import.meta.url).href;
    case 'hair_height': return new URL('../assets3d/pbr/hair_height.png', import.meta.url).href;
    case 'fur_basecolor': return new URL('../assets3d/pbr/fur_basecolor.png', import.meta.url).href;
    case 'fur_normal': return new URL('../assets3d/pbr/fur_normal.png', import.meta.url).href;
    case 'fur_orm': return new URL('../assets3d/pbr/fur_orm.png', import.meta.url).href;
    case 'fur_height': return new URL('../assets3d/pbr/fur_height.png', import.meta.url).href;
    case 'crystal_basecolor': return new URL('../assets3d/pbr/crystal_basecolor.png', import.meta.url).href;
    case 'crystal_normal': return new URL('../assets3d/pbr/crystal_normal.png', import.meta.url).href;
    case 'crystal_orm': return new URL('../assets3d/pbr/crystal_orm.png', import.meta.url).href;
    case 'crystal_height': return new URL('../assets3d/pbr/crystal_height.png', import.meta.url).href;
    case 'skin_basecolor': return new URL('../assets3d/pbr/skin_basecolor.png', import.meta.url).href;
    case 'skin_normal': return new URL('../assets3d/pbr/skin_normal.png', import.meta.url).href;
    case 'skin_orm': return new URL('../assets3d/pbr/skin_orm.png', import.meta.url).href;
    case 'skin_height': return new URL('../assets3d/pbr/skin_height.png', import.meta.url).href;
    default: throw new Error(`Unknown PBR texture asset: ${name}`);
  }
}

export const PBR_TEXTURE_URLS = {
  wood: { baseColor: asset('wood_basecolor'), normal: asset('wood_normal'), orm: asset('wood_orm'), height: asset('wood_height') },
  plaster: { baseColor: asset('plaster_basecolor'), normal: asset('plaster_normal'), orm: asset('plaster_orm'), height: asset('plaster_height') },
  stone: { baseColor: asset('stone_basecolor'), normal: asset('stone_normal'), orm: asset('stone_orm'), height: asset('stone_height') },
  roof: { baseColor: asset('roof_basecolor'), normal: asset('roof_normal'), orm: asset('roof_orm'), height: asset('roof_height') },
  metal: { baseColor: asset('metal_basecolor'), normal: asset('metal_normal'), orm: asset('metal_orm'), height: asset('metal_height') },
  cloth: { baseColor: asset('cloth_basecolor'), normal: asset('cloth_normal'), orm: asset('cloth_orm'), height: asset('cloth_height') },
  leather: { baseColor: asset('leather_basecolor'), normal: asset('leather_normal'), orm: asset('leather_orm'), height: asset('leather_height') },
  ground: { baseColor: asset('ground_basecolor'), normal: asset('ground_normal'), orm: asset('ground_orm'), height: asset('ground_height') },
  grass: { baseColor: asset('grass_basecolor'), normal: asset('grass_normal'), orm: asset('grass_orm'), height: asset('grass_height') },
  dirt: { baseColor: asset('dirt_basecolor'), normal: asset('dirt_normal'), orm: asset('dirt_orm'), height: asset('dirt_height') },
  mud: { baseColor: asset('mud_basecolor'), normal: asset('mud_normal'), orm: asset('mud_orm'), height: asset('mud_height') },
  moss: { baseColor: asset('moss_basecolor'), normal: asset('moss_normal'), orm: asset('moss_orm'), height: asset('moss_height') },
  pebble: { baseColor: asset('pebble_basecolor'), normal: asset('pebble_normal'), orm: asset('pebble_orm'), height: asset('pebble_height') },
  leaflitter: { baseColor: asset('leaflitter_basecolor'), normal: asset('leaflitter_normal'), orm: asset('leaflitter_orm'), height: asset('leaflitter_height') },
  foliage: { baseColor: asset('foliage_basecolor'), normal: asset('foliage_normal'), orm: asset('foliage_orm'), height: asset('foliage_height') },
  hair: { baseColor: asset('hair_basecolor'), normal: asset('hair_normal'), orm: asset('hair_orm'), height: asset('hair_height') },
  fur: { baseColor: asset('fur_basecolor'), normal: asset('fur_normal'), orm: asset('fur_orm'), height: asset('fur_height') },
  crystal: { baseColor: asset('crystal_basecolor'), normal: asset('crystal_normal'), orm: asset('crystal_orm'), height: asset('crystal_height') },
  skin: { baseColor: asset('skin_basecolor'), normal: asset('skin_normal'), orm: asset('skin_orm'), height: asset('skin_height') },
} as const;

export type PbrTextureKind = keyof typeof PBR_TEXTURE_URLS;

export const PBR_TEXTURE_URL_LIST: readonly string[] = Object.values(PBR_TEXTURE_URLS)
  .flatMap((set) => [set.baseColor, set.normal, set.orm, set.height]);

/** Pre-decodes the PBR library during the title-screen boot sequence so the
 * first playable frame does not visibly pop from flat placeholders to detail. */
export async function preloadPbrTextures(onProgress?: (loaded: number, total: number) => void): Promise<void> {
  if (typeof Image === 'undefined') return;
  let loaded = 0;
  const total = PBR_TEXTURE_URL_LIST.length;
  await Promise.all(PBR_TEXTURE_URL_LIST.map((url) => new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    const finish = (): void => {
      loaded++;
      onProgress?.(loaded, total);
      resolve();
    };
    image.onload = finish;
    image.onerror = finish;
    image.src = url;
  })));
}

export const TERRAIN_ATLAS_URLS = {
  baseColor: new URL('../assets3d/pbr/terrain_basecolor_atlas.png', import.meta.url).href,
  normal: new URL('../assets3d/pbr/terrain_normal_atlas.png', import.meta.url).href,
  orm: new URL('../assets3d/pbr/terrain_orm_atlas.png', import.meta.url).href,
  height: new URL('../assets3d/pbr/terrain_height_atlas.png', import.meta.url).href,
} as const;

export const TERRAIN_ATLAS_LAYOUT = {
  tileSize: 512,
  gutter: 8,
  columns: 3,
  rows: 2,
  width: 1584,
  height: 1056,
} as const;
