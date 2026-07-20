import * as THREE from 'three';
import { TERRAIN_ATLAS_LAYOUT, TERRAIN_ATLAS_URLS } from './pbrTextureManifest';

interface TerrainShaderUniforms {
  undralTerrainBaseAtlas: { value: THREE.Texture };
  undralTerrainNormalAtlas: { value: THREE.Texture };
  undralTerrainOrmAtlas: { value: THREE.Texture };
  undralTerrainHeightAtlas: { value: THREE.Texture };
  undralTerrainTime: { value: number };
  undralTerrainRain: { value: number };
  undralTerrainScale: { value: number };
}

function neutralTexture(value: [number, number, number, number], colorSpace: THREE.ColorSpace): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array(value), 1, 1, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Height-aware six-layer terrain material.
 *
 * Layers are stored in four atlases (base color, normal, ORM and height), so
 * the shader consumes four samplers instead of twenty-four. World-space UVs,
 * periodic gradient noise, domain warping, dual-sample stochastic variation and
 * height-biased weights suppress both tile seams and macro repetition while
 * keeping the ground compatible with the existing instanced tile renderer.
 */
export class AdvancedTerrainMaterial {
  readonly material: THREE.MeshPhysicalMaterial;
  private readonly textures: THREE.Texture[] = [];
  private shaderUniforms: TerrainShaderUniforms | null = null;
  private time = 0;
  private rain = 0;
  private terrainScale = 0.74;

