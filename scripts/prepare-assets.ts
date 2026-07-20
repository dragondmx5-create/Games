/**
 * Prepare owner art-pack assets: trim transparent margins from the uploaded
 * high-res pixel art and nearest-neighbor downscale to world-pixel scale
 * (1 image px = 1 world px, tile = 16 px), per the manifest contract.
 *
 * Run: npx tsx scripts/prepare-assets.ts
 */
import { createCanvas, loadImage, Canvas } from 'canvas';
import * as fs from 'fs';

const UP = '/mnt/user-data/uploads';
const OUT = 'public/assets';

interface Job { src: string; out: string; maxHeight: number }
const JOBS: Job[] = [
  { src: `${UP}/1000054009.png`, out: 'tree.png', maxHeight: 96 },      // broad canopy tree
  { src: `${UP}/1000054006.png`, out: 'tree-2.png', maxHeight: 96 },    // tall tree
  { src: `${UP}/1000053998.png`, out: 'tree-3.png', maxHeight: 92 },    // tree on grass mound
  { src: `${UP}/1000054011.png`, out: 'tree-4.png', maxHeight: 58 },     // small round tree
  { src: `${UP}/1000054010.png`, out: 'tree-5.png', maxHeight: 58 },     // small tree with roots
  { src: `${UP}/1000054007.png`, out: 'tree-dead.png', maxHeight: 68 },  // bare dead tree
  { src: `${UP}/1000054004.png`, out: 'tree-stump.png', maxHeight: 28 }, // stump
  { src: `${UP}/1000053999.png`, out: 'rock.png', maxHeight: 26 },       // boulder pile
  { src: `${UP}/1000054008.png`, out: 'bush.png', maxHeight: 28 },       // leafy bush (shrooms slot)
  { src: `${UP}/1000054005.png`, out: 'wood.png', maxHeight: 17 },       // fallen log (wood item)
  { src: `${UP}/1000054002.png`, out: 'fence.png', maxHeight: 25 },      // wooden fence segment
];

/**
 * The AI-generated art is drawn on a chunky "fake pixel" grid (each art
 * pixel spans ~8-12 real pixels). Downscaling to an arbitrary size shears
 * that grid, and even a whole-number estimate drifts when the true cell
 * size is fractional (e.g. 9.8 px) — the grid slips one art pixel every
 * few dozen samples, which reads as mush. So: coarse integer estimate from
 * run lengths first, then a sub-pixel search over cell size and grid phase
 * that minimizes color mismatch around each sample point.
 */
function detectCellSize(data: Uint8ClampedArray, W: number, H: number, box: [number, number, number, number]): number {
  const [x0, y0, x1, y1] = box;
  const counts = new Map<number, number>();
  const same = (a: number, b: number) => {
    if (data[a * 4 + 3] < 24 || data[b * 4 + 3] < 24) return false;
    return Math.abs(data[a * 4] - data[b * 4]) <= 6 &&
      Math.abs(data[a * 4 + 1] - data[b * 4 + 1]) <= 6 &&
      Math.abs(data[a * 4 + 2] - data[b * 4 + 2]) <= 6;
  };
  const bump = (run: number) => {
    if (run >= 5 && run <= 16) counts.set(run, (counts.get(run) ?? 0) + 1);
  };
  for (let y = y0; y <= y1; y += 3) {
    let run = 1;
    for (let x = x0 + 1; x <= x1; x++) {
      if (same(y * W + x, y * W + x - 1)) run++;
      else { bump(run); run = 1; }
    }
    bump(run);
  }
  for (let x = x0; x <= x1; x += 3) {
    let run = 1;
    for (let y = y0 + 1; y <= y1; y++) {
      if (same(y * W + x, (y - 1) * W + x)) run++;
      else { bump(run); run = 1; }
    }
    bump(run);
  }
  let best = 10, bestCount = 0;
  for (const [len, count] of counts) {
    if (count > bestCount) { best = len; bestCount = count; }
  }
  return best;
}

interface Grid { cell: number; ox: number; oy: number }

/** refine to fractional cell size + phase: a sample point sits mid-cell when
 * the pixels a third of a cell away in every direction still match it */
