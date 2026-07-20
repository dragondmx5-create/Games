// Inlines dist/index.html + its built JS into a single self-contained HTML
// file, suitable for publishing as a Claude "Artifact" (which serves one
// static file with no server, no separate JS request). Run `npm run build`
// first. Output defaults to dist/undral-standalone.html (gitignored); pass
// a path as the first CLI arg to write elsewhere.
//
//   node scripts/inline-build.cjs
//   node scripts/inline-build.cjs /tmp/undral.html
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const outPath = process.argv[2] || path.join(dist, 'undral-standalone.html');

// Since accounts became mandatory, the game cannot even start without a
// reachable backend. A standalone file has no same-origin /api to proxy to,
// so the API origin must be baked in at BUILD time (it's read via
// import.meta.env in src/api.ts — setting it here, after the build, is too
// late). Without it the standalone page shows SERVER UNREACHABLE forever.
if (!process.env.VITE_API_URL) {
  console.warn(
    '\nWARNING: VITE_API_URL was not set. The standalone build only works if the\n' +
      'preceding `npm run build` ran with VITE_API_URL pointing at a real backend, e.g.\n' +
      '  VITE_API_URL=https://your-server.example npm run artifact\n' +
      'Otherwise the game will show SERVER UNREACHABLE (login is mandatory now).\n',
  );
}

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const assetFiles = fs.readdirSync(path.join(dist, 'assets'));
const jsFile = assetFiles.find((f) => f.endsWith('.js'));
const cssFile = assetFiles.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('Expected one built JS and CSS asset in dist/assets');
let js = fs.readFileSync(path.join(dist, 'assets', jsFile), 'utf8');
let css = fs.readFileSync(path.join(dist, 'assets', cssFile), 'utf8');

const mimeFor = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.json': 'application/json',
  })[ext] || 'application/octet-stream';
};

// Vite normally leaves textures, sprites and fonts as separate files. Replace
// every built asset reference with a data URI so the artifact really is one
// portable file, including the production PBR library.
let inlinedAssets = 0;
let inlinedBytes = 0;
for (const filename of assetFiles) {
  if (filename === jsFile || filename === cssFile) continue;
  const bytes = fs.readFileSync(path.join(dist, 'assets', filename));
  const dataUri = `data:${mimeFor(filename)};base64,${bytes.toString('base64')}`;
  const jsBefore = js;
  const cssBefore = css;
  js = js.replaceAll(filename, dataUri);
  css = css.replaceAll(`./${filename}`, dataUri).replaceAll(filename, dataUri);
  if (js !== jsBefore || css !== cssBefore) {
    inlinedAssets++;
    inlinedBytes += bytes.length;
  }
}
js = js.replaceAll('</script', '<\\/script');

// escape non-ASCII so the page renders correctly regardless of served charset
const NON_ASCII = /[^\x00-\x7F]/g;
const escJs = (s) => s.replace(NON_ASCII, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const escHtml = (s) => s.replace(NON_ASCII, (c) => '&#x' + c.charCodeAt(0).toString(16) + ';');

const style = `<style>${css}</style>`;
const body = html
  .match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .trim();

const out =
  '<!doctype html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n' +
  '<meta name="theme-color" content="#090a0d">\n' +
  '<meta name="color-scheme" content="dark">\n' +
  '<title>UNDRAL - Six Lands Beyond the Veil</title>\n' +
  escHtml(style) + '\n</head>\n<body>\n' + escHtml(body) +
  '\n<script type="module">\n' + escJs(js) + '\n</script>\n</body>\n</html>\n';

fs.writeFileSync(outPath, out);
console.log('wrote', outPath, `(${out.length} bytes); inlined ${inlinedAssets} assets / ${inlinedBytes} source bytes; non-ascii remaining:`, NON_ASCII.test(out));
