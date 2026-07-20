import { createCanvas, loadImage } from 'canvas';
import * as fs from 'fs';
async function main() {
  // zoomed inspection of the assets that showed leftover background
  const names = ['tree.png','tree-2.png','tree-4.png','tree-5.png','bush.png'];
  const imgs = await Promise.all(names.map(n => loadImage(`public/assets/${n}`)));
  const SC = 5;
  const w = imgs.reduce((s,i)=>s+i.width*SC+14, 14);
  const h = Math.max(...imgs.map(i=>i.height*SC)) + 30;
  const cv = createCanvas(w, h);
  const c = cv.getContext('2d');
  // split background: grass green + dark, so any leftover halo shows
  c.fillStyle = '#5aa83e'; c.fillRect(0,0,w,h/2);
  c.fillStyle = '#2c3e50'; c.fillRect(0,h/2,w,h/2);
  (c as any).imageSmoothingEnabled = false;
  let x = 14;
  for (const i of imgs) { c.drawImage(i as any, x, h - 15 - i.height*SC, i.width*SC, i.height*SC); x += i.width*SC + 14; }
  fs.writeFileSync('/home/claude/assets-check2.png', cv.toBuffer('image/png'));
  console.log('ok');
}
main();
