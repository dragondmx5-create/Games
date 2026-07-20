const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const serverRoot = path.resolve(__dirname, '..');
const distDir = path.join(serverRoot, 'dist');

function cleanDist() {
  fs.rmSync(distDir, { recursive: true, force: true });
}

cleanDist();

const tscCli = require.resolve('typescript/bin/tsc', { paths: [serverRoot] });
const result = spawnSync(process.execPath, [tscCli], {
  cwd: serverRoot,
  env: process.env,
  stdio: 'inherit',
});

if (result.error || result.signal || result.status !== 0) {
  // A failed compiler invocation may have emitted a partial tree. Never leave
  // that tree runnable or packageable as a fallback backend.
  cleanDist();
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
