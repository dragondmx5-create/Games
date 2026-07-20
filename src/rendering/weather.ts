import type { ResolvedGraphicsQuality } from './quality/QualityManager';

export type AmbientWeatherKind = 'mist' | 'pollen' | 'rain' | 'snow' | 'sand' | 'ash';

export interface AmbientWeatherProfile {
  kind: AmbientWeatherKind;
  color: number;
  particlesPerSecond: number;
  fallSpeed: number;
  drift: number;
  wetness: number;
}

const LAND_WEATHER: Readonly<Record<string, Omit<AmbientWeatherProfile, 'particlesPerSecond'>>> = Object.freeze({
  witchlands: { kind: 'mist', color: 0x9bc2ae, fallSpeed: 0.05, drift: 0.42, wetness: 0.42 },
  'green-land': { kind: 'pollen', color: 0xd8df82, fallSpeed: 0.08, drift: 0.34, wetness: 0.08 },
  rainforest: { kind: 'rain', color: 0xaed4e6, fallSpeed: 3.8, drift: 0.16, wetness: 0.9 },
  frostlands: { kind: 'snow', color: 0xe9f4ff, fallSpeed: 0.72, drift: 0.48, wetness: 0.34 },
  'sunscorched-desert': { kind: 'sand', color: 0xd4aa70, fallSpeed: 0.16, drift: 1.05, wetness: 0 },
  'cinder-coast': { kind: 'ash', color: 0x8e8887, fallSpeed: 0.38, drift: 0.58, wetness: 0.24 },
});

export function ambientWeatherForLand(landId: string | undefined, quality: ResolvedGraphicsQuality): AmbientWeatherProfile | null {
  const base = landId ? LAND_WEATHER[landId] : undefined;
  if (!base) return null;
  const qualityMultiplier = quality === 'low' ? 0.28 : quality === 'medium' ? 0.62 : 1;
  const baseRate = base.kind === 'rain' ? 18 : base.kind === 'mist' ? 5 : 10;
  return { ...base, particlesPerSecond: baseRate * qualityMultiplier };
}
