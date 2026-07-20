import { px, tintSprite } from './core';

// ---------------------------------------------------------------- player

const PLAYER_PAL = {
  h: '#20242f', H: '#353c4e', R: '#4d5878', // hood: outline / main / rim light
  f: '#d8b98f', s: '#b08b62', e: '#14161d', // face / shadow / eyes
  c: '#262c3b', C: '#3d4559, ', D: '#4f5972', // (C fixed below)
  b: '#5f4b31', B: '#8a7048, ', // (B fixed below)
  p: '#8a7355', // chest strap
  l: '#1c1f28', L: '#333a4a', // legs / boot light
  t: '#6b4a2c', // torch handle
} as Record<string, string>;
PLAYER_PAL.C = '#3d4559';
PLAYER_PAL.B = '#8a7048';

const BODY_DOWN = [
  '......hhhh......',
  '.....hHHHHh.....',
  '....hHHHHHHR....',
  '....hHHHHHHR....',
  '....hHffffHh....',
  '....hHfefeHh....',
  '....hhfsffhh....',
  '.....cffffc.....',
  '....cCCCCCCc....',
  '...cCCpCCCCDc.t.',
  '..cCCCpCCCCDct..',
  '..cCCCpCCCCDct..',
  '..cCCCpCCCCDc...',
  '..cCbBbbbbCDc...',
  '...cCCCCCCCc....',
  '...cCCCCCCDc....',
  '...cDCCCCCDc....',
  '....cccccccc....',
];
const BODY_UP = [
  '......hhhh......',
  '.....hHHHHh.....',
  '....hHHHHHHR....',
  '....hHHHHHHR....',
  '....hHHHHHHh....',
  '....hHHHHHHh....',
  '....hhHHHHhh....',
  '.....cHHHHc.....',
  '....cCHHHHCc....',
  '...cCCHHHHCDc.t.',
  '..cCCCHHHHCDct..',
  '..cCCCCCCCCDct..',
  '..cCCCCCCCCDc...',
  '..cCbbbbbbCDc...',
  '...cCCCCCCCc....',
  '...cCCCCCCDc....',
  '...cDCCCCCDc....',
  '....cccccccc....',
];
const BODY_SIDE = [
  '......hhhh......',
  '.....hHHHHh.....',
  '.....hHHHHRh....',
  '.....hHHHHRh....',
  '.....hHfffh.....',
  '.....hHfefh.....',
  '.....hhfsfh.....',
  '......cffc......',
  '.....cCCCDc.....',
  '.....cCCCDc.t...',
  '.....cCpCDct....',
  '.....cCpCDct....',
  '.....cCpCDct....',
  '.....cCbBDc.....',
  '.....cCCCDc.....',
  '.....cCCCDc.....',
  '.....cDCCDc.....',
  '......cccc......',
];

// 4-frame walk: [contact L, pass, contact R, pass] — plus idle
const LEGS_DOWN = [
  // idle
  ['.....llllll.....', '.....ll..ll.....', '.....ll..ll.....', '.....LL..LL.....', '....lLL..LLl....', '................'],
  // left leg forward
  ['.....llllll.....', '....lll..ll.....', '....ll...ll.....', '....LL...LL.....', '...lLL....LL....', '................'],
  // passing
  ['.....llllll.....', '.....ll..ll.....', '.....lll.ll.....', '.....LLLLLL.....', '......lLLl......', '................'],
  // right leg forward
  ['.....llllll.....', '.....ll..lll....', '.....ll...ll....', '.....LL...LL....', '....LL....LLl...', '................'],
];
const LEGS_UP = LEGS_DOWN;
const LEGS_SIDE = [
  ['......llll......', '......l..l......', '......l..l......', '......L..L......', '.....lL..Ll.....', '................'],
  ['......llll......', '.....ll..l......', '....ll...ll.....', '....L.....L.....', '...lL.....Ll....', '................'],
  ['......llll......', '......lll.......', '......ll........', '......LL........', '.....lLLl.......', '................'],
  ['......llll......', '......l..ll.....', '.....ll...ll....', '.....L.....L....', '....lL.....Ll...', '................'],
];

function composeFrames(body: string[], legFrames: string[][]): HTMLCanvasElement[] {
  return legFrames.map((legs) => px([...body, ...legs], PLAYER_PAL));
}

export interface PlayerFrames {
  down: HTMLCanvasElement[]; // [idle, w1, w2, w3] — walk cycle plays 1,2,3,2
  up: HTMLCanvasElement[];
  side: HTMLCanvasElement[];
}

