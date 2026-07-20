import { rng, shade } from './core';
import type { Drawable } from '../assets';

// ---------------------------------------------------------------- tilesets

export interface LayerPalette {
  floor: string;
  floorAlt: string;
  accent: string; // moss / veins / scorch
  wallTop: string;
  wallTopDark: string;
  wallFace: string;
  wallFaceDark: string;
}

// the farm+town hub's ground — same procedural floor-tile generator as the
// cave palettes below (grain/pebbles/moss-patch/crack/worn-slab/speckle),
// just fed green tones so it reads as grass instead of dirt. wallTop/
// wallFace are used for the map-border "hedge" the hub is walled in by.
export const GRASS_PALETTE: LayerPalette = {
  // brighter, more saturated meadow greens (matched to the lush pixel-forest
  // reference art): sunlit yellow-green turf, deep cool canopy hedge
  floor: '#529c37', floorAlt: '#5ba83e', accent: '#c0e069',
  wallTop: '#27541d', wallTopDark: '#1a3d13', wallFace: '#5a4530', wallFaceDark: '#3f321f',
};

// Open-air biome tones now (the whole world is above-ground and lit — see
// render.ts renderLighting) — walls read as tree-line/hedge, not cave rock,
// using the same wallTop/wallFace fields as before. Layer names/progression
// unchanged, just reinterpreted as outdoor biomes instead of cave depths.
export const LAYER_PALETTES: LayerPalette[] = [
  // 1 Ashveil — sunlit meadow, lush saturated green
  { floor: '#559b39', floorAlt: '#5ea63f', accent: '#bcdf64', wallTop: '#28551e', wallTopDark: '#1b3e14', wallFace: '#5c4a30', wallFaceDark: '#40331f' },
  // 2 Irondeep — cool highland grass
  { floor: '#3f6a52', floorAlt: '#477256', accent: '#6fa0a3', wallTop: '#243d33', wallTopDark: '#1a2c26', wallFace: '#4a5f56', wallFaceDark: '#33443d' },
  // 3 The Rot — mossy swamp field
  { floor: '#4c6b2e', floorAlt: '#557332', accent: '#8a6a9a', wallTop: '#2d3f1c', wallTopDark: '#202d14', wallFace: '#4a5636', wallFaceDark: '#333d26' },
  // 4 Emberscar — scorched autumn field
  { floor: '#7a6a2e', floorAlt: '#836f33', accent: '#c06a3a', wallTop: '#4a3a1d', wallTopDark: '#342815', wallFace: '#6b4a30', wallFaceDark: '#4a3320' },
  // 5 The Hollow — twilight meadow
  { floor: '#4a4a6e', floorAlt: '#525277', accent: '#9a86c2', wallTop: '#2a2a42', wallTopDark: '#1e1e30', wallFace: '#453f5c', wallFaceDark: '#302c41' },
];

export interface TileSet {
  // Drawable (not just HTMLCanvasElement) because the renderer can replace
  // every variant with a single owner-supplied floor texture
  floors: Drawable[]; // variants 6/7/8 are dirt road, stone road, and resource trail
  // wall fields are Drawable (not just HTMLCanvasElement) because the
  // renderer swaps in an owner-supplied PNG here when one exists
  wallTops: Drawable[]; // 2 variants
  wallFace: Drawable;
  brickTop: Drawable;
  brickFace: Drawable;
  brickFaceCrumbled: Drawable;
  water: HTMLCanvasElement[]; // 3 frames
  entrance: HTMLCanvasElement;
  exit: HTMLCanvasElement;
  farmland: Drawable; // asset-overridable, unlike entrance/exit which stay procedural
  /** bare-ground materials [dry soil A/B, dark earth A/B] for organic patches */
  dirt: HTMLCanvasElement[];
  /** ragged grass fringes drawn over dirt edges facing grass: [N, S, E, W] */
  fringes: HTMLCanvasElement[];
}


/**
 * Ground/wall tile art is authored at this multiple of the logical tile size
 * and drawn back down at draw time. With the supersampled backbuffer it maps
 * (nearly) 1:1 to physical pixels — smooth painterly terrain, not 1990 chunk.
 */
export const TILE_ART_SCALE = 4;

