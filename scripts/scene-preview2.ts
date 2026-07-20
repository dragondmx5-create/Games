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
  const [t1, t2, t3, t4, t5, td, st, rk, bs, fc, cow, chick] = await Promise.all(
    ['tree.png','tree-2.png','tree-3.png','tree-4.png','tree-5.png','tree-dead.png','tree-stump.png','rock.png','bush.png','fence.png','cow.png','chicken.png'].map(load));
  interface It { y: number; img: Image; x: number }
  const items: It[] = [
    { img: t1, x: 60, y: 100 }, { img: t2, x: 165, y: 92 }, { img: t4, x: 250, y: 110 },
    { img: t3, x: 390, y: 100 }, { img: td, x: 100, y: 230 }, { img: t5, x: 455, y: 250 },
    { img: st, x: 190, y: 180 }, { img: rk, x: 280, y: 210 }, { img: bs, x: 160, y: 140 },
    { img: bs, x: 430, y: 160 },
  ];
  // fenced livestock pen (5x5 tiles) like the in-game rendering
  const penX0 = 300, penY0 = 175, penW = 5 * TILE;
  const segW = fc.width;
  const count = Math.round(penW / segW);
  for (const ey of [penY0 + 4, penY0 + penW]) {
    for (let i = 0; i < count; i++) items.push({ img: fc as any, x: penX0 + (penW / count) * (i + 0.5), y: ey });
  }
  // side edges: just the post, stacked
  const postW = Math.max(4, Math.round(fc.width * 0.24));
  const postCv = createCanvas(postW, fc.height);
  const pc = postCv.getContext('2d');
  pc.drawImage(fc as any, 0, 0, postW, fc.height, 0, 0, postW, fc.height);
  for (const ex of [penX0 + 2, penX0 + penW - 2]) {
    for (let py = penY0 + 12; py < penY0 + penW; py += 10) items.push({ img: postCv as any, x: ex, y: py });
  }
  items.push({ img: cow as any, x: penX0 + 30, y: penY0 + 40 });
  items.push({ img: chick as any, x: penX0 + 55, y: penY0 + 60 });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) c.drawImage(it.img as any, Math.round(it.x - it.img.width / 2), Math.round(it.y - it.img.height));
  fs.writeFileSync('/home/claude/scene-final.png', cv.toBuffer('image/png'));
  console.log('ok');
}
main();
