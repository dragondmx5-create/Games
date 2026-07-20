export type EncodedNormalRgb = readonly [number, number, number];

function encodeUnitComponent(value: number): number {
  return Math.round((value * 0.5 + 0.5) * 255);
}

/**
 * Encode a procedural water slope as an OpenGL tangent-space normal.
 * Tangent X maps to red, tangent Y maps to green, and the surface-facing Z
 * component maps to blue. A flat sample therefore encodes to (128,128,255).
 */
export function encodeWaterNormalSample(dx: number, dy: number, up = 1.8): EncodedNormalRgb {
  const length = Math.hypot(dx, dy, up) || 1;
  return [
    encodeUnitComponent(-dx / length),
    encodeUnitComponent(-dy / length),
    encodeUnitComponent(up / length),
  ];
}