export function playerFrames(): PlayerFrames {
  return {
    down: composeFrames(BODY_DOWN, LEGS_DOWN),
    up: composeFrames(BODY_UP, LEGS_UP),
    side: composeFrames(BODY_SIDE, LEGS_SIDE),
  };
}

// ---------------------------------------------------------------- enemies

const BUG_PAL = {
  k: '#2b2114', b: '#4d3d26', B: '#6a5636', S: '#7d6844',
  d: '#3a2d1b', r: '#d84545', l: '#1d1710', a: '#3a2d1b',
};

export function bugFrames(): HTMLCanvasElement[] {
  const body = [
    '....a......a....',
    '.....a....a.....',
    '.....kkkkkk.....',
    '...kkbbbbbbkk...',
    '..kbbBBBBBBbbk..',
    '..kbBBSBBSBBbk..',
    '..kbbBBdBBBbbk..',
    '...kkbbdbbbkk...',
    '.....kkkkkk.....',
    '................',
  ];
  const legsA = ['..l...l..l...l..', '.l....l..l....l.'];
  const legsB = ['.l...l....l...l.', '..l..l....l..l..'];
  const legsC = ['..l..l....l..l..', '...l.l....l.l...'];
  const eyes = (m: string[]) => m.map((r) => r); // eyes baked in body (S = shine)
  return [legsA, legsB, legsC].map((legs) => px(eyes([...body.slice(0, 8), ...legs]), BUG_PAL));
}

const WORM_PAL = {
  p: '#392c47', P: '#5e4a75', Q: '#7d639c', q: '#8f77ad',
  m: '#4a1620', M: '#b8404f', t: '#e0d8c8', d: '#2c2138',
};

export function wallwormFrames(): HTMLCanvasElement[] {
  const f1 = [
    '.....ppppp....',
    '....pPQQQPp...',
    '...pPmmmmmmPp.',
    '...pMtMMMtMp..',
    '...pPmmmmmPp..',
    '...pPPQQQPPp..',
    '....pPPPPPp...',
    '...pPPQqQPPp..',
    '....pPPPPPp...',
    '...pPPQqQPPp..',
    '....pPPPPPp...',
    '...pPPQqQPPp..',
    '....pPPPPPp...',
    '..ppPPPPPPPpp.',
  ];
  const f2 = f1.map((row, i) => {
    if (i < 5 || i > 12) return row;
    // wiggle: alternate rows shift by 1px
    return i % 2 === 0 ? ' ' + row.slice(0, -1) : row.slice(1) + ' ';
  });
  return [px(f1, WORM_PAL), px(f2, WORM_PAL)];
}

/** per-layer enemy tints (layer 1 = untinted) */
export const LAYER_TINTS = ['', '#4f6580', '#6e8f4f', '#b0502f', '#5b3f80'];

// ---- enemy variants: same procedural rig as their base kind, recolored ----
// (no new art — a distinct silhouette-reading tint on top of the existing
// bug/wallworm geometry, same technique as LAYER_TINTS above)

export function shellbugFrames(): HTMLCanvasElement[] {
  return bugFrames().map((f) => tintSprite(f, '#3a6b8a', 0.55));
}

export function spitterFrames(): HTMLCanvasElement[] {
  return wallwormFrames().map((f) => tintSprite(f, '#8a3a6b', 0.5));
}

// --------------------------------------------------------------- weapons
// drawn blade-up, hilt at bottom center; rotated in-hand during the swing

export function boneShivSprite(): HTMLCanvasElement {
  return px(
    ['..W..', '..W..', '.WW..', '..W..', '..w..', '.gg..', '..g..'],
    { W: '#e8e0d0', w: '#b8ad98', g: '#6b5638' },
  );
}

export function chitinBladeSprite(): HTMLCanvasElement {
  return px(
    ['...k...', '..kK...', '..kKk..', '..kKk..', '.kKKk..', '..kKk..', '..kk...', '..gG...', '..gg...'],
    { k: '#3a2f20', K: '#6e5a3c', g: '#54432c', G: '#8a7048' },
  );
}

export function crystalEdgeSprite(): HTMLCanvasElement {
  return px(
    ['...B...', '..BW...', '..BWB..', '..BWB..', '.BBWB..', '..BWB..', '..BBB..', '...b...', '..gGg..', '..gg...'],
    { B: '#5a7dd8', W: '#a8c4ff', b: '#31456e', g: '#54432c', G: '#8a7048' },
  );
}

