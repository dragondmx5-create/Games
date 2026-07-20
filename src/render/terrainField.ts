// Deterministic terrain fields (simplex + hash noise) shared by the renderer:
// grass/soil material selection and lush-meadow patches. Pure and seed-stable.
import { createNoise2D } from 'simplex-noise';

export function hashXY(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Simplex noise (simplex-noise npm package, zero-dependency) drives the
// organic ground fields — smoother, direction-free patches than the old
// bilinear value noise. Seeded with a fixed deterministic PRNG so every
// client sees the exact same world. Output normalized to [0, 1].
const groundNoise2D = createNoise2D(mulberryForNoise(0x556e64));
function mulberryForNoise(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function smoothNoise(x: number, y: number): number {
  return groundNoise2D(x, y) * 0.5 + 0.5;
}

/** 0 = grass, 1 = dry soil, 2 = dark earth. World-anchored noise with
 * per-tile jitter: organic patches that ignore the square grid entirely. */
/** Smooth simplex field for lush tall-grass meadow patches — continuous
 * noise, not a coarse block grid, so meadow borders are organic curves. */
export function meadowAt(tx: number, ty: number): boolean {
  const jitter = (hashXY(tx * 7 + 11, ty * 5 + 3) - 0.5) * 0.1;
  const n = smoothNoise(tx * 0.05 + 211.3, ty * 0.05 + 133.7) + jitter;
  return n > 0.58;
}

export function groundMaterialAt(tx: number, ty: number): 0 | 1 | 2 {
  // low jitter: just enough to roughen patch borders without leaving
  // lonely single-tile squares
  const jitter = (hashXY(tx * 3 + 5, ty * 7 + 1) - 0.5) * 0.06;
  // thresholds tuned for simplex's center-heavy distribution — raised so bare
  // ground stays an occasional worn patch instead of blotching the whole field
  const n = smoothNoise(tx * 0.085 + 13.7, ty * 0.085 + 7.3) + jitter;
  if (n > 0.78) return 1;
  const n2 = smoothNoise(tx * 0.11 + 101.1, ty * 0.11 + 55.5) + jitter;
  if (n2 > 0.83) return 2;
  return 0;
}
