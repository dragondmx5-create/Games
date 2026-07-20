import { createCanvas, loadImage } from 'canvas';
async function main() {
  const img = await loadImage('/mnt/user-data/uploads/1000054009.png');
  const cv = createCanvas(img.width, img.height);
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  const d = c.getImageData(0, 0, img.width, img.height).data;
  const W = img.width;
  // central sprite patch (avoid checker): rough crop
  const x0 = 400, x1 = 850, y0 = 200, y1 = 700;
  for (const step of [4.7, 4.9, 5.0, 5.1, 5.3, 7, 9.5, 9.8, 10.0, 10.2, 10.5, 12]) {
    let bestErr = Infinity, bestPh = 0;
    for (let ph = 0; ph < step; ph += step / 6) {
      let err = 0, n = 0;
      // reconstruct: each pixel maps to sampled center of its cell
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const cxi = Math.round((Math.floor((x - x0 - ph) / step) + 0.5) * step + x0 + ph);
          const cyi = Math.round((Math.floor((y - y0 - ph) / step) + 0.5) * step + y0 + ph);
          const a = (y * W + x) * 4, b = (Math.min(y1, Math.max(y0, cyi)) * W + Math.min(x1, Math.max(x0, cxi))) * 4;
          err += Math.abs(d[a] - d[b]) + Math.abs(d[a+1] - d[b+1]) + Math.abs(d[a+2] - d[b+2]);
          n++;
        }
      }
      if (err / n < bestErr) { bestErr = err / n; bestPh = ph; }
    }
    console.log(`step ${step}: err ${bestErr.toFixed(2)} (phase ${bestPh.toFixed(1)})`);
  }
}
main();
