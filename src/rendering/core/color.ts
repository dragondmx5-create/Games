export type Rgba = [number, number, number, number];

const named: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  transparent: '#00000000',
};

export function parseCssColor(input: string): Rgba {
  const value = (named[input.trim().toLowerCase()] ?? input.trim()).toLowerCase();
  if (value.startsWith('#')) return parseHex(value);
  const rgba = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgba) {
    return [
      clamp255(Number(rgba[1])) / 255,
      clamp255(Number(rgba[2])) / 255,
      clamp255(Number(rgba[3])) / 255,
      clamp01(rgba[4] === undefined ? 1 : Number(rgba[4])),
    ];
  }
  // Rendering code uses a controlled palette. Magenta makes a newly-added,
  // unsupported CSS color obvious during development instead of silently black.
  return [1, 0, 1, 1];
}

export function multiplyAlpha(color: Rgba, alpha: number): Rgba {
  return [color[0], color[1], color[2], color[3] * clamp01(alpha)];
}

function parseHex(value: string): Rgba {
  const hex = value.slice(1);
  if (hex.length === 3 || hex.length === 4) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) : 255;
    return [r / 255, g / 255, b / 255, a / 255];
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    return [r / 255, g / 255, b / 255, a / 255];
  }
  return [1, 0, 1, 1];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Number.isFinite(v) ? v : 0));
}
