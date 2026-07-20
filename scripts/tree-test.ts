import { createCanvas } from 'canvas';
import * as fs from 'fs';
(globalThis as any).document = { createElement: (t: string) => createCanvas(1, 1) };
async function main() {
  const { treeSprite } = await import('/home/claude/game/Game--claude-version-comparison-c0tgf6/src/sprites') as any;
  const out = createCanvas(1300, 700);
  const c = out.getContext('2d');
  c.fillStyle = '#5aa83e'; c.fillRect(0, 0, 1300, 700);
  const seeds = [400, 441, 482, 523, 3, 9];
  seeds.forEach((s, i) => {
    const spr = treeSprite(s);
    c.drawImage(spr as any, 10 + (i % 6) * 212, 340 - spr.height / 2, spr.width / 2, spr.height / 2);
  });
  fs.writeFileSync('/home/claude/trees.png', out.toBuffer('image/png'));
  console.log('ok');
}
main();
