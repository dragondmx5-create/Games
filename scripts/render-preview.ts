/**
 * Headless art-direction preview: composes a meadow scene straight from the
 * game's procedural sprite generators (no browser needed) so palette/art
 * changes in src/sprites.ts can be judged against reference art.
 *
 * Run: npx tsx scripts/render-preview.ts out.png
 */
import { createCanvas, Canvas } from 'canvas';
import * as fs from 'fs';

// ---- shim just enough DOM for sprites.ts ----
(globalThis as any).document = {
  createElement(tag: string) {
    if (tag !== 'canvas') throw new Error('only canvas supported');
    return createCanvas(1, 1);
  },
};

async function main() {
  const sprites = await import('../src/sprites');
  const {
    buildTileSet, GRASS_PALETTE, treeSprite, tallGrassSprite, grassTuftSprite,
    flowerSprite, shroomClusterSprite, NATURE_ART_SCALE, TILE_ART_SCALE,
  } = sprites as any;

  const TILE = 16;
  const COLS = 26, ROWS = 34;
  const SCALE = 2;
  const W = Math.round(COLS * TILE * SCALE);
  const H = Math.round(ROWS * TILE * SCALE);
  const out = createCanvas(W, H);
  const c = out.getContext('2d');
  (c as any).imageSmoothingEnabled = true;
  c.scale(SCALE, SCALE);

  // deterministic rng
  let st = 12345;
  const r = () => {
    st = (st + 0x6d2b79f5) | 0;
    let t = Math.imul(st ^ (st >>> 15), 1 | st);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const ts = buildTileSet(TILE, TILE, GRASS_PALETTE, 777);

  // ---- ground ----
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const v = (Math.abs((tx * 7 + ty * 13) * 2654435761) >>> 8) % 6;
      const f = ts.floors[v] as Canvas;
      c.drawImage(f as any, tx * TILE, ty * TILE, TILE, TILE);
    }
  }

  interface Item { y: number; draw: () => void }
  const items: Item[] = [];

  // ---- tree ring (like the reference's enclosing canopy) ----
  const trees: Array<[number, number]> = [];
  for (let i = 0; i < 30; i++) {
    // cluster along edges + a few inside
    const edge = i < 22;
    const tx = edge
      ? (r() < 0.5 ? r() * 5 : COLS - 1 - r() * 5)
      : 4 + r() * (COLS - 8);
    const ty = edge && r() < 0.5 ? (r() < 0.5 ? r() * 6 : ROWS - 1 - r() * 6) : r() * ROWS;
    trees.push([tx * TILE, ty * TILE]);
  }
  // also dense top band
  for (let i = 0; i < 12; i++) trees.push([r() * COLS * TILE, r() * 4 * TILE]);

  let seedN = 1;
  for (const [x, y] of trees) {
    const spr = treeSprite(seedN++) as Canvas;
    const lw = spr.width / 4, lh = spr.height / 4;
    items.push({
      y,
      draw: () => {
        // soft ground shadow
        c.globalAlpha = 0.28;
        c.fillStyle = '#123312';
        c.beginPath();
        c.ellipse(x, y + 2, lw * 0.34, lh * 0.12, 0, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
        c.drawImage(spr as any, x - lw / 2, y - lh + 6, lw, lh);
      },
    });
  }

  // ---- meadow decorations ----
  for (let i = 0; i < 90; i++) {
    const x = r() * COLS * TILE, y = r() * ROWS * TILE;
    const kind = r();
    if (kind < 0.35) {
      const s = tallGrassSprite(GRASS_PALETTE.floor, (i * 31 + 7) | 0) as Canvas;
      items.push({ y, draw: () => c.drawImage(s as any, x - 7, y - 13, 14, 13) });
    } else if (kind < 0.7) {
      const s = grassTuftSprite(GRASS_PALETTE.floor, (i * 17 + 3) | 0) as Canvas;
      items.push({ y, draw: () => c.drawImage(s as any, x - 5, y - 9, 10, 9) });
    } else {
      const s = flowerSprite((i * 13 + 1) | 0) as Canvas;
      items.push({ y, draw: () => c.drawImage(s as any, x - 3, y - 8, 6, 8) });
    }
  }
  // flower/berry bush clusters like the red bushes in the reference
  if (shroomClusterSprite) {
    for (let i = 0; i < 5; i++) {
      const x = r() * COLS * TILE, y = r() * ROWS * TILE;
      try {
        const s = shroomClusterSprite(i + 40) as Canvas;
        const lw = s.width / NATURE_ART_SCALE, lh = s.height / NATURE_ART_SCALE;
        items.push({ y, draw: () => c.drawImage(s as any, x - lw / 2, y - lh, lw, lh) });
      } catch { /* optional */ }
    }
  }

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  const outPath = process.argv[2] || '/home/claude/preview.png';
  fs.writeFileSync(outPath, out.toBuffer('image/png'));
  console.log('wrote', outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
