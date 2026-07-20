import { px, rng } from './core';

export function stalagmiteSprite(seed = 0): HTMLCanvasElement {
  const maps = [
    [
      '.....ss.....',
      '.....sS.....',
      '....sSSs....',
      '....sSDs....',
      '...sSSSSs...',
      '...sSSDSs...',
      '...sSSSDs...',
      '..sSSSSSDs..',
      '..sSDSSSSs..',
      '..sSSSSSDs..',
      '.sSSDSSSSDs.',
      '.sSSSSSSSSs.',
      'ssSSSSSSSSss',
    ],
    [
      '....ss......',
      '....sS..s...',
      '...sSSs.sS..',
      '...sSDs.sS..',
      '..sSSSssSSs.',
      '..sSSDSSSDs.',
      '..sSSSSSSSs.',
      '.sSDSSSDSSs.',
      '.sSSSSSSSSs.',
      'ssSSSSSSSSss',
    ],
  ];
  return px(maps[seed % maps.length], { s: '#241f19', S: '#4a4238', D: '#5c5245', d: '#332d26' });
}

export function pillarSprite(): HTMLCanvasElement {
  return px(
    [
      'cccccccccc',
      'cCCCCCCCCc',
      '.ssSSSSss.',
      '.sSSSSDSs.',
      '.sSSdSSSs.',
      '.sSDSSSSs.',
      '.sSSSSdSs.',
      '.sSdSSSDs.',
      '.sSSSSSSs.',
      '.sSSDSSSs.',
      '.sSdSSSSs.',
      '.sSSSSdSs.',
      '.sSSDSSSs.',
      'ssSSSSSSss',
      'cCCCCCCCCc',
      'cccccccccc',
    ],
    { c: '#2b2721', C: '#4d453a', s: '#332e27', S: '#57503f', D: '#6b6350', d: '#403a30' },
  );
}

export function brokenPillarSprite(): HTMLCanvasElement {
  return px(
    [
      '..sSs..ss.',
      '.sSSSs.sS.',
      '.sSSDSssS.',
      '.sSSSSSSs.',
      '.sSdSSSDs.',
      '.sSSSSSSs.',
      '.sSSDSdSs.',
      'ssSSSSSSss',
      'cCCCCCCCCc',
      'cccccccccc',
    ],
    { c: '#2b2721', C: '#4d453a', s: '#332e27', S: '#57503f', D: '#6b6350', d: '#403a30' },
  );
}

export function statueSprite(): HTMLCanvasElement {
  return px(
    [
      '........gGGg........',
      '.......gGGGGg.......',
      '......gGGGGGGg......',
      '......gGddddGg......',
      '......gGGGGGGg..w...',
      '.......gGGGGg...w...',
      '.....ggGGGGGGgg.w...',
      '....gGGGGGGGGGGgw...',
      '...gGGGgGGGGgGGGW...',
      '...gGGg.gGGg.gGGW...',
      '...gGGg.gGGg.ggGW...',
      '...gGg..gGGg...gW...',
      '...gg...gGGg....w...',
      '........gGGg....w...',
      '.......gGGGGg...w...',
      '.......gGGGGg...w...',
      '......gGGDGGGg..w...',
      '......gGGGGGGg..w...',
      '.....gGGGGGGGGg.w...',
      '.....gGGDGGGDGg.....',
      '....gGGGGGGGGGGg....',
      '....gGGgGGGGgGGg....',
      '....gGg.gGGg.gGg....',
      '....gg..gGGg..gg....',
      '...sssssssssssssss..',
      '..sSSSSSSSSSSSSSSDs.',
      '.sSSDSSSSSSSSDSSSSs.',
      'ssssssssssssssssssss',
    ],
    { g: '#383c45', G: '#5c626e', D: '#6e7582', d: '#262930', w: '#454a54', W: '#585e6a', s: '#2e3138', S: '#4a4e58' },
  );
}

export function bonesSprite(): HTMLCanvasElement {
  return px(
    ['.ww.........', 'wWWw...w.w..', 'wWdW..wwww..', '.ww..w.ww.w.', '.....w.ww.w.', '......wwww..'],
    { w: '#6e685c', W: '#8f887a', d: '#2a2721' },
  );
}

export function skullSprite(): HTMLCanvasElement {
  return px(
    ['..wwww..', '.wWWWWw.', '.WdWWdW.', '.wWWWWw.', '..wdwd..', '..wwww..'],
    { w: '#6e685c', W: '#938c7d', d: '#26231d' },
  );
}

export function rubbleSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = 14;
  cv.height = 9;
  const c = cv.getContext('2d')!;
  for (let i = 0; i < 6; i++) {
    const x = 1 + r() * 10;
    const y = 3 + r() * 4;
    const s = 1.5 + r() * 2;
    c.fillStyle = ['#3a352d', '#4a4238', '#57503f'][(r() * 3) | 0];
    c.beginPath();
    c.ellipse(x, y, s, s * 0.7, r(), 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#6b6350';
  c.fillRect(4, 3, 2, 1);
  return cv;
}

export function rockSprite(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = 10;
  cv.height = 8;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#3a352d';
  c.beginPath();
  c.ellipse(5, 5, 4 + r(), 2.6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#4d463a';
  c.beginPath();
  c.ellipse(4.4, 4, 3, 2, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#5c5344';
  c.fillRect(3, 3, 2, 1);
  return cv;
}
