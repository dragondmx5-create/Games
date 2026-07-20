import { rng, shade } from './core';

/**
 * Nature sprites (tree, grass, flowers, pebbles) are authored at this
 * multiple of their in-world size and drawn scaled down by the renderer.
 * Combined with the supersampled backbuffer (config RENDER_SCALE) they show
 * real painterly detail instead of chunky world pixels.
 */
export const NATURE_ART_SCALE = 4;

/**
 * Procedural branching tree, drawn the way a tree is actually built:
 * the trunk is a tapered cylinder that recursively splits into smaller
 * cylinders (branches), and each terminal twig carries a cluster of small
 * diamond-shaped leaves whose overlapping tones read as foliage mass.
 * Authored at 4x world scale (logical 72x92) — noticeably larger than the
 * player character.
 */
export function treeSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  // roomy canvas: the recursive branches + leaf clusters previously clipped
  // flat against the old 72x92 bounds, giving squared-off canopies
  const LW = 104; // logical size
  const LH = 112;
  const cv = document.createElement('canvas');
  cv.width = LW * 4;
  cv.height = LH * 4;
  const c = cv.getContext('2d')!;
  c.scale(4, 4);

  const palettes = [
    { dark: '#153c16', mid: '#245c1f', light: '#38822b', glow: '#57a83f' },
    { dark: '#164423', mid: '#28642f', light: '#3f8a41', glow: '#5fae53' },
    { dark: '#1f4413', mid: '#33641d', light: '#4c882a', glow: '#6cac3e' },
  ];
  const pal = palettes[(r() * palettes.length) | 0];
  const barkDark = '#2c2014';
  const barkMid = '#4a3826';
  const barkLight = '#5f4a30';

  interface Twig { x: number; y: number; size: number }
  const twigs: Twig[] = [];

  /** one tapered cylinder segment; splits into 2-3 children until thin */
  const branch = (x: number, y: number, angle: number, length: number, width: number, depth: number): void => {
    const bend = (r() - 0.5) * 0.5;
    const midAngle = angle + bend * 0.5;
    const mx = x + Math.cos(midAngle) * length * 0.5;
    const my = y + Math.sin(midAngle) * length * 0.5;
    const ex = x + Math.cos(midAngle + bend * 0.5) * length;
    const ey = y + Math.sin(midAngle + bend * 0.5) * length;
    const endWidth = Math.max(0.8, width * 0.62);
    // cylinder body: filled tapered quad along the curve
    const nx = Math.cos(midAngle + Math.PI / 2);
    const ny = Math.sin(midAngle + Math.PI / 2);
    c.fillStyle = depth === 0 ? barkMid : depth === 1 ? barkMid : barkDark;
    c.beginPath();
    c.moveTo(x + nx * width * 0.5, y + ny * width * 0.5);
    c.quadraticCurveTo(mx + nx * width * 0.55, my + ny * width * 0.55, ex + nx * endWidth * 0.5, ey + ny * endWidth * 0.5);
    c.lineTo(ex - nx * endWidth * 0.5, ey - ny * endWidth * 0.5);
    c.quadraticCurveTo(mx - nx * width * 0.55, my - ny * width * 0.55, x - nx * width * 0.5, y - ny * width * 0.5);
    c.closePath();
    c.fill();
    // cylinder shading: lit strip along one side, core shadow on the other
    if (width > 2.2) {
      c.strokeStyle = barkLight;
      c.lineWidth = Math.max(0.8, width * 0.22);
      c.beginPath();
      c.moveTo(x - nx * width * 0.22, y - ny * width * 0.22);
      c.quadraticCurveTo(mx - nx * width * 0.24, my - ny * width * 0.24, ex - nx * endWidth * 0.2, ey - ny * endWidth * 0.2);
      c.stroke();
      c.strokeStyle = barkDark;
      c.beginPath();
      c.moveTo(x + nx * width * 0.3, y + ny * width * 0.3);
      c.quadraticCurveTo(mx + nx * width * 0.32, my + ny * width * 0.32, ex + nx * endWidth * 0.28, ey + ny * endWidth * 0.28);
      c.stroke();
    }
    if (endWidth <= 1.1 || depth >= 4) {
      twigs.push({ x: ex, y: ey, size: 7 + r() * 6 + (4 - depth) * 2 });
      return;
    }
    const children = depth === 0 ? 3 : r() < 0.75 ? 2 : 3;
    for (let i = 0; i < children; i++) {
      const spread = (i - (children - 1) / 2) * (0.55 + r() * 0.25) + (r() - 0.5) * 0.2;
      branch(ex, ey, midAngle + bend * 0.5 + spread, length * (0.68 + r() * 0.14), endWidth, depth + 1);
    }
    // occasional side twig off the middle of a limb
    if (depth >= 1 && r() < 0.4) {
      twigs.push({ x: mx, y: my, size: 6 + r() * 4 });
    }
  };

  const baseX = LW / 2;
  const baseY = LH - 4;
  // root flare: three short cylinders splaying at the base
  c.fillStyle = barkMid;
  for (const [dx, wRoot] of [[-4.5, 3], [0, 3.6], [4.5, 3]] as const) {
    c.beginPath();
    c.moveTo(baseX + dx - wRoot, baseY);
    c.quadraticCurveTo(baseX + dx * 0.4, baseY - 7, baseX - 1.5, baseY - 10);
    c.lineTo(baseX + 1.5, baseY - 10);
    c.quadraticCurveTo(baseX + dx * 0.6, baseY - 6, baseX + dx + wRoot, baseY);
    c.closePath();
    c.fill();
  }
  // the trunk cylinder, growing upward
  branch(baseX, baseY - 8, -Math.PI / 2 + (r() - 0.5) * 0.14, 20 + r() * 5, 7.5, 0);

  // pull any wayward clusters back inside the canvas — extreme seeds used to
  // push foliage past the edge, which rendered as an unnatural flat cut
  for (const t of twigs) {
    const pad = t.size + 2;
    t.x = Math.max(pad, Math.min(LW - pad, t.x));
    t.y = Math.max(pad, Math.min(LH - pad, t.y));
  }

  // unify the crown: big clusters fitted to the canopy's real bounds fill the
  // gaps between branch-tip tufts so it reads as one rounded leaf mass
  // (the reference trees are solid domes, not scraggly tufts)
  if (twigs.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const t of twigs) {
      minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x);
      minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = Math.max(14, (maxX - minX) / 2);
    const ry = Math.max(12, (maxY - minY) / 2);
    const big = Math.min(rx, ry) * (0.72 + r() * 0.12);
    twigs.push(
      { x: cx, y: cy, size: big * 1.15 },
      { x: cx - rx * 0.55, y: cy - ry * 0.15, size: big },
      { x: cx + rx * 0.55, y: cy - ry * 0.15, size: big },
      { x: cx - rx * 0.28, y: cy - ry * 0.6, size: big * 0.9 },
      { x: cx + rx * 0.28, y: cy - ry * 0.6, size: big * 0.9 },
    );
  }

  /** a leaf cluster: dozens of small diamonds in three tones — the mass of
   * overlapping lozenges is what reads as foliage */
  const leaf = (x: number, y: number, size: number, color: string) => {
    const halfW = size * 0.5;
    const halfH = size * 0.95;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x, y - halfH);
    c.lineTo(x + halfW, y);
    c.lineTo(x, y + halfH);
    c.lineTo(x - halfW, y);
    c.closePath();
    c.fill();
  };
  const cluster = (cx2: number, cy2: number, radius: number) => {
    const count = Math.round(radius * radius * 0.72);
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * radius;
      const lx = cx2 + Math.cos(a) * d;
      const ly = cy2 + Math.sin(a) * d * 0.85;
      // light comes from the top-left of each cluster
      const litness = 0.5 + (0.5 - (ly - cy2) / (radius * 2)) * 0.6 + (0.5 - (lx - cx2) / (radius * 2)) * 0.4;
      const tone = litness * 0.72 + (r() - 0.5) * 0.35;
      const color = tone > 0.72 ? pal.glow : tone > 0.5 ? pal.light : tone > 0.3 ? pal.mid : pal.dark;
      const rot = (r() - 0.5) * 0.9;
      c.save();
      c.translate(lx, ly);
      c.rotate(rot);
      leaf(0, 0, 2 + r() * 1.6, color);
      c.restore();
    }
  };

  // under-canopy shadow mass first so gaps between leaves stay dark — drawn
  // slightly oversized so it also reads as the dark canopy rim the reference
  // trees have
  c.fillStyle = pal.dark;
  c.globalAlpha = 0.95;
  for (const t of twigs) {
    c.beginPath();
    c.ellipse(t.x, t.y + 0.6, t.size * 1.04, t.size * 0.88, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  // then the lozenge clusters at every twig, back-to-front (lower first)
  twigs.sort((a, b) => b.y - a.y);
  for (const t of twigs) cluster(t.x, t.y, t.size);

  // seed-varied blossom/fruit sprinkles on some trees
  const accent = r();
  if (accent < 0.22) {
    c.fillStyle = accent < 0.09 ? '#eaa8c0' : '#d84a3a';
    for (const t of twigs) {
      if (r() < 0.5) continue;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(t.x + (r() - 0.5) * t.size * 1.4, t.y + (r() - 0.5) * t.size, 0.9 + r() * 0.5, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  return cv;
}

/**
 * Dead tree from the same recursive cylinder skeleton — deeper splits, no
 * leaves, pale weathered bark. Mixed sparsely among living trees.
 */
export function deadTreeSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const LW = 64;
  const LH = 84;
  const cv = document.createElement('canvas');
  cv.width = LW * 4;
  cv.height = LH * 4;
  const c = cv.getContext('2d')!;
  c.scale(4, 4);
  const barkDark = '#2e2620';
  const barkMid = '#463a30';
  const barkLight = '#5c4e40';

  const branch = (x: number, y: number, angle: number, length: number, width: number, depth: number): void => {
    const bend = (r() - 0.5) * 0.9;
    const midAngle = angle + bend * 0.5;
    const mx = x + Math.cos(midAngle) * length * 0.5;
    const my = y + Math.sin(midAngle) * length * 0.5;
    const ex = x + Math.cos(midAngle + bend * 0.5) * length;
    const ey = y + Math.sin(midAngle + bend * 0.5) * length;
    const endWidth = Math.max(0.5, width * 0.58);
    const nx = Math.cos(midAngle + Math.PI / 2);
    const ny = Math.sin(midAngle + Math.PI / 2);
    c.fillStyle = depth < 2 ? barkMid : barkDark;
    c.beginPath();
    c.moveTo(x + nx * width * 0.5, y + ny * width * 0.5);
    c.quadraticCurveTo(mx + nx * width * 0.55, my + ny * width * 0.55, ex + nx * endWidth * 0.5, ey + ny * endWidth * 0.5);
    c.lineTo(ex - nx * endWidth * 0.5, ey - ny * endWidth * 0.5);
    c.quadraticCurveTo(mx - nx * width * 0.55, my - ny * width * 0.55, x - nx * width * 0.5, y - ny * width * 0.5);
    c.closePath();
    c.fill();
    if (width > 2) {
      c.strokeStyle = barkLight;
      c.lineWidth = Math.max(0.7, width * 0.18);
      c.beginPath();
      c.moveTo(x - nx * width * 0.24, y - ny * width * 0.24);
      c.quadraticCurveTo(mx - nx * width * 0.26, my - ny * width * 0.26, ex - nx * endWidth * 0.2, ey - ny * endWidth * 0.2);
      c.stroke();
    }
    if (endWidth <= 0.7 || depth >= 5) return;
    const children = r() < 0.7 ? 2 : 3;
    for (let i = 0; i < children; i++) {
      const spread = (i - (children - 1) / 2) * (0.6 + r() * 0.35) + (r() - 0.5) * 0.3;
      branch(ex, ey, midAngle + bend * 0.5 + spread, length * (0.66 + r() * 0.16), endWidth, depth + 1);
    }
  };

  const baseX = LW / 2;
  const baseY = LH - 4;
  c.fillStyle = barkMid;
  for (const [dx, wRoot] of [[-4, 2.6], [0, 3], [4, 2.6]] as const) {
    c.beginPath();
    c.moveTo(baseX + dx - wRoot, baseY);
    c.quadraticCurveTo(baseX + dx * 0.4, baseY - 6, baseX - 1.2, baseY - 9);
    c.lineTo(baseX + 1.2, baseY - 9);
    c.quadraticCurveTo(baseX + dx * 0.6, baseY - 5, baseX + dx + wRoot, baseY);
    c.closePath();
    c.fill();
  }
  branch(baseX, baseY - 7, -Math.PI / 2 + (r() - 0.5) * 0.2, 17 + r() * 4, 6, 0);
  return cv;
}
/** Procedural stump fallback (logical 34x28, authored 4x) shown where a
 * harvested canonical tree stood — normally replaced by the manifest art. */
export function stumpSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = 136;
  cv.height = 112;
  const c = cv.getContext('2d')!;
  c.scale(4, 4);
  const cx = 17;
  // root flare
  c.fillStyle = '#4a3826';
  c.beginPath();
  c.moveTo(cx - 12, 26);
  c.quadraticCurveTo(cx - 6, 18, cx - 7, 12);
  c.lineTo(cx + 7, 12);
  c.quadraticCurveTo(cx + 6, 18, cx + 12, 26);
  c.quadraticCurveTo(cx, 30, cx - 12, 26);
  c.fill();
  c.fillStyle = '#3a2c1c';
  for (let i = 0; i < 4; i++) {
    const x = cx - 9 + i * 6 + r() * 2;
    c.beginPath();
    c.moveTo(x, 20);
    c.quadraticCurveTo(x + 1, 24, x - 1 + r() * 3, 27);
    c.lineTo(x + 3, 27);
    c.quadraticCurveTo(x + 3, 23, x + 3, 20);
    c.fill();
  }
  // cut face with rings
  const face = c.createRadialGradient(cx, 10, 1, cx, 10, 9);
  face.addColorStop(0, '#c9a878');
  face.addColorStop(1, '#a9885c');
  c.fillStyle = face;
  c.beginPath();
  c.ellipse(cx, 10, 8.5, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#8a6a44';
  c.lineWidth = 0.8;
  for (let ring = 2; ring < 8; ring += 2) {
    c.beginPath();
    c.ellipse(cx + (r() - 0.5), 10 + (r() - 0.5) * 0.6, ring, ring * 0.55, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.strokeStyle = '#5c4830';
  c.lineWidth = 1.2;
  c.beginPath();
  c.ellipse(cx, 10, 8.5, 5, 0, 0, Math.PI * 2);
  c.stroke();
  return cv;
}

/** shared soft-blade painter: curved blades with a dark-root → lit-tip gradient */
function paintGrassBlades(
  c: CanvasRenderingContext2D,
  base: string,
  r: () => number,
  width: number,
  height: number,
  blades: number,
  maxH: number,
): void {
  const grad = c.createLinearGradient(0, height, 0, 0);
  grad.addColorStop(0, shade(base, -18));
  grad.addColorStop(0.55, shade(base, 14));
  grad.addColorStop(1, shade(base, 40));
  c.strokeStyle = grad;
  c.lineCap = 'round';
  for (let i = 0; i < blades; i++) {
    const x = 2 + r() * (width - 4);
    const h = maxH * (0.55 + r() * 0.45);
    const lean = (r() - 0.5) * 7;
    c.lineWidth = 1.2 + r() * 1.1;
    c.beginPath();
    c.moveTo(x, height);
    c.quadraticCurveTo(x + lean * 0.4, height - h * 0.6, x + lean, height - h);
    c.stroke();
  }
}

/** Small clump of wind-blown grass blades, tinted from the land's floor color.
 * Authored at NATURE_ART_SCALE (logical 10x9). */
export function grassTuftSprite(base: string, seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = 40;
  cv.height = 36;
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  paintGrassBlades(c, base, r, 20, 18, 7 + ((r() * 4) | 0), 15);
  return cv;
}

/** Tall meadow grass for lush patches (logical 14x13, authored 2x). */
export function tallGrassSprite(base: string, seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = 56;
  cv.height = 52;
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  paintGrassBlades(c, base, r, 28, 26, 12 + ((r() * 5) | 0), 23);
  // drooping seed heads on a few stalks
  c.fillStyle = shade(base, 44);
  for (let i = 0; i < 4; i++) {
    if (r() < 0.7) {
      c.beginPath();
      c.ellipse(3 + r() * 22, 3 + r() * 5, 1.4, 2.6, (r() - 0.5) * 0.8, 0, Math.PI * 2);
      c.fill();
    }
  }
  return cv;
}

/** A wildflower with real petals around a bright center (logical 6x8, 2x art). */
export function flowerSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = 24;
  cv.height = 32;
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  // curved stem with a tiny leaf
  c.strokeStyle = '#2f5a2a';
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(6, 16);
  c.quadraticCurveTo(5 + r() * 2, 10, 6, 6);
  c.stroke();
  c.beginPath();
  c.moveTo(6, 12);
  c.quadraticCurveTo(9, 11, 10, 12.5);
  c.stroke();
  const heads = ['#f2cf4e', '#f2cf4e', '#efe9da', '#df84a4', '#e8924e'];
  const head = heads[(r() * heads.length) | 0];
  // five petals around a warm center
  c.fillStyle = head;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.3;
    c.beginPath();
    c.ellipse(6 + Math.cos(a) * 2.6, 5 + Math.sin(a) * 2.6, 2.1, 1.5, a, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#e8b93a';
  c.beginPath();
  c.arc(6, 5, 1.6, 0, Math.PI * 2);
  c.fill();
  return cv;
}

/** A couple of rounded stones with soft shading (logical 8x5, 2x art). */
export function pebbleSprite(base: string, seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 20;
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  for (let i = 0; i < 2 + ((r() * 2) | 0); i++) {
    const x = 3 + r() * 10;
    const y = 4 + r() * 4;
    const radius = 1.6 + r() * 1.8;
    const g = c.createRadialGradient(x - radius * 0.4, y - radius * 0.5, radius * 0.2, x, y, radius);
    g.addColorStop(0, shade(base, 26));
    g.addColorStop(1, shade(base, -26));
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y, radius, radius * 0.75, 0, 0, Math.PI * 2);
    c.fill();
  }
  return cv;
}

