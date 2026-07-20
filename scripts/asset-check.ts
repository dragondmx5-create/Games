import { createCanvas, loadImage } from 'canvas';
import * as fs from 'fs';
async function main() {
  const names = ['tree.png','tree-2.png','tree-3.png','tree-dead.png','tree-stump.png','rock.png','bush.png','wood.png'];
  const imgs = await Promise.all(names.map(n => loadImage(`public/assets/${n}`)));
  const SC = 5;
  const w = imgs.reduce((s,i)=>s+i.width*SC+10, 10);
  const h = Math.max(...imgs.map(i=>i.height*SC)) + 40;
  const cv = createCanvas(w, h);
  const c = cv.getContext('2d');
  c.fillStyle = '#5aa83e'; c.fillRect(0,0,w,h);
  (c as any).imageSmoothingEnabled = false;
  let x = 10;
  for (const i of imgs) { c.drawImage(i as any, x, h - 20 - i.height*SC, i.width*SC, i.height*SC); x += i.width*SC + 10; }
  fs.writeFileSync('/home/claude/assets-check.png', cv.toBuffer('image/png'));
  console.log('ok');
}
main();