function refineGrid(data: Uint8ClampedArray, W: number, H: number, box: [number, number, number, number], coarse: number): Grid {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const px = (x: number, y: number): number => {
    const xi = Math.min(x1, Math.max(x0, Math.round(x)));
    const yi = Math.min(y1, Math.max(y0, Math.round(y)));
    return (yi * W + xi);
  };
  const matches = (a: number, b: number): boolean => {
    const alphaA = data[a * 4 + 3] >= 24, alphaB = data[b * 4 + 3] >= 24;
    if (alphaA !== alphaB) return false;
    if (!alphaA) return true;
    return Math.abs(data[a * 4] - data[b * 4]) <= 10 &&
      Math.abs(data[a * 4 + 1] - data[b * 4 + 1]) <= 10 &&
      Math.abs(data[a * 4 + 2] - data[b * 4 + 2]) <= 10;
  };
  let best: Grid = { cell: coarse, ox: coarse / 2, oy: coarse / 2 };
  let bestScore = -1;
  const candidates: Array<{ g: Grid; score: number }> = [];
  // score on a central patch to keep the search fast
  const cols = Math.min(34, Math.floor(w / (coarse * 2)) - 2);
  const rows = Math.min(34, Math.floor(h / (coarse * 2)) - 2);
  // a half- or third-size harmonic of the true cell also scores perfectly
  // (its probe points never cross a real boundary), so sweep up past twice
  // the coarse estimate and afterwards prefer the LARGEST consistent cell
  for (let cell = Math.max(6, coarse - 1); cell <= coarse * 2 + 1.5; cell += 0.05) {
    const cx0 = x0 + (w - cols * cell) / 2;
    const cy0 = y0 + (h - rows * cell) / 2;
    for (let po = 0; po < 5; po++) {
      for (let qo = 0; qo < 5; qo++) {
        const ox = (po / 5) * cell;
        const oy = (qo / 5) * cell;
        let score = 0;
        const d = cell * 0.32;
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const sx = cx0 + ox + i * cell;
            const sy = cy0 + oy + j * cell;
            const c0 = px(sx, sy);
            if (matches(c0, px(sx - d, sy)) && matches(c0, px(sx + d, sy)) &&
                matches(c0, px(sx, sy - d)) && matches(c0, px(sx, sy + d))) score++;
          }
        }
        candidates.push({ g: { cell, ox: (((cx0 + ox - x0) % cell) + cell) % cell, oy: (((cy0 + oy - y0) % cell) + cell) % cell }, score });
        if (score > bestScore) bestScore = score;
      }
    }
  }
  for (const cand of candidates) {
    if (cand.score >= bestScore * 0.985 && cand.g.cell > best.cell - 0.001) best = cand.g;
  }
  return best;
}

