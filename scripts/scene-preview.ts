import { createCanvas, loadImage, Canvas, Image } from 'canvas';
import * as fs from 'fs';
(globalThis as any).document = { createElement: (t: string) => createCanvas(1, 1) };
async function main() {
  const sprites = await import('../src/sprites') as any;
  const { buildTileSet, GRASS_PALETTE } = sprites;
  const TILE = 16, COLS = 30, ROWS = 18, SC = 3;
  const cv = createCanvas(COLS * TILE * SC, ROWS * TILE * SC);
  const c = cv.getContext('2d');
  (c as any).imageSmoothingEnabled = false;
  c.scale(SC, SC);
  const ts = buildTileSet(TILE, TILE, GRASS_PALETTE, 777);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const v = (Math.abs((x * 7 + y * 13) * 2654435761) >>> 8) % 6;
    c.drawImage(ts.floors[v] as Canvas, x * TILE, y * TILE, TILE, TILE);
  }
  const load = (n: string) => loadImage(`public/assets/${n}`);
  const [t1, t2, t3, td, st, rk, bs] = await Promise.all(
    ['tree.png','tree-2.png','tree-3.png','tree-dead.png','tree-stump.png','rock.png','bush.png'].map(load));
  interface It { y: number; img: Image; x: number }
  const items: It[] = [
    { img: t1, x: 60, y: 105 }, { img: t2, x: 150, y: 90 }, { img: t3, x: 250, y: 120 },
    { img: t1, x: 380, y: 95 }, { img: td, x: 320, y: 200 }, { img: t2, x: 440, y: 210 },
    { img: t3, x: 120, y: 250 }, { img: st, x: 210, y: 190 }, { img: rk, x: 300, y: 260 },
    { img: bs, x: 170, y: 150 }, { img: bs, x: 410, y: 150 }, { img: rk, x: 55, y: 190 },
    { img: t1, x: 470, y: 270 },
  ];
  items.sort((a, b) => a.y - b.y);
  for (const it of items) c.drawImage(it.img as any, Math.round(it.x - it.img.width / 2), Math.round(it.y - it.img.height));
  fs.writeFileSync('/home/claude/scene-new-assets.png', cv.toBuffer('image/png'));
  console.log('ok');
}
main();
