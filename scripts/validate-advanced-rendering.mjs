import fs from 'node:fs';

const failures = [];
const checks = [
  ['src/art3d/advancedTerrainMaterial.ts', [
    'TERRAIN_ATLAS_URLS',
    'height-biased',
    'MeshPhysicalMaterial',
    'clearcoat',
    'undralTerrainWetness',
    'undralTerrainWarpedNoise',
    'undralTerrainSampleDual',
  ]],
  ['src/art3d/terrainDetails.ts', [
    'InstancedMesh',
    'undralWindTime',
    'makeGrassClusterGeometry',
    'FLOWER_MAX',
  ]],
  ['src/rendering/postprocessing/CinematicPipeline3D.ts', [
    'GTAOPass',
    'UnrealBloomPass',
    'SMAAPass',
    'OutputPass',
  ]],
  ['src/render3d.ts', [
    'createProceduralWaterNormal',
    'heroRimLight',
    'CinematicPipeline3D',
    'AdvancedTerrainMaterial',
  ]],
];

for (const [file, tokens] of checks) {
  if (!fs.existsSync(file)) {
    failures.push(`missing ${file}`);
    continue;
  }
  const source = fs.readFileSync(file, 'utf8');
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${file} is missing required rendering contract token: ${token}`);
  }
}

const materialSource = fs.readFileSync('src/art3d/materials.ts', 'utf8');
for (const feature of ['anisotropy', 'iridescence', 'transmission', 'sheen', 'clearcoat', "physical === 'hair'", "physical === 'fur'", 'surfaceUvTransform', 'undralWarpedNoise']) {
  if (!materialSource.includes(feature)) failures.push(`advanced material feature is missing: ${feature}`);
}

const assetSource = fs.readFileSync('src/art3d/assets.ts', 'utf8');
for (const feature of ["shadow.name = 'contact-shadow'", 'makeTree', 'makeRockCluster', 'makeFenceSegment']) {
  if (!assetSource.includes(feature)) failures.push(`contact/silhouette asset feature is missing: ${feature}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('validated advanced terrain, physical materials, cinematic post-processing, water, wind and character lighting contracts');