export function buildTileSet(T: number, wallH: number, pal: LayerPalette, seed: number): TileSet {
  const r = rng(seed);
  const A = TILE_ART_SCALE;
  const S = T * A; // painted tile size
  const FH = wallH * A; // painted wall-face height

  const mkCanvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return [cv, cv.getContext('2d')!];
  };
  /** soft radial tone blob — the core primitive of the painterly ground */
  const blob = (c: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) => {
    const g = c.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = alpha;
    c.fillStyle = g;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    c.globalAlpha = 1;
  };

  /** dense turf: hundreds of short strands so the ground reads as real grass,
   * never a flat color wash — modelled on the owner's reference art */
  const paintTurf = (c: CanvasRenderingContext2D, base: string) => {
    c.fillStyle = shade(base, -6);
    c.fillRect(0, 0, S, S);
    // large soft light/dark mottling so the meadow reads patchy and sunlit,
    // never one flat wash (key trait of the reference forest art)
    for (let i = 0; i < 6; i++) {
      blob(c, r() * S, r() * S, 14 + r() * 18, shade(base, r() < 0.5 ? 14 : -16), 0.3);
    }
    c.lineCap = 'round';
    for (let i = 0; i < 300; i++) {
      const x = r() * S;
      const y = r() * S;
      const len = 2 + r() * 3.5;
      const lean = (r() - 0.5) * 2.2;
      const tone = r();
      c.strokeStyle = tone < 0.42 ? shade(base, -16 + ((r() * 10) | 0))
        : tone < 0.82 ? shade(base, 4 + ((r() * 10) | 0))
        : shade(base, 22 + ((r() * 14) | 0));
      c.lineWidth = 0.9 + r() * 0.5;
      c.globalAlpha = 0.75 + r() * 0.25;
      c.beginPath();
      c.moveTo(x, y + len);
      c.quadraticCurveTo(x + lean * 0.5, y + len * 0.4, x + lean, y);
      c.stroke();
    }
    // chunky pixel speckles — tiny bright blade-tips and dark pits scattered
    // across the turf, the "dithered" sparkle the reference grass has
    for (let i = 0; i < 46; i++) {
      const px = (r() * S) | 0;
      const py = (r() * S) | 0;
      const t = r();
      c.fillStyle = t < 0.3 ? shade(base, -26)
        : t < 0.78 ? shade(base, 30 + ((r() * 14) | 0))
        : shade(base, 48);
      c.globalAlpha = 0.55 + r() * 0.4;
      const sz = 1.4 + r() * 1.4;
      c.fillRect(px, py, sz, sz);
    }
    c.globalAlpha = 1;
  };

  // ---- floors: 6 dense-turf variants ----
  const floors: HTMLCanvasElement[] = [];
  for (let v = 0; v < 6; v++) {
    const [cv, c] = mkCanvas(S, S);
    const base = v % 2 === 0 ? pal.floor : pal.floorAlt;
    paintTurf(c, base);
    if (v === 1) {
      // half-buried pebbles with soft shading
      for (let i = 0; i < 4; i++) {
        const x = 6 + r() * (S - 12);
        const y = 6 + r() * (S - 12);
        const radius = 2 + r() * 2.4;
        const g = c.createRadialGradient(x - radius * 0.4, y - radius * 0.5, radius * 0.2, x, y, radius);
        g.addColorStop(0, shade(base, 24));
        g.addColorStop(1, shade(base, -20));
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(x, y, radius, radius * 0.75, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (v === 2) {
      // moss / accent patch
      blob(c, 14 + r() * 30, 14 + r() * 30, 12 + r() * 8, pal.accent, 0.4);
      blob(c, 14 + r() * 30, 14 + r() * 30, 6 + r() * 5, pal.accent, 0.32);
      c.fillStyle = pal.accent;
      for (let i = 0; i < 6; i++) {
        c.globalAlpha = 0.3 + r() * 0.4;
        c.beginPath();
        c.arc(8 + r() * (S - 16), 8 + r() * (S - 16), 0.8 + r(), 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    if (v === 3) {
      // trampled darker patch with a few flattened blades
      blob(c, S * 0.5, S * 0.55, S * 0.3, shade(base, -14), 0.4);
      c.strokeStyle = shade(base, -8);
      c.lineWidth = 1.2;
      c.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const x = 12 + r() * (S - 24);
        const y = 16 + r() * (S - 28);
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + 4, y - 2, x + 8 + r() * 4, y - 1);
        c.stroke();
      }
    }
    if (v === 4) {
      // sun-bleached lighter patch, soft-edged
      blob(c, S * 0.45 + r() * 8, S * 0.45 + r() * 8, S * 0.34, shade(base, 14), 0.45);
      blob(c, S * 0.55, S * 0.5, S * 0.2, shade(base, 20), 0.3);
    }
    if (v === 5) {
      // accent sparkle cluster (spores / embers / frost by land)
      for (let i = 0; i < 8; i++) {
        blob(c, 8 + r() * (S - 16), 8 + r() * (S - 16), 1.6 + r() * 2, pal.accent, 0.5 + r() * 0.4);
      }
    }
    floors.push(cv);
  }

  // ---- 7th floor variant: packed dirt road (PATH_FLOOR_VARIANT = 6) ----
  {
    const [cv, c] = mkCanvas(S, S);
    // dirt tone derived from the land's wall-face brown so roads sit
    // naturally in every biome palette
    const dirt = shade(pal.wallFace, 34);
    c.fillStyle = dirt;
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 5; i++) {
      blob(c, r() * S, r() * S, 9 + r() * 15, shade(pal.wallFace, r() < 0.5 ? 46 : 22), 0.22);
    }
    for (let i = 0; i < 70; i++) {
      c.fillStyle = r() < 0.5 ? shade(pal.wallFace, 48) : shade(pal.wallFace, 24);
      c.globalAlpha = 0.4 + r() * 0.4;
      c.fillRect(r() * S, r() * S, 1 + r() * 1.5, 1);
    }
    c.globalAlpha = 1;
    // faint broken wheel-ruts — soft dashes, never plank stripes
    c.strokeStyle = shade(pal.wallFace, 20);
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    c.globalAlpha = 0.4;
    for (let x = 2; x < S; x += 14) {
      if (r() < 0.6) {
        c.beginPath();
        c.moveTo(x, S * 0.28 + r() * 3);
        c.lineTo(x + 7 + r() * 4, S * 0.28 + r() * 3);
        c.stroke();
      }
      if (r() < 0.6) {
        c.beginPath();
        c.moveTo(x + 4, S * 0.68 + r() * 3);
        c.lineTo(x + 11 + r() * 4, S * 0.68 + r() * 3);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    // embedded stones with soft shading
    for (let i = 0; i < 5; i++) {
      const x = 5 + r() * (S - 10);
      const y = 5 + r() * (S - 10);
      const radius = 1.6 + r() * 2;
      const g = c.createRadialGradient(x - radius * 0.4, y - radius * 0.5, radius * 0.2, x, y, radius);
      g.addColorStop(0, shade(pal.wallFace, 56));
      g.addColorStop(1, shade(pal.wallFace, 6));
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, y, radius, radius * 0.75, 0, 0, Math.PI * 2);
      c.fill();
    }
    // grass wisps creeping in from the edges
    c.strokeStyle = pal.floor;
    c.lineWidth = 1.2;
    c.globalAlpha = 0.55;
    for (let i = 0; i < 7; i++) {
      const edge = (r() * 4) | 0;
      const along = r() * S;
      const x = edge === 0 ? 1 : edge === 1 ? S - 1 : along;
      const y = edge === 2 ? 1 : edge === 3 ? S - 1 : along;
      const dx = edge === 0 ? 3 : edge === 1 ? -3 : (r() - 0.5) * 3;
      const dy = edge === 2 ? 3 : edge === 3 ? -3 : (r() - 0.5) * 3;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + dx * 0.7, y + dy * 0.7, x + dx, y + dy);
      c.stroke();
    }
    c.globalAlpha = 1;
    floors.push(cv);
  }

  // ---- 8th floor variant: fitted stone trade road ----
  {
    const [cv, c] = mkCanvas(S, S);
    c.fillStyle = shade(pal.wallTop, 38);
    c.fillRect(0, 0, S, S);
    const rows = 5;
    const cellH = S / rows;
    c.lineWidth = 1.2;
    for (let row = 0; row < rows; row++) {
      const y = row * cellH;
      const offset = row % 2 === 0 ? -S / 10 : 0;
      for (let x = offset; x < S; x += S / 5) {
        c.fillStyle = shade(pal.wallTop, 26 + ((row + Math.round(x)) % 3) * 7);
        c.fillRect(x + 1, y + 1, S / 5 - 2, cellH - 2);
      }
    }
    c.strokeStyle = shade(pal.wallTopDark, 4);
    c.globalAlpha = 0.7;
    for (let row = 0; row <= rows; row++) {
      c.beginPath(); c.moveTo(0, row * cellH); c.lineTo(S, row * cellH); c.stroke();
    }
    c.globalAlpha = 1;
    floors.push(cv);
  }

  // ---- 9th floor variant: narrow resource trail ----
  {
    const [cv, c] = mkCanvas(S, S);
    const trail = shade(pal.wallFace, 20);
    c.fillStyle = trail;
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 56; i++) {
      c.fillStyle = i % 2 === 0 ? shade(trail, 14) : shade(trail, -10);
      c.globalAlpha = 0.25 + r() * 0.35;
      c.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r());
    }
    c.globalAlpha = 1;
    c.strokeStyle = shade(trail, -18);
    c.lineWidth = 1.5;
    c.globalAlpha = 0.35;
    for (let i = 0; i < 8; i++) {
      const x = r() * S;
      const y = r() * S;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 2 + r() * 3, y + r() * 2 - 1); c.stroke();
    }
    c.globalAlpha = 1;
    floors.push(cv);
  }

  // ---- wall tops: foliage canopy (the outdoor world's treeline border) ----
  const mkTop = (base: string, dark: string) => {
    const [cv, c] = mkCanvas(S, S);
    c.fillStyle = dark;
    c.fillRect(0, 0, S, S);
    // layered leaf clumps, lighter toward the top-left sun
    for (let i = 0; i < 12; i++) {
      blob(c, r() * S, r() * S, 8 + r() * 12, base, 0.8);
    }
    for (let i = 0; i < 6; i++) {
      blob(c, r() * S * 0.8, r() * S * 0.8, 5 + r() * 7, shade(base, 18), 0.7);
    }
    // leaf texture arcs
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 1.1;
    for (let i = 0; i < 14; i++) {
      c.beginPath();
      c.arc(r() * S, r() * S, 2 + r() * 3, Math.PI * r(), Math.PI * (1 + r()));
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 8; i++) {
      c.beginPath();
      c.arc(r() * S, r() * S * 0.7, 2 + r() * 2.5, Math.PI, Math.PI * 1.8);
      c.stroke();
    }
    // bottom edge falls into shadow before the face
    const edgeGrad = c.createLinearGradient(0, S - 12, 0, S);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, 'rgba(0,0,0,0.34)');
    c.fillStyle = edgeGrad;
    c.fillRect(0, S - 12, S, 12);
    return cv;
  };
  const wallTops = [mkTop(pal.wallTop, pal.wallTopDark), mkTop(pal.wallTop, pal.wallTopDark)];

  // masonry cap for brick structures — big flat slabs with mortar seams
  const brickTop = (() => {
    const [cv, c] = mkCanvas(S, S);
    const cap = shade(pal.wallTop, 12);
    c.fillStyle = cap;
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) blob(c, r() * S, r() * S, 10 + r() * 12, shade(cap, r() < 0.5 ? 12 : -12), 0.2);
    c.strokeStyle = pal.wallTopDark;
    c.lineWidth = 2;
    for (let y = S / 2; y < S; y += S) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(S, y);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(S / 2, 0);
    c.lineTo(S / 2, S / 2);
    c.moveTo(S / 4, S / 2);
    c.lineTo(S / 4, S);
    c.moveTo((S * 3) / 4, S / 2);
    c.lineTo((S * 3) / 4, S);
    c.stroke();
    c.strokeStyle = shade(cap, 20);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, 1);
    c.lineTo(S, 1);
    c.stroke();
    return cv;
  })();

  // ---- earthen face beneath the treeline: gradient, strata, hanging roots ----
  const wallFace = (() => {
    const [cv, c] = mkCanvas(S, FH);
    const faceGrad = c.createLinearGradient(0, 0, 0, FH);
    faceGrad.addColorStop(0, shade(pal.wallFace, 10));
    faceGrad.addColorStop(1, pal.wallFaceDark);
    c.fillStyle = faceGrad;
    c.fillRect(0, 0, S, FH);
    // wavy strata
    c.lineWidth = 1.4;
    for (let band = 1; band < 5; band++) {
      const y = (FH / 5) * band;
      c.strokeStyle = shade(pal.wallFace, -14 - band * 3);
      c.globalAlpha = 0.5;
      c.beginPath();
      c.moveTo(0, y + r() * 3);
      c.quadraticCurveTo(S * 0.33, y + (r() - 0.5) * 5, S * 0.66, y + (r() - 0.5) * 5);
      c.quadraticCurveTo(S * 0.85, y + (r() - 0.5) * 5, S, y + r() * 3);
      c.stroke();
    }
    c.globalAlpha = 1;
    // embedded stones
    for (let i = 0; i < 5; i++) {
      const x = 5 + r() * (S - 10);
      const y = 8 + r() * (FH - 16);
      blob(c, x, y, 3 + r() * 3, shade(pal.wallFace, 18), 0.65);
    }
    // roots/vines hanging from the foliage above
    c.strokeStyle = shade(pal.wallTop, -6);
    c.lineWidth = 1.5;
    c.globalAlpha = 0.7;
    for (let i = 0; i < 6; i++) {
      const x = 4 + r() * (S - 8);
      const len = 8 + r() * 16;
      c.beginPath();
      c.moveTo(x, 0);
      c.quadraticCurveTo(x + (r() - 0.5) * 6, len * 0.6, x + (r() - 0.5) * 8, len);
      c.stroke();
    }
    c.globalAlpha = 1;
    // canopy shadow at the top, ground contact shadow at the bottom
    const topShadow = c.createLinearGradient(0, 0, 0, 14);
    topShadow.addColorStop(0, 'rgba(0,0,0,0.4)');
    topShadow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = topShadow;
    c.fillRect(0, 0, S, 14);
    const botShadow = c.createLinearGradient(0, FH - 10, 0, FH);
    botShadow.addColorStop(0, 'rgba(0,0,0,0)');
    botShadow.addColorStop(1, 'rgba(0,0,0,0.38)');
    c.fillStyle = botShadow;
    c.fillRect(0, FH - 10, S, 10);
    return cv;
  })();

  // ---- brick faces: mortar courses with per-brick tone, clean + crumbled ----
  const mkBrickFace = (crumbled: boolean) => {
    const [cv, c] = mkCanvas(S, FH);
    const brick = shade(pal.wallFace, 6);
    const mortar = pal.wallFaceDark;
    c.fillStyle = mortar;
    c.fillRect(0, 0, S, FH);
    const rows = 4;
    const bh = FH / rows;
    const bw = S / 2;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 === 0 ? 0 : bw / 2;
      for (let x = -bw; x < S + bw; x += bw) {
        const bx = x + off;
        const tone = shade(brick, (r() - 0.5) * 24);
        const g = c.createLinearGradient(bx, row * bh, bx, row * bh + bh);
        g.addColorStop(0, shade(tone, 10));
        g.addColorStop(1, shade(tone, -8));
        c.fillStyle = g;
        c.fillRect(bx + 1.5, row * bh + 1.5, bw - 3, bh - 3);
        // subtle top-left highlight per brick
        c.fillStyle = 'rgba(255,255,255,0.10)';
        c.fillRect(bx + 1.5, row * bh + 1.5, bw - 3, 1.5);
      }
    }
    if (crumbled) {
      // a couple of missing bricks with rubble shadows
      for (let i = 0; i < 2; i++) {
        const row = (r() * rows) | 0;
        const off = row % 2 === 0 ? 0 : bw / 2;
        const bx = ((r() * 2) | 0) * bw + off;
        c.fillStyle = shade(pal.wallFaceDark, -10);
        c.fillRect(bx + 1.5, row * bh + 1.5, bw - 3, bh - 3);
        blob(c, bx + bw / 2, row * bh + bh * 0.7, 4, shade(pal.wallFace, 14), 0.7);
      }
    }
    const botShadow = c.createLinearGradient(0, FH - 8, 0, FH);
    botShadow.addColorStop(0, 'rgba(0,0,0,0)');
    botShadow.addColorStop(1, 'rgba(0,0,0,0.38)');
    c.fillStyle = botShadow;
    c.fillRect(0, FH - 8, S, 8);
    c.fillStyle = shade(brick, 18);
    c.fillRect(0, 0, S, 1.5);
    return cv;
  };
  const brickFace = mkBrickFace(false);
  const brickFaceCrumbled = mkBrickFace(true);

  // ---- water: 3 legacy animation frames (overworld water is GLSL now) ----
  const water: HTMLCanvasElement[] = [];
  for (let f = 0; f < 3; f++) {
    const [cv, c] = mkCanvas(S, S);
    c.fillStyle = '#14202c';
    c.fillRect(0, 0, S, S);
    c.strokeStyle = '#2a4a63';
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const y = ((8 + i * 18 + f * 7) % S) + 2;
      c.beginPath();
      c.moveTo(6 + r() * 10, y);
      c.quadraticCurveTo(S / 2, y - 3, S - 8 - r() * 10, y);
      c.stroke();
    }
    water.push(cv);
  }

  // ---- entrance: rope ladder into a shaft ----
  const [entrance, entranceC] = mkCanvas(S, S);
  {
    const c = entranceC;
    c.drawImage(floors[0], 0, 0);
    const inset = S / 8;
    const hole = c.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2 - inset);
    hole.addColorStop(0, '#050408');
    hole.addColorStop(1, '#1b1722');
    c.fillStyle = hole;
    c.beginPath();
    c.roundRect(inset, inset, S - inset * 2, S - inset * 2, 5);
    c.fill();
    c.strokeStyle = '#57503f';
    c.lineWidth = 2.5;
    c.beginPath();
    c.roundRect(inset - 1, inset - 1, S - inset * 2 + 2, S - inset * 2 + 2, 6);
    c.stroke();
    c.strokeStyle = '#6b5638';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(S * 0.36, inset);
    c.lineTo(S * 0.36, S - inset);
    c.moveTo(S * 0.64, inset);
    c.lineTo(S * 0.64, S - inset);
    c.stroke();
    for (let y = inset + 5; y < S - inset; y += 9) {
      c.beginPath();
      c.moveTo(S * 0.36, y);
      c.lineTo(S * 0.64, y);
      c.stroke();
    }
  }

  // ---- exit: dark hatch, warm glow from below ----
  const [exit, exitC] = mkCanvas(S, S);
  {
    const c = exitC;
    c.drawImage(floors[0], 0, 0);
    const inset = S / 8;
    c.fillStyle = '#0a090d';
    c.beginPath();
    c.roundRect(inset, inset, S - inset * 2, S - inset * 2, 5);
    c.fill();
    const glow = c.createLinearGradient(0, S - inset - 14, 0, S - inset);
    glow.addColorStop(0, 'rgba(240,165,61,0)');
    glow.addColorStop(1, 'rgba(240,165,61,0.4)');
    c.fillStyle = glow;
    c.fillRect(inset + 2, S - inset - 14, S - inset * 2 - 4, 14);
    c.strokeStyle = shade(pal.wallFace, 12);
    c.lineWidth = 2.5;
    c.beginPath();
    c.roundRect(inset - 1, inset - 1, S - inset * 2 + 2, S - inset * 2 + 2, 6);
    c.stroke();
  }

  // ---- farmland: tilled soil with soft furrow rows ----
  const [farmland, farmlandC] = mkCanvas(S, S);
  {
    const c = farmlandC;
    const soil = shade(pal.floor, -18);
    c.fillStyle = soil;
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) blob(c, r() * S, r() * S, 8 + r() * 12, shade(soil, r() < 0.5 ? 10 : -10), 0.2);
    for (let row = 0; row < 4; row++) {
      const y = row * (S / 4) + 4;
      const furrow = c.createLinearGradient(0, y, 0, y + 8);
      furrow.addColorStop(0, shade(soil, -26));
      furrow.addColorStop(1, shade(soil, -6));
      c.fillStyle = furrow;
      c.fillRect(0, y, S, 8);
      c.fillStyle = shade(soil, 12);
      c.fillRect(0, y - 1.5, S, 1.5);
    }
    for (let i = 0; i < 30; i++) {
      c.fillStyle = r() < 0.5 ? shade(soil, 10) : shade(soil, -12);
      c.globalAlpha = 0.5;
      c.fillRect(r() * S, r() * S, 1.5, 1);
    }
    c.globalAlpha = 1;
  }

  // ---- bare-ground materials: dry soil + dark earth, two variants each ----
  const mkDirt = (tone: string, stony: boolean) => {
    const [cv, c] = mkCanvas(S, S);
    c.fillStyle = tone;
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 5; i++) {
      blob(c, r() * S, r() * S, 10 + r() * 16, shade(tone, r() < 0.5 ? 12 : -12), 0.24);
    }
    // granular texture
    for (let i = 0; i < 110; i++) {
      c.fillStyle = r() < 0.5 ? shade(tone, 14) : shade(tone, -14);
      c.globalAlpha = 0.35 + r() * 0.4;
      c.beginPath();
      c.arc(r() * S, r() * S, 0.6 + r() * 0.9, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    // scattered stones like the reference dirt patch
    const stones = stony ? 5 : 2;
    for (let i = 0; i < stones; i++) {
      const x = 5 + r() * (S - 10);
      const y = 5 + r() * (S - 10);
      const radius = 1.4 + r() * 1.8;
      const g = c.createRadialGradient(x - radius * 0.4, y - radius * 0.5, radius * 0.2, x, y, radius);
      g.addColorStop(0, '#8d8d92');
      g.addColorStop(1, '#4c4c52');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, y, radius, radius * 0.75, 0, 0, Math.PI * 2);
      c.fill();
    }
    // a few dry clods
    for (let i = 0; i < 4; i++) {
      blob(c, r() * S, r() * S, 3 + r() * 3, shade(tone, -20), 0.5);
    }
    return cv;
  };
  const drySoil = shade(pal.wallFace, 46);
  const darkEarth = shade(pal.wallFace, 16);
  const dirt = [mkDirt(drySoil, true), mkDirt(drySoil, true), mkDirt(darkEarth, false), mkDirt(darkEarth, false)];

  // ---- ragged grass fringe creeping over a dirt edge (authored for the
  // north edge, rotated for the rest) ----
  const fringeN = (() => {
    const [cv, c] = mkCanvas(S, S);
    // soft green contact shadow right at the boundary
    const contact = c.createLinearGradient(0, 0, 0, 7);
    contact.addColorStop(0, 'rgba(20,40,16,0.4)');
    contact.addColorStop(1, 'rgba(20,40,16,0)');
    c.fillStyle = contact;
    c.fillRect(0, 0, S, 7);
    c.lineCap = 'round';
    // a solid ragged turf lip first, then loose strands over it — the grass
    // clearly overhangs the dirt like in the reference art
    c.fillStyle = shade(pal.floor, -6);
    c.beginPath();
    c.moveTo(0, 0);
    let lipX = 0;
    while (lipX < S) {
      const depth = 3 + (0.5 + 0.5 * Math.sin(lipX * 0.3 + 1.3)) * 7 + r() * 3;
      c.quadraticCurveTo(lipX + 2, depth + r() * 2, lipX + 4 + r() * 3, depth);
      lipX += 4 + r() * 3;
    }
    c.lineTo(S, 0);
    c.closePath();
    c.fill();
    // strand depth varies along the edge in bumps so the silhouette is ragged
    for (let i = 0; i < 150; i++) {
      const x = r() * S;
      const bump = 0.5 + 0.5 * Math.sin(x * 0.3 + r() * 1.4);
      const len = 4 + bump * 13 + r() * 5;
      const lean = (r() - 0.5) * 4;
      const tone = r();
      c.strokeStyle = tone < 0.4 ? shade(pal.floor, -12 + ((r() * 8) | 0))
        : tone < 0.85 ? shade(pal.floor, 4 + ((r() * 10) | 0))
        : shade(pal.floor, 18 + ((r() * 10) | 0));
      c.lineWidth = 0.9 + r() * 0.7;
      c.globalAlpha = 0.8 + r() * 0.2;
      c.beginPath();
      c.moveTo(x, 0);
      c.quadraticCurveTo(x + lean * 0.5, len * 0.55, x + lean, len);
      c.stroke();
    }
    c.globalAlpha = 1;
    return cv;
  })();
  const rotated = (source: HTMLCanvasElement, quarterTurns: number) => {
    const [cv, c] = mkCanvas(S, S);
    c.translate(S / 2, S / 2);
    c.rotate((Math.PI / 2) * quarterTurns);
    c.drawImage(source, -S / 2, -S / 2);
    return cv;
  };
  // order: N, S, E, W — strands root on the named edge and reach inward
  const fringes = [fringeN, rotated(fringeN, 2), rotated(fringeN, 1), rotated(fringeN, 3)];

  return { floors, wallTops, wallFace, brickTop, brickFace, brickFaceCrumbled, water, entrance, exit, farmland, dirt, fringes };
}
