import { px, rng } from './core';

export function shroomClusterSprite(): HTMLCanvasElement {
  return px(
    [
      '..tTTt......',
      '.tTTTTt.....',
      '.tTgTTt.tTt.',
      '..sTTs.tTTTt',
      '...ss..tgTTt',
      '.tTt....sTs.',
      'tTTTt...ss..',
      '.sgs........',
      '..s.........',
    ],
    { t: '#2f6b58', T: '#63d6ad', g: '#b8ffe4', s: '#274438' },
  );
}

// ---- farm plot growth stages (see world.ts FarmPlot / game.ts farming) ----
// stage 3 (ripe) reuses glowshroomSprite() below — a ready plot looks like a
// small glowshroom cluster, same payoff as the wild ones you forage.
export function farmSproutSprite(): HTMLCanvasElement {
  return px(
    [
      '...t...',
      '..tTt..',
      '...t...',
      '...t...',
      '..sss..',
    ],
    { t: '#3d6b4a', T: '#7fd69c', s: '#4a3a28' },
  );
}

export function farmBudSprite(): HTMLCanvasElement {
  return px(
    [
      '..bGb..',
      '.bGGGb.',
      '...t...',
      '...t...',
      '...t...',
      '..sss..',
    ],
    { b: '#2f6b58', G: '#8fd6b0', t: '#3d6b4a', s: '#4a3a28' },
  );
}

export function glowshroomSprite(): HTMLCanvasElement {
  return px(
    [
      '...tTTTt...',
      '..tTTTTTt..',
      '.tTTgGgTTt.',
      '.tTgGGGgTt.',
      '.ttTTTTTtt.',
      '....ss.....',
      '....sS.....',
      '...ssSs....',
      '...sSSs....',
    ],
    { t: '#2f6b58', T: '#63d6ad', g: '#a5f5d2', G: '#e2fff2', s: '#2e5244', S: '#3d6b58' },
  );
}

export function crystalSprite(): HTMLCanvasElement {
  return px(
    [
      '.....b......',
      '....bBb.....',
      '....bBb..b..',
      '...bBWBb.Bb.',
      '...bBBBb.Bb.',
      '..bBBWBBbBb.',
      '..bBBBBBbbb.',
      '.bBBBBBBBb..',
      '.bbbbbbbbb..',
    ],
    { b: '#31456e', B: '#5a7dd8', W: '#a8c4ff' },
  );
}

export function ironOreSprite(): HTMLCanvasElement {
  return px(
    [
      '.....gg......',
      '...ggGGgg....',
      '..gGGrGGgg...',
      '.gGGGrGGGGg..',
      '.gGrGGGGrGg..',
      'ggGGGGGGGGgg.',
      'gGGGrGGGGGGg.',
      '.ggGGGGGGgg..',
      '..gggggggg...',
    ],
    { g: '#3a352d', G: '#5c5344', r: '#b5622e' },
  );
}

export function bigCrystalSprite(): HTMLCanvasElement {
  return px(
    [
      '......b.........',
      '.....bWb....b...',
      '.....bWb...bBb..',
      '....bBWBb..bBb..',
      '....bBWBb.bBWb..',
      '...bBBWBBbbBWb..',
      '...bBBWBBBbBBb..',
      '..bBBBWBBBBBBb..',
      '..bBBBBBBBWBBb..',
      '.bBBBBBBBBBBBBb.',
      '.bbBBBBBBBBBbb..',
      '..bbbbbbbbbbb...',
    ],
    { b: '#2a3b61', B: '#5a7dd8', W: '#b8d0ff' },
  );
}

// ---- inventory-panel material/tool/armor icons (src/game.ts renderInventoryList) ----

export function woodSprite(): HTMLCanvasElement {
  return px(
    ['.wwwwwww.', 'wRRRRRRRw', 'wRrRrRrRw', 'wRRRRRRRw', 'wRrRrRrRw', '.wwwwwww.'],
    { w: '#5c4326', R: '#a87e4a', r: '#8a6438' },
  );
}

export function meatSprite(): HTMLCanvasElement {
  return px(
    ['....ww....', '..wWWWWw..', '.wWRRRRWw.', 'wWRRrRRWw.', 'wWRRRRRWw.', '.wWWWWWw..', '..wbbww...'],
    { w: '#7a3020', W: '#c9573a', R: '#e08a6a', r: '#a8442e', b: '#d8c8a8' },
  );
}

export function hideSprite(): HTMLCanvasElement {
  return px(
    ['.wwwwwww..', 'wTTTTTTw..', 'wTtTTtTww.', 'wTTTTTTTw.', '.wTtTTtTw.', '..wTTTTTw.', '...wwwww..'],
    { w: '#5c4326', T: '#b58a52', t: '#9a713e' },
  );
}

export function featherSprite(): HTMLCanvasElement {
  return px(
    ['....w.....', '...wWw....', '..wWfWw...', '.wWffFWw..', 'wWffFfFWw.', '..w..w....', '.w...w....'],
    { w: '#8a8478', W: '#d8d2c0', f: '#c9c0aa', F: '#efe9d8' },
  );
}

export function axeSprite(): HTMLCanvasElement {
  return px(
    ['..ssss...', '.sSSSSs..', 'sSSSSSs.h', '.sSSSSs.h', '..ssss..h', '........h', '........h'],
    { s: '#5c5c62', S: '#a8acb5', h: '#7a5a34' },
  );
}

export function pickaxeSprite(): HTMLCanvasElement {
  return px(
    ['ss....ss.', 'sSs..sSs.', '.sSssSs..', '..sSSs...', '...hh....', '...hh....', '...hh....'],
    { s: '#5c5c62', S: '#a8acb5', h: '#7a5a34' },
  );
}

export function leatherArmorSprite(): HTMLCanvasElement {
  return px(
    ['.ttttttt.', 'tTTTTTTTt', 'tTtttttTt', 'tTTTTTTTt', 'tTt...tTt', 'tTt...tTt', '.ttt.ttt.'],
    { t: '#5c4326', T: '#a87e4a' },
  );
}

export function ironArmorSprite(): HTMLCanvasElement {
  return px(
    ['.sssssss.', 'sSSSSSSSs', 'sSsssssSs', 'sSSSSSSSs', 'sSs...sSs', 'sSs...sSs', '.sss.sss.'],
    { s: '#4a4d54', S: '#9aa0ab' },
  );
}

export function hideVestSprite(): HTMLCanvasElement {
  return px(
    ['.hhhhhhh.', 'hHHHHHHHh', 'hHhhhhhHh', 'hHHHHHHHh', 'hHh...hHh', 'hHh...hHh', '.hhh.hhh.'],
    { h: '#5a3a26', H: '#8a5a3c' },
  );
}

export function rootSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 10;
  const c = cv.getContext('2d')!;
  c.strokeStyle = '#4a3826';
  c.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(2 + r() * 4, 9);
    c.bezierCurveTo(4 + r() * 8, 2 + r() * 4, 8 + r() * 6, 1 + r() * 5, 14, 6 + r() * 3);
    c.stroke();
  }
  c.strokeStyle = '#5c4630';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(3, 8);
  c.bezierCurveTo(6, 3, 10, 3, 13, 7);
  c.stroke();
  return cv;
}

