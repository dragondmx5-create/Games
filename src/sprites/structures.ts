import { rng, shade } from './core';

/**
 * A full gabled roof covering one settlement house footprint (tile bounds
 * come from the shared settlementHouses layout). Drawn over the house's
 * brick walls; the renderer fades it out when the player steps inside.
 */
export function roofSprite(wTiles: number, hTiles: number, T: number, seed: number, chimneyFrac = 0.7): HTMLCanvasElement {
  const r = rng(seed);
  const overhang = 4;
  const W = wTiles * T + overhang * 2;
  const H = hTiles * T + 6;
  const [cv, c] = houseCanvas(W, H);

  const palettes = [
    { hi: '#8a4a3a', lo: '#6b3a2e', edge: '#4a2820' }, // terracotta
    { hi: '#5a6a7e', lo: '#46525f', edge: '#303842' }, // slate
    { hi: '#8a743e', lo: '#6e5c32', edge: '#4c3f22' }, // thatch
    { hi: '#5e7a4a', lo: '#4a6139', edge: '#334527' }, // moss shingle
  ];
  const pal = palettes[(r() * palettes.length) | 0];
  const ridgeY = Math.round(H * 0.30);

  // back (north) slope — catches the sun
  c.fillStyle = pal.hi;
  c.fillRect(0, 0, W, ridgeY);
  // front (south) slope — shingle rows
  c.fillStyle = pal.lo;
  c.fillRect(0, ridgeY, W, H - ridgeY);
  const rowH = 5;
  for (let y = ridgeY; y < H; y += rowH) {
    c.fillStyle = shade(pal.lo, -14);
    c.fillRect(0, y + rowH - 1, W, 1);
    // per-row shingle ticks with a stagger
    c.fillStyle = shade(pal.lo, 8);
    const offset = ((y / rowH) | 0) % 2 === 0 ? 0 : 4;
    for (let x = offset; x < W; x += 8) {
      if (r() < 0.8) c.fillRect(x, y, 1, rowH - 1);
    }
    // occasional sun-bleached shingle
    if (r() < 0.6) {
      c.fillStyle = shade(pal.lo, 18);
      c.fillRect(((r() * (W - 6)) | 0), y + 1, 4 + ((r() * 3) | 0), rowH - 2);
    }
  }
  // back-slope plank lines
  for (let y = 3; y < ridgeY; y += 4) {
    c.fillStyle = shade(pal.hi, -10);
    c.fillRect(0, y, W, 1);
  }
  // ridge beam
  c.fillStyle = shade(pal.edge, 26);
  c.fillRect(0, ridgeY - 2, W, 3);
  c.fillStyle = pal.edge;
  c.fillRect(0, ridgeY + 1, W, 1);
  // hip lines and eaves outline
  c.strokeStyle = pal.edge;
  c.beginPath();
  c.moveTo(0.5, H - 0.5);
  c.lineTo(0.5, 0.5);
  c.lineTo(W - 0.5, 0.5);
  c.lineTo(W - 0.5, H - 0.5);
  c.stroke();
  c.fillStyle = 'rgba(0,0,0,0.30)';
  c.fillRect(0, H - 2, W, 2);

  // chimney with a mortar cap — position comes in as a fraction so the
  // renderer can emit smoke from the exact same spot
  const chimneyX = Math.max(3, Math.min(W - 10, Math.round(chimneyFrac * W) - 3));
  c.fillStyle = '#5c5c60';
  c.fillRect(chimneyX, 2, 7, 9);
  c.fillStyle = '#77777c';
  c.fillRect(chimneyX, 2, 7, 2);
  c.fillStyle = '#3c3c40';
  c.fillRect(chimneyX + 1, 0, 5, 2);
  return cv;
}

// ---- house interior furniture ------------------------------------------

/** House/prop sprites (roof, furniture, wayposts) are authored at this
 * multiple of their in-world size — crisper edges on the supersampled buffer. */
export const HOUSE_ART_SCALE = 2;

/** canvas at `w`×`h` logical size, painted through a HOUSE_ART_SCALE context */
function houseCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w * HOUSE_ART_SCALE;
  cv.height = h * HOUSE_ART_SCALE;
  const c = cv.getContext('2d')!;
  c.scale(HOUSE_ART_SCALE, HOUSE_ART_SCALE);
  return [cv, c];
}

export function bedSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const [cv, c] = houseCanvas(14, 24);
  // frame
  c.fillStyle = '#4a3826';
  c.fillRect(0, 0, 14, 24);
  c.fillStyle = '#5c4a30';
  c.fillRect(1, 1, 12, 22);
  // blanket
  const blankets = ['#7a3a4a', '#3a5a7a', '#4a6a3a', '#6a4a7a'];
  const blanket = blankets[(r() * blankets.length) | 0];
  c.fillStyle = blanket;
  c.fillRect(1, 9, 12, 13);
  c.fillStyle = shade(blanket, -18);
  c.fillRect(1, 9, 12, 2);
  c.fillStyle = shade(blanket, 14);
  for (let y = 13; y < 21; y += 3) c.fillRect(2, y, 10, 1);
  // pillow
  c.fillStyle = '#d8d2c2';
  c.fillRect(2, 2, 10, 6);
  c.fillStyle = '#b8b2a2';
  c.fillRect(2, 6, 10, 1);
  return cv;
}

