import { createCanvas, loadImage } from 'canvas';
import * as fs from 'fs';

interface Tune {
  filmicMix: number; gammaPow: number; vibrance: number;
  fogAmt: number; vignette: number; cloud: number;
}
const OLD: Tune = { filmicMix: 0.62, gammaPow: 0.96, vibrance: 0.14, fogAmt: 0.018, vignette: 0.24, cloud: 0.10 };
const NEW: Tune = { filmicMix: 0.26, gammaPow: 1.0, vibrance: 0.34, fogAmt: 0.0, vignette: 0.11, cloud: 0.06 };
const GRADE = [1.02, 1.0, 0.94];

async function grade(src: string, dst: string, t: Tune) {
  const img = await loadImage(src);
  const cv = createCanvas(img.width, img.height);
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  const d = c.getImageData(0, 0, img.width, img.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const px = ((i / 4) % img.width) / img.width - 0.5;
    const py = Math.floor(i / 4 / img.width) / img.height - 0.5;
    const radial = px * px + py * py;
    let r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
    // cloud shadow (use mid value 0.5 coverage)
    const cl = 0.5 * t.cloud;
    r = r * (1 - cl) + 0.030 * 0.5; g = g * (1 - cl) + 0.024 * 0.5; b = b * (1 - cl) + 0.010 * 0.5;
    // grade
    r *= GRADE[0]; g *= GRADE[1]; b *= GRADE[2];
    // filmic
    const film = (x: number) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
    r = r + (film(r) - r) * t.filmicMix;
    g = g + (film(g) - g) * t.filmicMix;
    b = b + (film(b) - b) * t.filmicMix;
    r = Math.pow(Math.max(0, r), t.gammaPow); g = Math.pow(Math.max(0, g), t.gammaPow); b = Math.pow(Math.max(0, b), t.gammaPow);
    // vibrance
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const vib = 1 + (1 - sat) * t.vibrance;
    r = luma + (r - luma) * vib; g = luma + (g - luma) * vib; b = luma + (b - luma) * vib;
    // fog (center)
    const fog = t.fogAmt * (1 - Math.min(1, radial / 0.5));
    r += 0.07 * fog * 20; g += 0.085 * fog * 20; b += 0.10 * fog * 20; // approx avg of noise*[.012..)
    // vignette
    const smooth = (a: number, bb: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (bb - a))); return u * u * (3 - 2 * u); };
    const v = smooth(0.28, 0.72, radial);
    const vf = 1 - v * t.vignette;
    r *= vf; g *= vf; b *= vf;
    p[i] = Math.min(255, Math.max(0, r * 255));
    p[i + 1] = Math.min(255, Math.max(0, g * 255));
    p[i + 2] = Math.min(255, Math.max(0, b * 255));
  }
  c.putImageData(d, 0, 0);
  fs.writeFileSync(dst, cv.toBuffer('image/png'));
}

async function main() {
  await grade('/home/claude/after6.png', '/home/claude/post-old.png', OLD);
  await grade('/home/claude/after6.png', '/home/claude/post-new.png', NEW);
  // side-by-side strip
  const a = await loadImage('/home/claude/post-old.png');
  const b = await loadImage('/home/claude/post-new.png');
  const cv = createCanvas(a.width * 2 + 8, Math.min(a.height, 700));
  const c = cv.getContext('2d');
  c.fillStyle = '#111'; c.fillRect(0, 0, cv.width, cv.height);
  c.drawImage(a, 0, 0);
  c.drawImage(b, a.width + 8, 0);
  fs.writeFileSync('/home/claude/post-compare.png', cv.toBuffer('image/png'));
  console.log('ok');
}
main();