// -------------------------------------------------- craft-only weapons

export function woodClubSprite(): HTMLCanvasElement {
  return px(
    ['.WWW.', 'WWWWW', 'WWWWW', '.WWW.', '..w..', '..w..', '..g..'],
    { W: '#c79a5f', w: '#a97c50', g: '#6b4a2c' },
  );
}

export function ironFalchionSprite(): HTMLCanvasElement {
  return px(
    ['..K..', '.KW..', 'KW...', '.KW..', '..KW.', '..gG.', '..gg.'],
    { K: '#8f97a8', W: '#dfe3ee', g: '#54432c', G: '#8a7048' },
  );
}

export function hideWarclubSprite(): HTMLCanvasElement {
  return px(
    ['.WWWWW.', 'WWWWWWW', 'WWWWWWW', '.WWWWW.', '...w...', '...w...', '..gGg..', '..ggg..'],
    { W: '#8a5a3c', w: '#6b4a2c', g: '#54432c', G: '#8a7048' },
  );
}

export function featherJavelinSprite(): HTMLCanvasElement {
  return px(
    ['...P...', '...T...', '...T...', '...T...', '...T...', '..fTf..', '...T...'],
    { P: '#d8d0a8', T: '#a97c50', f: '#e8dfa0' },
  );
}

export function prismHalberdSprite(): HTMLCanvasElement {
  return px(
    ['..PP...', '.PWP...', '.PWP...', '..T....', '..T....', '..T....', '..T....', '..gGg..'],
    { P: '#8f5fd8', W: '#d8c2ff', T: '#6b5638', g: '#54432c', G: '#8a7048' },
  );
}

// ------------------------------------------------------------------- props

// ---- livestock and companion (see world.ts carveTown, entities.ts Animal/Pet) ----
export function cowSprite(): HTMLCanvasElement {
  return px(
    [
      '.wwwwwww..',
      'wwwwwwwww.',
      'wBwwwwwBw.',
      'wwwwwwwww.',
      'wOwwwwwOw.',
      'wwwwwwwww.',
      '.wwwwwww..',
      '..w....w..',
      '..b....b..',
    ],
    { w: '#e8e2d0', B: '#8a6244', O: '#2a2620', b: '#3d372c' },
  );
}

export function chickenSprite(): HTMLCanvasElement {
  return px(
    ['...cc...', '..wwww..', '.wwwwww.', 'wOwwwww.', '.wwwwww.', '..wwww..', '..b..b..', '..b..b..'],
    { c: '#c0453a', w: '#e8dcc0', O: '#2a2620', b: '#d19a4a' },
  );
}

export function petSprite(): HTMLCanvasElement {
  return px(
    ['..tttt....', '.ttttttt..', 'tGtttttGt.', 'ttttttttt.', '.ttttttt..', '..t....t..', '..b....b..'],
    { t: '#4a3f35', G: '#7de8c3', b: '#2e2820' },
  );
}

export function bagSprite(): HTMLCanvasElement {
  return px(
    ['....rrrr....', '...r....r...', '..bbbbbbbb..', '.bBBBBBBBBb.', '.bBBBBBBBBb.', '.bBBsBBsBBb.', '.bBBBBBBBBb.', '..bbbbbbbb..'],
    { r: '#4a3b28', b: '#54432c', B: '#7a6240', s: '#3d321f' },
  );
}

export function chestClosedSprite(): HTMLCanvasElement {
  return px(
    [
      '.kkkkkkkkkk.',
      'kBBBBBBBBBBk',
      'kBBBBBBBBBBk',
      'kkkkllllkkkk',
      'kBBBBBBBBBBk',
      'kBBBllllBBBk',
      'kBBBBBBBBBBk',
      '.kkkkkkkkkk.',
    ],
    { k: '#2c1e12', B: '#6b4a2a', l: '#c9a44a' },
  );
}

export function chestOpenSprite(): HTMLCanvasElement {
  return px(
    [
      'kkkkkkkkkkkk',
      'kMMMMMMMMMMk',
      'kkkkkkkkkkkk',
      'kBBBBBBBBBBk',
      'k1111111111k',
      'k1y1y1y1y11k',
      'kBBBBBBBBBBk',
      'kkkkkkkkkkkk',
    ],
    { k: '#2c1e12', B: '#6b4a2a', M: '#8a6238', '1': '#1a1210', y: '#e0b84a' },
  );
}