export function tableSprite(): HTMLCanvasElement {
  const [cv, c] = houseCanvas(20, 16);
  // legs
  c.fillStyle = '#3a2c1c';
  c.fillRect(2, 10, 3, 6);
  c.fillRect(15, 10, 3, 6);
  // top (slightly 3/4)
  c.fillStyle = '#6a563a';
  c.fillRect(0, 2, 20, 9);
  c.fillStyle = '#7a6647';
  c.fillRect(1, 3, 18, 6);
  c.fillStyle = '#5a4830';
  c.fillRect(0, 10, 20, 1);
  // a candle
  c.fillStyle = '#d8d2b2';
  c.fillRect(9, 1, 2, 4);
  c.fillStyle = '#ffcf70';
  c.fillRect(9, 0, 2, 1);
  return cv;
}

export function chairSprite(flip: boolean): HTMLCanvasElement {
  const [cv, c] = houseCanvas(8, 12);
  c.save();
  if (flip) {
    c.translate(8, 0);
    c.scale(-1, 1);
  }
  c.fillStyle = '#4a3826';
  c.fillRect(1, 0, 2, 12); // backrest
  c.fillStyle = '#5c4a30';
  c.fillRect(1, 6, 6, 3); // seat
  c.fillStyle = '#3a2c1c';
  c.fillRect(1, 9, 2, 3);
  c.fillRect(5, 9, 2, 3);
  c.restore();
  return cv;
}

export function fireplaceSprite(): HTMLCanvasElement {
  const [cv, c] = houseCanvas(20, 22);
  // stone chimney breast
  c.fillStyle = '#6a6a70';
  c.fillRect(0, 0, 20, 22);
  c.fillStyle = '#7a7a80';
  for (let y = 0; y < 22; y += 4) {
    for (let x = (y / 4) % 2 === 0 ? 0 : 3; x < 20; x += 6) c.fillRect(x, y, 4, 3);
  }
  c.fillStyle = '#54545a';
  c.fillRect(0, 20, 20, 2);
  // hearth opening
  c.fillStyle = '#1c1410';
  c.fillRect(4, 8, 12, 12);
  // fire
  c.fillStyle = '#c2452a';
  c.fillRect(6, 13, 8, 6);
  c.fillStyle = '#e8842a';
  c.fillRect(7, 14, 6, 5);
  c.fillStyle = '#ffcf70';
  c.fillRect(9, 16, 3, 3);
  // logs
  c.fillStyle = '#3a2c1c';
  c.fillRect(5, 18, 10, 2);
  // mantel
  c.fillStyle = '#4a3826';
  c.fillRect(0, 6, 20, 2);
  return cv;
}

export function shelfSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const [cv, c] = houseCanvas(16, 16);
  c.fillStyle = '#4a3826';
  c.fillRect(0, 0, 16, 16);
  c.fillStyle = '#3a2c1c';
  c.fillRect(1, 5, 14, 1);
  c.fillRect(1, 10, 14, 1);
  // jars/books on the shelves
  const tones = ['#7a5a9a', '#5a7a4a', '#9a6a3a', '#4a6a8a', '#b8b2a2'];
  for (const y of [1, 6, 11]) {
    for (let x = 2; x < 13; x += 3 + ((r() * 2) | 0)) {
      c.fillStyle = tones[(r() * tones.length) | 0];
      c.fillRect(x, y + 1, 2, 3);
    }
  }
  return cv;
}

export function barrelSprite(): HTMLCanvasElement {
  const [cv, c] = houseCanvas(10, 12);
  c.fillStyle = '#5c4a30';
  c.fillRect(1, 1, 8, 11);
  c.fillStyle = '#6e5a3c';
  c.fillRect(2, 1, 6, 11);
  c.fillStyle = '#8a744a';
  c.fillRect(0, 3, 10, 1);
  c.fillRect(0, 8, 10, 1);
  c.fillStyle = '#4a3826';
  c.fillRect(2, 0, 6, 2);
  return cv;
}

export function rugSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const [cv, c] = houseCanvas(30, 18);
  const tones = [['#7a3a4a', '#9a5a6a'], ['#3a5a7a', '#5a7a9a'], ['#6a5a2a', '#8a7a4a']];
  const [base, trim] = tones[(r() * tones.length) | 0];
  c.fillStyle = base;
  c.fillRect(0, 0, 30, 18);
  c.fillStyle = trim;
  c.fillRect(2, 2, 26, 14);
  c.fillStyle = base;
  c.fillRect(4, 4, 22, 10);
  c.fillStyle = trim;
  c.fillRect(8, 7, 14, 4);
  return cv;
}

