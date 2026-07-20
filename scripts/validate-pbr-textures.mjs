import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src/assets3d/pbr');
const kinds = ['wood', 'plaster', 'stone', 'roof', 'metal', 'cloth', 'leather', 'ground', 'grass', 'dirt', 'mud', 'moss', 'pebble', 'leaflitter', 'foliage', 'hair', 'fur', 'crystal', 'skin'];
const maps = ['basecolor', 'normal', 'orm', 'height'];
const failures = [];

function inspectPng(file) {
  const bytes = fs.readFileSync(file);
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('invalid PNG signature');
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error('missing PNG IHDR');
  return { bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colorType: bytes[25] };
}

for (const kind of kinds) {
  for (const map of maps) {
    const file = path.join(root, `${kind}_${map}.png`);
    if (!fs.existsSync(file)) {
      failures.push(`missing ${file}`);
      continue;
    }
    try {
      const info = inspectPng(file);
      if (info.width !== 512 || info.height !== 512) failures.push(`${file} must be 512x512, got ${info.width}x${info.height}`);
      if (info.bitDepth !== 8) failures.push(`${file} must use 8-bit channels, got ${info.bitDepth}`);
      const expectedType = map === 'height' ? 0 : 2;
      if (info.colorType !== expectedType) failures.push(`${file} has PNG color type ${info.colorType}, expected ${expectedType}`);
      const minimumBytes = map === 'height' ? 18_000 : 32_000;
      if (info.bytes < minimumBytes) failures.push(`${file} is suspiciously small (${info.bytes} bytes), likely missing authored variation`);
    } catch (error) {
      failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}


const atlases = [
  ['terrain_basecolor_atlas.png', 2],
  ['terrain_normal_atlas.png', 2],
  ['terrain_orm_atlas.png', 2],
  ['terrain_height_atlas.png', 0],
];
for (const [name, expectedType] of atlases) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) {
    failures.push(`missing ${file}`);
    continue;
  }
  try {
    const info = inspectPng(file);
    if (info.width !== 1584 || info.height !== 1056) failures.push(`${file} must be 1584x1056, got ${info.width}x${info.height}`);
    if (info.bitDepth !== 8) failures.push(`${file} must use 8-bit channels, got ${info.bitDepth}`);
    if (info.colorType !== expectedType) failures.push(`${file} has PNG color type ${info.colorType}, expected ${expectedType}`);
    if (info.bytes < 100_000) failures.push(`${file} is suspiciously small (${info.bytes} bytes)`);
  } catch (error) {
    failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`validated ${kinds.length * maps.length} PBR authoring textures (${kinds.length} material sets) and ${atlases.length} terrain atlases`);
