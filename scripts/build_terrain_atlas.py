#!/usr/bin/env python3
from pathlib import Path
from PIL import Image

ROOT = Path('src/assets3d/pbr')
LAYERS = ['grass', 'dirt', 'mud', 'moss', 'pebble', 'leaflitter']
MAPS = ['basecolor', 'normal', 'orm', 'height']
TILE = 512
GUTTER = 8
COLS = 3
ROWS = 2
CELL = TILE + GUTTER * 2

for map_name in MAPS:
    mode = 'L' if map_name == 'height' else 'RGB'
    atlas = Image.new(mode, (COLS * CELL, ROWS * CELL))
    for index, layer in enumerate(LAYERS):
        source = Image.open(ROOT / f'{layer}_{map_name}.png').convert(mode)
        if source.size != (TILE, TILE):
            source = source.resize((TILE, TILE), Image.Resampling.LANCZOS)
        col, row = index % COLS, index // COLS
        x, y = col * CELL + GUTTER, row * CELL + GUTTER
        atlas.paste(source, (x, y))
        # Wrap gutters so bilinear/mipmap sampling does not bleed into adjacent layers.
        atlas.paste(source.crop((0, 0, TILE, 1)).resize((TILE, GUTTER)), (x, y - GUTTER))
        atlas.paste(source.crop((0, TILE - 1, TILE, TILE)).resize((TILE, GUTTER)), (x, y + TILE))
        atlas.paste(source.crop((0, 0, 1, TILE)).resize((GUTTER, TILE)), (x - GUTTER, y))
        atlas.paste(source.crop((TILE - 1, 0, TILE, TILE)).resize((GUTTER, TILE)), (x + TILE, y))
        atlas.paste(source.crop((TILE - 1, TILE - 1, TILE, TILE)).resize((GUTTER, GUTTER)), (x - GUTTER, y - GUTTER))
        atlas.paste(source.crop((0, TILE - 1, 1, TILE)).resize((GUTTER, GUTTER)), (x + TILE, y - GUTTER))
        atlas.paste(source.crop((TILE - 1, 0, TILE, 1)).resize((GUTTER, GUTTER)), (x - GUTTER, y + TILE))
        atlas.paste(source.crop((0, 0, 1, 1)).resize((GUTTER, GUTTER)), (x + TILE, y + TILE))
    out = ROOT / f'terrain_{map_name}_atlas.png'
    atlas.save(out, optimize=True, compress_level=9)
    print(f'generated {out} {atlas.size}')
