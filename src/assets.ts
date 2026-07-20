// External asset support, two tiers (highest wins):
//
// 1. public/assets/manifest.json deployed next to the build:
//       { "images": { "statue": "my-statue.png" } }
//    This is OWNER-ONLY: assets ship with the deployment (the server side
//    of the game), so only whoever deploys the game can change its art.
//    The old tier above this — an in-game CUSTOM ASSETS upload panel that
//    let any player override sprites via localStorage — was REMOVED per an
//    explicit owner request; don't reintroduce a player-facing upload path
//    unless explicitly asked.
// 2. Built-in pack defaults (packAssets.ts) — base64-embedded tiles that
//    replace the procedural placeholder for a handful of slots (currently
//    the ruin walls and a few props), baked into the JS bundle so they
//    show up even in the single-file Artifact build with no network fetch.
//    Two sub-tiers add animation: PACK_MONSTER_FRAMES (a 4-frame idle for
//    an enemy kind) and PACK_PLAYER_FRAMES (idle + 6-frame walk per facing
//    for the player). A manifest entry for 'bug'/'wallworm'/'player' is a
//    single static frame and overrides the whole animation.
//
// Animals/pet walk cycles: a manifest entry for '<key>.walk' (cow.walk,
// chicken.walk, pet.walk) is one horizontal strip of equal-width frames,
// sliced at load time by getWalkFrames() below.
//
// Anything missing falls back to the procedural art in sprites.ts. Sprites
// are drawn feet-at-bottom, horizontally centered, 1 image pixel = 1 world
// pixel (one tile is TILE px, see config.ts). Weapon sprites point blade-up
// with the hilt at the bottom.
import { PACK_IMAGES, PACK_MONSTER_FRAMES, PACK_PLAYER_FRAMES } from './packAssets';

export type Drawable = HTMLCanvasElement | HTMLImageElement;

export interface PlayerFrameSet {
  idle: HTMLImageElement;
  walk: HTMLImageElement[];
}

export class Assets {
  private images = new Map<string, HTMLImageElement>(); // pack defaults, overlaid by manifest.json
  private monsterFrames = new Map<string, HTMLImageElement[]>(); // built-in animated pack defaults
  private playerFrameSets = new Map<'down' | 'up' | 'side', PlayerFrameSet>();
  private walkFrameCache = new Map<string, Drawable[]>();

  async load(): Promise<void> {
    await this.loadPackDefaults();
    await this.loadManifest();
  }

  private async loadPackDefaults(): Promise<void> {
    await Promise.all(
      Object.entries(PACK_IMAGES).map(async ([name, dataUrl]) => {
        const img = new Image();
        img.src = dataUrl;
        try {
          await img.decode();
          this.images.set(name, img);
        } catch {
          console.warn(`[assets] failed to decode built-in pack image "${name}"`);
        }
      }),
    );
    await Promise.all(
      Object.entries(PACK_MONSTER_FRAMES).map(async ([name, dataUrls]) => {
        const imgs: HTMLImageElement[] = [];
        for (const dataUrl of dataUrls) {
          const img = new Image();
          img.src = dataUrl;
          try {
            await img.decode();
            imgs.push(img);
          } catch {
            console.warn(`[assets] failed to decode a built-in animation frame for "${name}"`);
          }
        }
        if (imgs.length) this.monsterFrames.set(name, imgs);
      }),
    );
    await Promise.all(
      (Object.entries(PACK_PLAYER_FRAMES) as ['down' | 'up' | 'side', { idle: string; walk: string[] }][]).map(
        async ([dir, data]) => {
          const decode = async (src: string) => {
            const img = new Image();
            img.src = src;
            await img.decode();
            return img;
          };
          try {
            const idle = await decode(data.idle);
            const walk = await Promise.all(data.walk.map(decode));
            this.playerFrameSets.set(dir, { idle, walk });
          } catch {
            console.warn(`[assets] failed to decode built-in player frames for "${dir}"`);
          }
        },
      ),
    );
  }

  private async loadManifest(): Promise<void> {
    let manifest: { images?: Record<string, string> };
    try {
      const res = await fetch('assets/manifest.json');
      if (!res.ok) return;
      manifest = await res.json();
    } catch {
      return; // no manifest — fine, pack defaults (if any) still apply
    }
    const entries = Object.entries(manifest.images ?? {});
    await Promise.all(
      entries.map(async ([name, path]) => {
        const img = new Image();
        img.src = 'assets/' + path;
        try {
          await img.decode();
          this.images.set(name, img); // a manifest entry overrides a same-named pack default
        } catch {
          console.warn(`[assets] failed to load "${name}" from assets/${path}`);
        }
      }),
    );
  }

  /** override if present, otherwise the given fallback */
  pick(name: string, fallback: Drawable): Drawable {
    return this.images.get(name) ?? fallback;
  }

  /** override only — undefined when no manifest/pack image exists */
  get(name: string): Drawable | undefined {
    return this.images.get(name);
  }

  /** built-in animated pack default for an enemy kind, if the pack shipped one */
  getMonsterFrames(name: string): Drawable[] | undefined {
    return this.monsterFrames.get(name);
  }

  /** built-in animated pack default for the player's given facing, if the pack shipped one */
  getPlayerFrameSet(dir: 'down' | 'up' | 'side'): PlayerFrameSet | undefined {
    return this.playerFrameSets.get(dir);
  }

  /**
   * A manifest entry for `${key}.walk` is one horizontal strip with
   * `frameCount` equal-width frames (e.g. a 4-frame walk cycle) — sliced and
   * cached here. Undefined when no such entry exists, so callers fall back
   * to a static sprite.
   */
  getWalkFrames(key: string, frameCount: number): Drawable[] | undefined {
    const sheet = this.images.get(`${key}.walk`);
    if (!sheet) return undefined;
    const cacheKey = `${key}:${frameCount}`;
    const cached = this.walkFrameCache.get(cacheKey);
    if (cached) return cached;
    const frameW = Math.floor(sheet.width / frameCount);
    const frames: Drawable[] = [];
    for (let i = 0; i < frameCount; i++) {
      const cv = document.createElement('canvas');
      cv.width = frameW;
      cv.height = sheet.height;
      cv.getContext('2d')!.drawImage(sheet, i * frameW, 0, frameW, sheet.height, 0, 0, frameW, sheet.height);
      frames.push(cv);
    }
    this.walkFrameCache.set(cacheKey, frames);
    return frames;
  }
}
