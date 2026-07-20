export const WATER_EDGE_TOP = 1;
export const WATER_EDGE_BOTTOM = 2;
export const WATER_EDGE_LEFT = 4;
export const WATER_EDGE_RIGHT = 8;

export type WaterNeighbor = 'water' | 'walkable' | 'solid';

export interface WaterEdges {
  top: WaterNeighbor;
  bottom: WaterNeighbor;
  left: WaterNeighbor;
  right: WaterNeighbor;
}

/**
 * Packs only water-to-walkable boundaries. Solid neighbors intentionally do
 * not foam: this keeps shoreline foam on beaches/floors rather than drawing a
 * bright seam under walls.
 */
export function waterEdgeMask(edges: WaterEdges): number {
  let mask = 0;
  if (edges.top === 'walkable') mask |= WATER_EDGE_TOP;
  if (edges.bottom === 'walkable') mask |= WATER_EDGE_BOTTOM;
  if (edges.left === 'walkable') mask |= WATER_EDGE_LEFT;
  if (edges.right === 'walkable') mask |= WATER_EDGE_RIGHT;
  return mask;
}

export interface VisualEffectBudget {
  waterOctaves: 1 | 2 | 3;
  particleMultiplier: number;
  slashGlow: number;
  lightScattering: number;
  /** 0 disables the half-res gaussian bloom passes entirely. */
  bloomStrength: number;
  /** vegetation wind sway amplitude multiplier */
  windStrength: number;
  /** ambient nature particles (leaves, fireflies, dust) on top of the base set */
  natureParticles: boolean;
}

export function visualEffectBudget(quality: 0 | 1 | 2): VisualEffectBudget {
  if (quality === 0) {
    return {
      waterOctaves: 1, particleMultiplier: 0.45, slashGlow: 0.55, lightScattering: 0.35,
      bloomStrength: 0, windStrength: 0.55, natureParticles: false,
    };
  }
  if (quality === 1) {
    return {
      waterOctaves: 2, particleMultiplier: 0.75, slashGlow: 0.8, lightScattering: 0.7,
      bloomStrength: 0.55, windStrength: 0.85, natureParticles: true,
    };
  }
  return {
    waterOctaves: 3, particleMultiplier: 1, slashGlow: 1, lightScattering: 1,
    bloomStrength: 1, windStrength: 1, natureParticles: true,
  };
}

/**
 * Global wind field sampled per prop. Two incommensurate sine octaves plus a
 * slow gust envelope give vegetation a shared but non-uniform motion: nearby
 * trees lean together while distant ones are out of phase. Pure and
 * deterministic so it is unit-testable and identical for every client.
 * Returns a signed sway in [-1, 1].
 */
export function windSway(timeSeconds: number, worldX: number, worldY: number): number {
  const phase = worldX * 0.013 + worldY * 0.007;
  const base = Math.sin(timeSeconds * 1.35 + phase);
  const detail = Math.sin(timeSeconds * 3.1 + phase * 2.7) * 0.35;
  const gust = 0.55 + 0.45 * Math.sin(timeSeconds * 0.23 + worldX * 0.002);
  const sway = (base + detail) / 1.35 * gust;
  return Math.max(-1, Math.min(1, sway));
}

/** Stable, bounded seed suitable for a shader attribute. */
export function visualSeed(x: number, y: number): number {
  let h = (Math.trunc(x) * 374761393 + Math.trunc(y) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

export function slashProgress(swingRemaining: number, duration: number): number {
  if (!Number.isFinite(swingRemaining) || !Number.isFinite(duration) || duration <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - swingRemaining / duration));
}
