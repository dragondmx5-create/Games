// Shared sprite primitives: pixel-map rasterizer, seeded RNG, tint and shade.
// Imported by every sprites/* module.
export function px(map: string[], pal: Record<string, string>): HTMLCanvasElement {
  const h = map.length;
  const w = map[0].length;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      if (ch === '.' || ch === ' ') continue;
      c.fillStyle = pal[ch] ?? '#f0f';
      c.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

export function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** bake a color-tinted copy (used for per-layer enemy variants) */
export function tintSprite(src: HTMLCanvasElement | HTMLImageElement, color: string, alpha: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const c = cv.getContext('2d')!;
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}