/** Worn welcome mat placed on the doorstep tile outside each house door. */
export function doormatSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const [cv, c] = houseCanvas(12, 6);
  c.fillStyle = '#8a744a';
  c.fillRect(0, 0, 12, 6);
  c.fillStyle = '#6e5c3a';
  c.fillRect(1, 1, 10, 4);
  c.fillStyle = '#9c8656';
  for (let x = 2; x < 10; x += 2) c.fillRect(x, 2 - (r() < 0.5 ? 0 : -1) + 1, 1, 2);
  return cv;
}

/**
 * A waypost flanking a region-border gate: timber post on a stone base with
 * a warm lantern — paired with a GPU light so gates read from far away.
 */
export function gatePostSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const [cv, c] = houseCanvas(14, 30);
  // stone base
  c.fillStyle = '#6a6a70';
  c.fillRect(3, 25, 8, 5);
  c.fillStyle = '#54545a';
  c.fillRect(3, 28, 8, 2);
  // post
  c.fillStyle = '#4a3826';
  c.fillRect(5, 4, 4, 22);
  c.fillStyle = '#5c4a30';
  c.fillRect(6, 4, 2, 22);
  // crossarm
  c.fillStyle = '#4a3826';
  c.fillRect(2, 6, 10, 3);
  // lantern
  c.fillStyle = '#2c2c30';
  c.fillRect(9, 9, 5, 6);
  c.fillStyle = r() < 0.5 ? '#ffd88a' : '#ffcf70';
  c.fillRect(10, 10, 3, 4);
  c.fillStyle = 'rgba(255,216,138,0.35)';
  c.fillRect(8, 8, 7, 8);
  return cv;
}

/** A traveler's A-frame tent at a wilderness rest stop. */
export function tentSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const [cv, c] = houseCanvas(26, 22);
  const fabrics: [string, string][] = [
    ['#8a4a3a', '#6b3a2e'],
    ['#4a5c7a', '#374561'],
    ['#6e7a4a', '#525e35'],
  ];
  const [lit, shade1] = fabrics[(r() * fabrics.length) | 0];
  // ground shadow handled by the caller (drawAtFeet); body:
  c.fillStyle = shade1;
  c.beginPath();
  c.moveTo(13, 2);
  c.lineTo(24, 20);
  c.lineTo(2, 20);
  c.closePath();
  c.fill();
  // lit face (near side)
  c.fillStyle = lit;
  c.beginPath();
  c.moveTo(13, 2);
  c.lineTo(19, 20);
  c.lineTo(7, 20);
  c.closePath();
  c.fill();
  // entrance flap
  c.fillStyle = shade(shade1, -14);
  c.beginPath();
  c.moveTo(13, 8);
  c.lineTo(16, 20);
  c.lineTo(10, 20);
  c.closePath();
  c.fill();
  // seams + ridge
  c.strokeStyle = shade(lit, -22);
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(13, 2);
  c.lineTo(13, 20);
  c.stroke();
  c.strokeStyle = shade(shade1, 22);
  c.beginPath();
  c.moveTo(13, 2);
  c.lineTo(24, 20);
  c.stroke();
  // guy-ropes and stakes
  c.strokeStyle = '#3a2c1c';
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(7, 20);
  c.lineTo(3, 21.5);
  c.moveTo(19, 20);
  c.lineTo(23, 21.5);
  c.stroke();
  c.fillStyle = '#2c2014';
  c.fillRect(2, 21, 1.5, 1.5);
  c.fillRect(22.5, 21, 1.5, 1.5);
  return cv;
}

/** A ring-of-stones campfire — paired with a GPU light by the renderer. */
export function campfireSprite(): HTMLCanvasElement {
  const [cv, c] = houseCanvas(18, 13);
  // stone ring
  c.fillStyle = '#6a6a70';
  for (const [sx, sy] of [[2, 9], [5, 11], [9, 12], [13, 11], [16, 9], [14, 6], [4, 6]] as const) {
    c.beginPath();
    c.ellipse(sx, sy, 2, 1.5, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#54545a';
  for (const [sx, sy] of [[2, 9], [9, 12], [16, 9]] as const) {
    c.beginPath();
    c.ellipse(sx, sy + 0.6, 1.6, 1, 0, 0, Math.PI * 2);
    c.fill();
  }
  // crossed logs
  c.fillStyle = '#3a2c1c';
  c.save();
  c.translate(9, 8);
  c.rotate(-0.35);
  c.fillRect(-6, -1, 12, 2);
  c.restore();
  c.save();
  c.translate(9, 8);
  c.rotate(0.35);
  c.fillRect(-6, -1, 12, 2);
  c.restore();
  // fire
  c.fillStyle = '#c2452a';
  c.beginPath();
  c.moveTo(9, 3);
  c.quadraticCurveTo(13, 6, 10.5, 9);
  c.quadraticCurveTo(9, 7, 7.5, 9);
  c.quadraticCurveTo(5, 6, 9, 3);
  c.fill();
  c.fillStyle = '#ffcf70';
  c.beginPath();
  c.moveTo(9, 5.5);
  c.quadraticCurveTo(10.5, 7, 9.5, 8.5);
  c.quadraticCurveTo(8.5, 7, 9, 5.5);
  c.fill();
  return cv;
}