async function run(job: Job) {
  const img = await loadImage(job.src);
  const full = createCanvas(img.width, img.height);
  const fc = full.getContext('2d');
  fc.drawImage(img, 0, 0);
  const id = fc.getImageData(0, 0, img.width, img.height);
  const data = id.data;
  const W = img.width, H = img.height;

  // ---- background removal ----
  // The uploads have the checkerboard BAKED IN (fully opaque). Flood-fill
  // from the borders through "neutral bright" pixels (the checker plus the
  // soft gray drop shadows painted over it); everything reached becomes
  // transparent, with the darker shadow grays rebuilt as real black alpha
  // so the props keep their soft ground shadows.
  const visited = new Uint8Array(W * H);
  const stack: number[] = [];
  const neutral = (i: number) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx - mn <= 14 && mx >= 110;
  };
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    if (visited[p] || !neutral(p)) continue;
    visited[p] = 1;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  // Everything the border flood reached becomes fully transparent — including
  // the baked soft drop shadows. The game engine draws its own ground shadow
  // under every prop, so keeping the checker-textured baked ones produced
  // double, blotchy shadows.
  for (let p = 0; p < W * H; p++) {
    if (visited[p]) {
      data[p * 4 + 3] = 0;
    } else {
      // stray checker pixels fully enclosed by foliage never get reached by
      // the border flood — kill any light neutral pixel outright
      const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn <= 14 && mx >= 210) data[p * 4 + 3] = 0;
    }
  }
  // defringe: edge pixels that are washed-out blends of the checker and the
  // sprite (light, low saturation) leave a pale halo after keying — peel
  // them off in a couple of erosion passes
  for (let pass = 0; pass < 2; pass++) {
    const kill: number[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (data[p * 4 + 3] === 0) continue;
        const nearClear =
          (x > 0 && data[(p - 1) * 4 + 3] === 0) ||
          (x < W - 1 && data[(p + 1) * 4 + 3] === 0) ||
          (y > 0 && data[(p - W) * 4 + 3] === 0) ||
          (y < H - 1 && data[(p + W) * 4 + 3] === 0);
        if (!nearClear) continue;
        const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx - mn <= 26 && mx >= 188) kill.push(p);
      }
    }
    for (const p of kill) data[p * 4 + 3] = 0;
  }
  fc.putImageData(id, 0, 0);

  // alpha bounding box
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  // Measurement showed the AI art has NO true pixel lattice (reconstruction
  // error rises monotonically with sampling step — it's continuous art in a
  // pixel-art style). So nearest sampling can never be clean. The right
  // pipeline for gridless art is: high-quality area downscale (averages the
  // soft detail instead of aliasing it), then a hard alpha cut for a crisp
  // silhouette, then median-cut palette quantization so the muddy blended
  // tones snap back to flat pixel-art colors.
  const targetH = job.maxHeight;
  const targetW = Math.max(1, Math.round((w / h) * targetH));
  const out = createCanvas(targetW, targetH) as Canvas;
  const oc = out.getContext('2d');
  (oc as any).imageSmoothingEnabled = true;
  (oc as any).imageSmoothingQuality = 'high';
  oc.drawImage(full, minX, minY, w, h, 0, 0, targetW, targetH);
  const oid = oc.getImageData(0, 0, targetW, targetH);
  const od = oid.data;
  // hard alpha edges
  for (let p = 0; p < targetW * targetH; p++) {
    od[p * 4 + 3] = od[p * 4 + 3] >= 110 ? 255 : 0;
  }
  // median-cut palette from opaque pixels
  const pixels: number[] = [];
  for (let p = 0; p < targetW * targetH; p++) {
    if (od[p * 4 + 3] === 255) pixels.push(p);
  }
  interface Box2 { idx: number[] }
  let boxes: Box2[] = [{ idx: pixels }];
  const PALETTE_SIZE = 24;
  while (boxes.length < PALETTE_SIZE) {
    // split the box with the widest channel range
    let bi = -1, bch = 0, brange = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].idx.length < 2) continue;
      for (let ch = 0; ch < 3; ch++) {
        let mn = 255, mx = 0;
        for (const p of boxes[i].idx) {
          const v = od[p * 4 + ch];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (mx - mn > brange) { brange = mx - mn; bi = i; bch = ch; }
      }
    }
    if (bi < 0 || brange <= 4) break;
    const box = boxes[bi];
    box.idx.sort((a, b) => od[a * 4 + bch] - od[b * 4 + bch]);
    const mid = box.idx.length >> 1;
    boxes.splice(bi, 1, { idx: box.idx.slice(0, mid) }, { idx: box.idx.slice(mid) });
  }
  const palette: [number, number, number][] = boxes
    .filter((b) => b.idx.length > 0)
    .map((b) => {
      let r = 0, g = 0, bl = 0;
      for (const p of b.idx) { r += od[p * 4]; g += od[p * 4 + 1]; bl += od[p * 4 + 2]; }
      const n = b.idx.length;
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
    });
  for (const p of pixels) {
    let bd = Infinity, bc = palette[0];
    for (const col of palette) {
      const dr = od[p * 4] - col[0], dg = od[p * 4 + 1] - col[1], db = od[p * 4 + 2] - col[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bd) { bd = dist; bc = col; }
    }
    od[p * 4] = bc[0]; od[p * 4 + 1] = bc[1]; od[p * 4 + 2] = bc[2];
  }
  oc.putImageData(oid, 0, 0);
  fs.writeFileSync(`${OUT}/${job.out}`, out.toBuffer('image/png'));
  console.log(`${job.out}: ${w}x${h} -> ${targetW}x${targetH} (${palette.length} colors)`);
}

async function main() {
  for (const j of JOBS) await run(j);
}
main().catch((e) => { console.error(e); process.exit(1); });
