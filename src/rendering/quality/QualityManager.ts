export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high';
export type ResolvedGraphicsQuality = 'low' | 'medium' | 'high';

const STORAGE_KEY = 'undral.graphicsQuality.v1';
const ORDER: GraphicsQuality[] = ['auto', 'low', 'medium', 'high'];

export interface GraphicsCapabilities {
  cores: number;
  memoryGb: number;
  touchPoints: number;
  viewportWidth: number;
  viewportHeight: number;
}

function browserCapabilities(): GraphicsCapabilities {
  const browserNavigator = typeof navigator === 'undefined' ? undefined : navigator;
  const browserWindow = typeof window === 'undefined' ? undefined : window;
  return {
    cores: browserNavigator?.hardwareConcurrency || 4,
    memoryGb: (browserNavigator as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory ?? 4,
    touchPoints: browserNavigator?.maxTouchPoints ?? 0,
    viewportWidth: browserWindow?.innerWidth || 1280,
    viewportHeight: browserWindow?.innerHeight || 720,
  };
}

export function isLikelyMobileDevice(capabilities = browserCapabilities()): boolean {
  const shortSide = Math.min(capabilities.viewportWidth, capabilities.viewportHeight);
  return capabilities.touchPoints > 0 && shortSide <= 900;
}

export function getGraphicsQuality(): GraphicsQuality {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as GraphicsQuality | null;
    return value && ORDER.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function setGraphicsQuality(value: GraphicsQuality): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private browsing/storage denial should not block rendering.
  }
  window.dispatchEvent(new CustomEvent('undral:graphics-quality', { detail: value }));
}

export function cycleGraphicsQuality(): GraphicsQuality {
  const current = getGraphicsQuality();
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  setGraphicsQuality(next);
  return next;
}

export function resolveGraphicsQuality(
  value = getGraphicsQuality(),
  capabilities?: GraphicsCapabilities,
): ResolvedGraphicsQuality {
  if (value !== 'auto') return value;
  const resolvedCapabilities = capabilities ?? browserCapabilities();
  const mobile = isLikelyMobileDevice(resolvedCapabilities);
  if (resolvedCapabilities.cores <= 4 || resolvedCapabilities.memoryGb <= 3) return 'low';
  if (mobile) return resolvedCapabilities.cores >= 8 && resolvedCapabilities.memoryGb >= 6 ? 'medium' : 'low';
  if (resolvedCapabilities.cores >= 8 && resolvedCapabilities.memoryGb >= 6) return 'high';
  return 'medium';
}

export function qualityNumber(value = resolveGraphicsQuality()): 0 | 1 | 2 {
  return value === 'low' ? 0 : value === 'medium' ? 1 : 2;
}

export function qualityLabel(value = getGraphicsQuality()): string {
  return value === 'auto' ? 'AUTO' : value.toUpperCase();
}

/**
 * Conservative dynamic-resolution controller for AUTO quality. It reacts only
 * after sustained slow/fast frame windows, preventing visible resolution
 * pumping during occasional GC or network spikes.
 */
export class AdaptiveResolutionGovernor {
  private readonly scales = [1, 0.85, 0.7] as const;
  private scaleIndex = 0;
  private emaMs = 16.67;
  private slowFrames = 0;
  private fastFrames = 0;
  private cooldownFrames = 0;

  get scale(): number { return this.scales[this.scaleIndex]; }

  reset(): void {
    this.scaleIndex = 0;
    this.emaMs = 16.67;
    this.slowFrames = 0;
    this.fastFrames = 0;
    this.cooldownFrames = 0;
  }

  sample(frameMs: number): number | null {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return null;
    this.emaMs += (frameMs - this.emaMs) * 0.06;
    if (this.cooldownFrames > 0) {
      this.cooldownFrames -= 1;
      return null;
    }

    if (this.emaMs > 20.5) {
      this.slowFrames += 1;
      this.fastFrames = 0;
    } else if (this.emaMs < 14.8) {
      this.fastFrames += 1;
      this.slowFrames = 0;
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.fastFrames = Math.max(0, this.fastFrames - 1);
    }

    if (this.slowFrames >= 75 && this.scaleIndex < this.scales.length - 1) {
      this.scaleIndex += 1;
      this.slowFrames = 0;
      this.cooldownFrames = 180;
      return this.scale;
    }
    if (this.fastFrames >= 300 && this.scaleIndex > 0) {
      this.scaleIndex -= 1;
      this.fastFrames = 0;
      this.cooldownFrames = 240;
      return this.scale;
    }
    return null;
  }
}