  constructor(renderer: THREE.WebGLRenderer) {
    const maxAnisotropy = Math.min(16, Math.max(4, renderer.capabilities.getMaxAnisotropy()));
    const loader = typeof Image !== 'undefined' ? new THREE.TextureLoader() : null;
    const base = loader ? loader.load(TERRAIN_ATLAS_URLS.baseColor) : neutralTexture([150, 160, 135, 255], THREE.SRGBColorSpace);
    const normal = loader ? loader.load(TERRAIN_ATLAS_URLS.normal) : neutralTexture([128, 128, 255, 255], THREE.NoColorSpace);
    const orm = loader ? loader.load(TERRAIN_ATLAS_URLS.orm) : neutralTexture([255, 230, 0, 255], THREE.NoColorSpace);
    const height = loader ? loader.load(TERRAIN_ATLAS_URLS.height) : neutralTexture([128, 128, 128, 255], THREE.NoColorSpace);
    this.textures.push(base, normal, orm, height);
    for (const [texture, name, colorSpace] of [
      [base, 'base', THREE.SRGBColorSpace],
      [normal, 'normal', THREE.NoColorSpace],
      [orm, 'orm', THREE.NoColorSpace],
      [height, 'height', THREE.NoColorSpace],
    ] as const) {
      texture.name = `undral:terrain-atlas:${name}`;
      texture.colorSpace = colorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = maxAnisotropy;
    }

    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.58,
    });
    this.material.name = 'undral-advanced-layered-terrain';
    this.material.onBeforeCompile = (shader) => {
      const uniforms: TerrainShaderUniforms = {
        undralTerrainBaseAtlas: { value: base },
        undralTerrainNormalAtlas: { value: normal },
        undralTerrainOrmAtlas: { value: orm },
        undralTerrainHeightAtlas: { value: height },
        undralTerrainTime: { value: this.time },
        undralTerrainRain: { value: this.rain },
        undralTerrainScale: { value: this.terrainScale },
      };
      Object.assign(shader.uniforms, uniforms);
      this.shaderUniforms = uniforms;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vUndralTerrainWorldPosition;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvUndralTerrainWorldPosition = worldPosition.xyz;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vUndralTerrainWorldPosition;
uniform sampler2D undralTerrainBaseAtlas;
uniform sampler2D undralTerrainNormalAtlas;
uniform sampler2D undralTerrainOrmAtlas;
uniform sampler2D undralTerrainHeightAtlas;
uniform float undralTerrainTime;
uniform float undralTerrainRain;
uniform float undralTerrainScale;

float undralTerrainHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 undralTerrainGradient(vec2 p) {
  float angle = undralTerrainHash(p) * 6.28318530718;
  return vec2(cos(angle), sin(angle));
}

float undralTerrainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(undralTerrainGradient(i), f);
  float b = dot(undralTerrainGradient(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(undralTerrainGradient(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(undralTerrainGradient(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) * 0.70710678 + 0.5;
}

float undralTerrainFbm(vec2 p) {
  return undralTerrainNoise(p) * 0.58
    + undralTerrainNoise(p * 2.03 + 17.3) * 0.28
    + undralTerrainNoise(p * 4.11 - 8.7) * 0.14;
}

float undralTerrainWarpedNoise(vec2 p) {
  vec2 warp = vec2(undralTerrainFbm(p * 0.43 + 5.7), undralTerrainFbm(p * 0.43 - 13.2)) - 0.5;
  return undralTerrainFbm(p + warp * 1.65);
}

vec2 undralTerrainAtlasUv(vec2 uv, float layer) {
  const float tileSize = ${TERRAIN_ATLAS_LAYOUT.tileSize.toFixed(1)};
  const float gutter = ${TERRAIN_ATLAS_LAYOUT.gutter.toFixed(1)};
  const float cellSize = ${(TERRAIN_ATLAS_LAYOUT.tileSize + TERRAIN_ATLAS_LAYOUT.gutter * 2).toFixed(1)};
  const vec2 atlasSize = vec2(${TERRAIN_ATLAS_LAYOUT.width.toFixed(1)}, ${TERRAIN_ATLAS_LAYOUT.height.toFixed(1)});
  vec2 cell = vec2(mod(layer, ${TERRAIN_ATLAS_LAYOUT.columns.toFixed(1)}), floor(layer / ${TERRAIN_ATLAS_LAYOUT.columns.toFixed(1)}));
  vec2 localUv = fract(uv);
  localUv = mix(vec2(0.75 / tileSize), vec2(1.0 - 0.75 / tileSize), localUv);
  return (cell * cellSize + vec2(gutter) + localUv * tileSize) / atlasSize;
}

vec4 undralTerrainSample(sampler2D atlas, vec2 uv, float layer) {
  return texture2D(atlas, undralTerrainAtlasUv(uv, layer));
}

vec2 undralTerrainVariantUv(vec2 uv, float layer) {
  float variant = mod(layer, 4.0);
  vec2 centered = uv - 0.5;
  vec2 transformed;
  if (variant < 0.5) transformed = vec2(-centered.y, centered.x);
  else if (variant < 1.5) transformed = vec2(-centered.x, centered.y);
  else if (variant < 2.5) transformed = vec2(centered.y, -centered.x);
  else transformed = vec2(-centered.x, -centered.y);
  vec2 phase = vec2(
    undralTerrainHash(vec2(layer + 31.0, 17.0)),
    undralTerrainHash(vec2(layer + 73.0, 47.0))
  );
  return transformed + 0.5 + phase;
}

float undralTerrainVariantBlend(vec2 worldPosition, float layer) {
  float broad = undralTerrainWarpedNoise(worldPosition * 0.072 + vec2(layer * 7.31, layer * 3.17));
  float medium = undralTerrainWarpedNoise(worldPosition * 0.19 + vec2(layer * 11.7, 29.4));
  return smoothstep(0.18, 0.82, broad * 0.72 + medium * 0.28);
}

vec4 undralTerrainSampleDual(sampler2D atlas, vec2 uv, float layer, float blendValue) {
  vec4 primary = undralTerrainSample(atlas, uv, layer);
  vec4 variant = undralTerrainSample(atlas, undralTerrainVariantUv(uv, layer), layer);
  return mix(primary, variant, blendValue);
}

vec4 undralTerrainWeights(vec2 worldUv, vec3 tint) {
  float macroA = undralTerrainWarpedNoise(worldUv * 0.055 + 7.3);
  float macroB = undralTerrainWarpedNoise(worldUv * 0.12 + vec2(23.7, 11.9));
  float macroC = undralTerrainWarpedNoise(worldUv * 0.31 + vec2(51.1, 8.4));
  float brownBias = smoothstep(0.015, 0.22, tint.r - tint.g * 0.91);
  float greenBias = smoothstep(-0.02, 0.17, tint.g - tint.r * 0.84);
  float grass = (0.48 + greenBias * 0.68) * smoothstep(0.18, 0.78, macroA + macroC * 0.32);
  float dirt = (0.24 + brownBias * 1.22) * smoothstep(0.16, 0.92, 1.0 - macroA * 0.55 + macroB * 0.42);
  // Mud is a material-layer decision, not an always-on weather response.
  float mud = brownBias * smoothstep(0.67, 0.9, macroB) * 0.46;
  float moss = greenBias * smoothstep(0.58, 0.88, macroB * 0.7 + (1.0 - macroA) * 0.42);
  return max(vec4(grass, dirt, mud, moss), vec4(0.001));
}
`)
        .replace('#include <map_fragment>', `
// The atlas tile lookup below is a plain fract() of an affine transform of
// world position, so without this it repeats on a perfectly rigid grid —
// at typical overview distance that regularity reads as a visible checker
// rhythm even though each tile's *content* is randomized (dual-sample
// variant blend only changes orientation per cell, not the cell grid
// itself). Bend the sampling coordinate through a low-frequency, modest
// warp before it is used for texture lookups so the grid lines are no
// longer dead straight. Kept separate from vUndralTerrainWorldPosition,
// which the path-fringe logic below still needs raw/grid-locked to real
// tile edges.
vec2 undralTerrainGridWarp = (vec2(
  undralTerrainWarpedNoise(vUndralTerrainWorldPosition.xz * 0.05 + 211.0),
  undralTerrainWarpedNoise(vUndralTerrainWorldPosition.xz * 0.05 - 133.0)
) - 0.5) * 0.85;
vec2 undralTerrainSampleXZ = vUndralTerrainWorldPosition.xz + undralTerrainGridWarp;
vec2 undralTerrainUv = undralTerrainSampleXZ * undralTerrainScale;
vec3 undralTerrainTint = vec3(0.58, 0.65, 0.5);
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
  undralTerrainTint = vColor.rgb;
#endif
float undralTerrainRawPathBias = smoothstep(0.03, 0.22, undralTerrainTint.r - undralTerrainTint.g * 0.92);
vec2 undralTerrainTileUv = fract(vUndralTerrainWorldPosition.xz);
float undralTerrainEdgeDistance = 0.5 - max(abs(undralTerrainTileUv.x - 0.5), abs(undralTerrainTileUv.y - 0.5));
float undralTerrainFringeNoise = undralTerrainWarpedNoise(vUndralTerrainWorldPosition.xz * 0.9 + 73.1) - 0.5;
float undralTerrainPathFringe = smoothstep(0.015, 0.18, undralTerrainEdgeDistance + undralTerrainFringeNoise * 0.045);
float undralTerrainPathBias = undralTerrainRawPathBias * undralTerrainPathFringe;
// Fade the path-side tile edge toward a neutral grass tint. Adjacent floor
// tiles keep their own tint, so this creates a soft fringe without a second
// road mesh or a topology-dependent shader branch.
undralTerrainTint = mix(undralTerrainTint, vec3(0.53, 0.66, 0.44), undralTerrainRawPathBias * (1.0 - undralTerrainPathFringe) * 0.7);
vec4 undralTerrainW0 = undralTerrainWeights(vUndralTerrainWorldPosition.xz, undralTerrainTint);
float undralTerrainBlend0 = undralTerrainVariantBlend(vUndralTerrainWorldPosition.xz, 0.0);
float undralTerrainBlend1 = undralTerrainVariantBlend(vUndralTerrainWorldPosition.xz, 1.0);
float undralTerrainBlend2 = undralTerrainVariantBlend(vUndralTerrainWorldPosition.xz, 2.0);
float undralTerrainBlend3 = undralTerrainVariantBlend(vUndralTerrainWorldPosition.xz, 3.0);
float undralTerrainBlend4 = undralTerrainVariantBlend(vUndralTerrainWorldPosition.xz, 4.0);
float undralTerrainBlend5 = undralTerrainVariantBlend(vUndralTerrainWorldPosition.xz, 5.0);
float undralTerrainLeafNoise = undralTerrainWarpedNoise(vUndralTerrainWorldPosition.xz * 0.18 + 91.7);
float undralTerrainPebbleNoise = undralTerrainWarpedNoise(vUndralTerrainWorldPosition.xz * 0.47 + 37.2);
float undralTerrainPebbleWeight = undralTerrainPathBias * smoothstep(0.61, 0.87, undralTerrainPebbleNoise) * 0.82;
float undralTerrainLeafWeight = (1.0 - undralTerrainPathBias) * smoothstep(0.69, 0.9, undralTerrainLeafNoise) * 0.54;

float undralH0 = undralTerrainSample(undralTerrainHeightAtlas, undralTerrainUv * 0.58, 0.0).r;
float undralH1 = undralTerrainSample(undralTerrainHeightAtlas, undralTerrainUv * 0.94, 1.0).r;
float undralH2 = undralTerrainSample(undralTerrainHeightAtlas, undralTerrainUv * 0.72, 2.0).r;
float undralH3 = undralTerrainSample(undralTerrainHeightAtlas, undralTerrainUv * 0.88, 3.0).r;
float undralH4 = undralTerrainSample(undralTerrainHeightAtlas, undralTerrainUv * 1.16, 4.0).r;
float undralH5 = undralTerrainSample(undralTerrainHeightAtlas, undralTerrainUv * 0.96, 5.0).r;
vec4 undralTerrainWeightsA = max(undralTerrainW0 + (vec4(undralH0, undralH1, undralH2, undralH3) - 0.5) * 0.34, vec4(0.001));
vec2 undralTerrainWeightsB = max(vec2(undralTerrainPebbleWeight, undralTerrainLeafWeight) + (vec2(undralH4, undralH5) - 0.5) * 0.22, vec2(0.0));
float undralTerrainWeightSum = dot(undralTerrainWeightsA, vec4(1.0)) + dot(undralTerrainWeightsB, vec2(1.0));
undralTerrainWeightsA /= max(undralTerrainWeightSum, 0.001);
undralTerrainWeightsB /= max(undralTerrainWeightSum, 0.001);

vec3 undralC0 = undralTerrainSampleDual(undralTerrainBaseAtlas, undralTerrainUv * 0.58, 0.0, undralTerrainBlend0).rgb;
vec3 undralC1 = undralTerrainSampleDual(undralTerrainBaseAtlas, undralTerrainUv * 0.94, 1.0, undralTerrainBlend1).rgb;
vec3 undralC2 = undralTerrainSampleDual(undralTerrainBaseAtlas, undralTerrainUv * 0.72, 2.0, undralTerrainBlend2).rgb;
vec3 undralC3 = undralTerrainSampleDual(undralTerrainBaseAtlas, undralTerrainUv * 0.88, 3.0, undralTerrainBlend3).rgb;
vec3 undralC4 = undralTerrainSampleDual(undralTerrainBaseAtlas, undralTerrainUv * 1.16, 4.0, undralTerrainBlend4).rgb;
vec3 undralC5 = undralTerrainSampleDual(undralTerrainBaseAtlas, undralTerrainUv * 0.96, 5.0, undralTerrainBlend5).rgb;
vec3 undralTerrainColor = undralC0 * undralTerrainWeightsA.x + undralC1 * undralTerrainWeightsA.y + undralC2 * undralTerrainWeightsA.z + undralC3 * undralTerrainWeightsA.w + undralC4 * undralTerrainWeightsB.x + undralC5 * undralTerrainWeightsB.y;
float undralTerrainMacro = undralTerrainWarpedNoise(vUndralTerrainWorldPosition.xz * 0.035 + 15.4);
float undralTerrainOtherDominance = max(max(undralTerrainWeightsA.x, undralTerrainWeightsA.y), undralTerrainWeightsA.w);
float undralTerrainMudDominance = smoothstep(0.015, 0.16, undralTerrainWeightsA.z - undralTerrainOtherDominance);
float undralTerrainWetness = clamp(
  undralTerrainWeightsA.z * 0.9 * undralTerrainMudDominance
  + undralTerrainRain * smoothstep(0.74, 0.94, undralTerrainMacro) * undralTerrainMudDominance,
  0.0,
  1.0
);
undralTerrainColor *= mix(0.94, 1.06, undralTerrainMacro);
undralTerrainColor *= mix(1.0, 0.88, undralTerrainWetness);
float undralTerrainTintLuminance = dot(undralTerrainTint, vec3(0.2126, 0.7152, 0.0722));
vec3 undralTerrainTintChroma = clamp(undralTerrainTint / max(undralTerrainTintLuminance, 0.12), vec3(0.68), vec3(1.42));
// vertexColors already multiplied diffuseColor before map_fragment. Assign the
// sampled terrain here instead of multiplying it a second time; retain only a
// restrained chroma shift so per-land palettes do not compound toward black.
diffuseColor.rgb = undralTerrainColor * mix(vec3(1.0), undralTerrainTintChroma, 0.34);

vec3 undralO0 = undralTerrainSampleDual(undralTerrainOrmAtlas, undralTerrainUv * 0.58, 0.0, undralTerrainBlend0).rgb;
vec3 undralO1 = undralTerrainSampleDual(undralTerrainOrmAtlas, undralTerrainUv * 0.94, 1.0, undralTerrainBlend1).rgb;
vec3 undralO2 = undralTerrainSampleDual(undralTerrainOrmAtlas, undralTerrainUv * 0.72, 2.0, undralTerrainBlend2).rgb;
vec3 undralO3 = undralTerrainSampleDual(undralTerrainOrmAtlas, undralTerrainUv * 0.88, 3.0, undralTerrainBlend3).rgb;
vec3 undralO4 = undralTerrainSampleDual(undralTerrainOrmAtlas, undralTerrainUv * 1.16, 4.0, undralTerrainBlend4).rgb;
vec3 undralO5 = undralTerrainSampleDual(undralTerrainOrmAtlas, undralTerrainUv * 0.96, 5.0, undralTerrainBlend5).rgb;
vec3 undralTerrainOrm = undralO0 * undralTerrainWeightsA.x + undralO1 * undralTerrainWeightsA.y + undralO2 * undralTerrainWeightsA.z + undralO3 * undralTerrainWeightsA.w + undralO4 * undralTerrainWeightsB.x + undralO5 * undralTerrainWeightsB.y;
float undralTerrainAO = clamp(undralTerrainOrm.r, 0.48, 1.0);
float undralTerrainBaseRoughness = clamp(undralTerrainOrm.g - undralTerrainWetness * 0.24, 0.18, 1.0);
float undralTerrainPackedPathRoughness = clamp(0.73 + (undralTerrainPebbleNoise - 0.5) * 0.08, 0.64, 0.82);
float undralTerrainRoughness = mix(undralTerrainBaseRoughness, undralTerrainPackedPathRoughness, undralTerrainPathBias * 0.72);
`)
        .replace('#include <color_fragment>', '// Terrain tint is consumed in the custom map fragment above.')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = undralTerrainRoughness;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 undralN0 = undralTerrainSampleDual(undralTerrainNormalAtlas, undralTerrainUv * 0.58, 0.0, undralTerrainBlend0).xyz * 2.0 - 1.0;
vec3 undralN1 = undralTerrainSampleDual(undralTerrainNormalAtlas, undralTerrainUv * 0.94, 1.0, undralTerrainBlend1).xyz * 2.0 - 1.0;
vec3 undralN2 = undralTerrainSampleDual(undralTerrainNormalAtlas, undralTerrainUv * 0.72, 2.0, undralTerrainBlend2).xyz * 2.0 - 1.0;
vec3 undralN3 = undralTerrainSampleDual(undralTerrainNormalAtlas, undralTerrainUv * 0.88, 3.0, undralTerrainBlend3).xyz * 2.0 - 1.0;
vec3 undralN4 = undralTerrainSampleDual(undralTerrainNormalAtlas, undralTerrainUv * 1.16, 4.0, undralTerrainBlend4).xyz * 2.0 - 1.0;
vec3 undralN5 = undralTerrainSampleDual(undralTerrainNormalAtlas, undralTerrainUv * 0.96, 5.0, undralTerrainBlend5).xyz * 2.0 - 1.0;
vec3 undralTerrainTangentNormal = normalize(undralN0 * undralTerrainWeightsA.x + undralN1 * undralTerrainWeightsA.y + undralN2 * undralTerrainWeightsA.z + undralN3 * undralTerrainWeightsA.w + undralN4 * undralTerrainWeightsB.x + undralN5 * undralTerrainWeightsB.y);
undralTerrainTangentNormal.xy *= mix(0.72, 1.0, 1.0 - undralTerrainWetness);
vec3 undralTerrainWorldNormal = normalize(vec3(undralTerrainTangentNormal.x, undralTerrainTangentNormal.z, undralTerrainTangentNormal.y));
vec3 undralTerrainViewNormal = normalize(mat3(viewMatrix) * undralTerrainWorldNormal);
normal = normalize(mix(normal, undralTerrainViewNormal, 0.92));`)
        .replace('#include <aomap_fragment>', `
reflectedLight.indirectDiffuse *= undralTerrainAO;
#if defined(USE_ENVMAP) && defined(STANDARD)
  float undralTerrainDotNV = saturate(dot(geometryNormal, geometryViewDir));
  reflectedLight.indirectSpecular *= computeSpecularOcclusion(undralTerrainDotNV, undralTerrainAO, material.roughness);
#endif
`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat *= smoothstep(0.08, 0.78, undralTerrainWetness);
  material.clearcoatRoughness = mix(0.34, 0.08, undralTerrainWetness);
#endif`);
    };
    this.material.customProgramCacheKey = () => 'undral-advanced-terrain-v8-stylized-grass';
  }

  update(dt: number, rain: number): void {
    this.time += dt;
    this.rain = THREE.MathUtils.clamp(rain, 0, 1);
    if (this.shaderUniforms) {
      this.shaderUniforms.undralTerrainTime.value = this.time;
      this.shaderUniforms.undralTerrainRain.value = this.rain;
    }
  }

  setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.terrainScale = quality === 'low' ? 0.68 : quality === 'medium' ? 0.74 : 0.82;
    if (this.shaderUniforms) this.shaderUniforms.undralTerrainScale.value = this.terrainScale;
  }

  dispose(): void {
    this.material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.textures.length = 0;
    this.shaderUniforms = null;
  }
}
