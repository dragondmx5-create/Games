import * as THREE from 'three';
import { PBR_TEXTURE_URLS, type PbrTextureUrls } from './pbrTextureManifest';

export type SurfaceKind =
  | 'wood'
  | 'plaster'
  | 'stone'
  | 'roof'
  | 'metal'
  | 'cloth'
  | 'leather'
  | 'ground'
  | 'grass'
  | 'dirt'
  | 'mud'
  | 'moss'
  | 'pebble'
  | 'leaflitter'
  | 'foliage'
  | 'hair'
  | 'fur'
  | 'crystal'
  | 'skin'
  | 'plain';

export interface StylizedMaterialOptions {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  flatShading?: boolean;
}

interface SurfaceShaderUniforms {
  uvMatrix: { value: THREE.Matrix2 };
  uvOffset: { value: THREE.Vector2 };
}

export interface SurfaceUvTransform {
  matrix: THREE.Matrix2;
  offset: THREE.Vector2;
}

export function surfaceUvTransform(seed?: number): SurfaceUvTransform {
  if (seed === undefined) return { matrix: new THREE.Matrix2().identity(), offset: new THREE.Vector2() };
  let value = seed >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  const variant = value & 7;
  const rotation = variant & 3;
  const mirror = (variant & 4) !== 0 ? -1 : 1;
  const matrices: Array<[number, number, number, number]> = [
    [mirror, 0, 0, 1],
    [0, -1, mirror, 0],
    [-mirror, 0, 0, -1],
    [0, 1, -mirror, 0],
  ];
  const [a, b, c, d] = matrices[rotation];
  const phaseU = ((value >>> 8) & 255) / 256;
  const phaseV = ((value >>> 16) & 255) / 256;
  return { matrix: new THREE.Matrix2().set(a, b, c, d), offset: new THREE.Vector2(phaseU, phaseV) };
}

interface RuntimeTextureSet {
  baseColor: THREE.Texture;
  normal: THREE.Texture;
  orm: THREE.Texture;
}

interface SurfaceProfile {
  roughness: number;
  metalness: number;
  flatShading: boolean;
  normalScale: number;
  aoIntensity: number;
  envMapIntensity: number;
  macroVariation: number;
  detailNormal: number;
  detailRoughness: number;
  physical?: 'cloth' | 'leather' | 'crystal' | 'metal' | 'skin' | 'hair' | 'fur';
}

const SURFACE_PROFILES: Record<SurfaceKind, SurfaceProfile> = {
  wood: { roughness: 0.84, metalness: 0.01, flatShading: false, normalScale: 0.72, aoIntensity: 0.82, envMapIntensity: 0.78, macroVariation: 0.09, detailNormal: 0.18, detailRoughness: 0.08 },
  plaster: { roughness: 0.95, metalness: 0, flatShading: false, normalScale: 0.46, aoIntensity: 0.72, envMapIntensity: 0.45, macroVariation: 0.065, detailNormal: 0.1, detailRoughness: 0.055 },
  stone: { roughness: 0.9, metalness: 0.02, flatShading: true, normalScale: 0.86, aoIntensity: 0.92, envMapIntensity: 0.58, macroVariation: 0.1, detailNormal: 0.2, detailRoughness: 0.1 },
  roof: { roughness: 0.78, metalness: 0.04, flatShading: true, normalScale: 0.82, aoIntensity: 0.92, envMapIntensity: 0.68, macroVariation: 0.075, detailNormal: 0.17, detailRoughness: 0.08 },
  metal: { roughness: 0.34, metalness: 0.82, flatShading: false, normalScale: 0.28, aoIntensity: 0.48, envMapIntensity: 1.28, macroVariation: 0.025, detailNormal: 0.08, detailRoughness: 0.07, physical: 'metal' },
  cloth: { roughness: 0.92, metalness: 0, flatShading: false, normalScale: 0.58, aoIntensity: 0.6, envMapIntensity: 0.42, macroVariation: 0.03, detailNormal: 0.24, detailRoughness: 0.11, physical: 'cloth' },
  leather: { roughness: 0.72, metalness: 0.02, flatShading: false, normalScale: 0.52, aoIntensity: 0.67, envMapIntensity: 0.62, macroVariation: 0.032, detailNormal: 0.21, detailRoughness: 0.09, physical: 'leather' },
  ground: { roughness: 0.98, metalness: 0, flatShading: false, normalScale: 0.96, aoIntensity: 0.78, envMapIntensity: 0.38, macroVariation: 0.13, detailNormal: 0.23, detailRoughness: 0.1 },
  grass: { roughness: 0.9, metalness: 0, flatShading: false, normalScale: 0.78, aoIntensity: 0.72, envMapIntensity: 0.4, macroVariation: 0.115, detailNormal: 0.2, detailRoughness: 0.08 },
  dirt: { roughness: 0.96, metalness: 0, flatShading: false, normalScale: 0.92, aoIntensity: 0.8, envMapIntensity: 0.34, macroVariation: 0.125, detailNormal: 0.22, detailRoughness: 0.09 },
  mud: { roughness: 0.64, metalness: 0, flatShading: false, normalScale: 0.6, aoIntensity: 0.76, envMapIntensity: 0.72, macroVariation: 0.11, detailNormal: 0.12, detailRoughness: 0.06, physical: 'leather' },
  moss: { roughness: 0.96, metalness: 0, flatShading: false, normalScale: 0.78, aoIntensity: 0.78, envMapIntensity: 0.3, macroVariation: 0.12, detailNormal: 0.18, detailRoughness: 0.07 },
  pebble: { roughness: 0.86, metalness: 0.01, flatShading: false, normalScale: 0.96, aoIntensity: 0.9, envMapIntensity: 0.52, macroVariation: 0.095, detailNormal: 0.24, detailRoughness: 0.08 },
  leaflitter: { roughness: 0.93, metalness: 0, flatShading: false, normalScale: 0.7, aoIntensity: 0.82, envMapIntensity: 0.34, macroVariation: 0.13, detailNormal: 0.16, detailRoughness: 0.08 },
  foliage: { roughness: 0.86, metalness: 0, flatShading: true, normalScale: 0.45, aoIntensity: 0.56, envMapIntensity: 0.48, macroVariation: 0.095, detailNormal: 0.08, detailRoughness: 0.05 },
  hair: { roughness: 0.56, metalness: 0, flatShading: false, normalScale: 0.52, aoIntensity: 0.58, envMapIntensity: 0.72, macroVariation: 0.025, detailNormal: 0.2, detailRoughness: 0.07, physical: 'hair' },
  fur: { roughness: 0.82, metalness: 0, flatShading: false, normalScale: 0.66, aoIntensity: 0.64, envMapIntensity: 0.42, macroVariation: 0.045, detailNormal: 0.25, detailRoughness: 0.09, physical: 'fur' },
  crystal: { roughness: 0.22, metalness: 0.08, flatShading: true, normalScale: 0.3, aoIntensity: 0.25, envMapIntensity: 1.55, macroVariation: 0.025, detailNormal: 0.055, detailRoughness: 0.035, physical: 'crystal' },
  skin: { roughness: 0.68, metalness: 0, flatShading: false, normalScale: 0.22, aoIntensity: 0.42, envMapIntensity: 0.46, macroVariation: 0.018, detailNormal: 0.045, detailRoughness: 0.03, physical: 'skin' },
  plain: { roughness: 0.75, metalness: 0.02, flatShading: false, normalScale: 0, aoIntensity: 0, envMapIntensity: 0.62, macroVariation: 0, detailNormal: 0, detailRoughness: 0 },
};

function colorKey(color: number): string {
  return color.toString(16).padStart(6, '0');
}

function makeFallbackTexture(color: [number, number, number, number], colorSpace: THREE.ColorSpace): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array(color), 1, 1, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Production-oriented PBR material library.
 *
 * Runtime materials use a compact three-texture set per surface:
 * - Base Color (sRGB)
 * - Tangent-space Normal (linear data)
 * - ORM packed map: AO in R, Roughness in G, Metallic in B
 *
 * A subtle world-space macro pass breaks obvious texture repetition without
 * making the surfaces noisy. Geometry-level UV projection in ModelingToolkit
 * keeps texel density stable across modular pieces.
 */
export class StylizedMaterialLibrary {
  private readonly textureCache = new Map<Exclude<SurfaceKind, 'plain'>, RuntimeTextureSet>();
  private readonly materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly maxAnisotropy: number;
  private readonly textureLoader: THREE.TextureLoader | null;
  private readonly ownedFallbacks: THREE.Texture[] = [];
  private readonly shaderUniforms = new WeakMap<THREE.Material, Set<SurfaceShaderUniforms>>();

  constructor(renderer: THREE.WebGLRenderer) {
    this.maxAnisotropy = Math.min(12, Math.max(2, renderer.capabilities.getMaxAnisotropy()));
    this.textureLoader = typeof Image !== 'undefined' ? new THREE.TextureLoader() : null;
  }

  material(kind: SurfaceKind, color: number, options: StylizedMaterialOptions = {}): THREE.MeshStandardMaterial {
    const profile = SURFACE_PROFILES[kind];
    const roughness = options.roughness ?? profile.roughness;
    const metalness = options.metalness ?? profile.metalness;
    const emissive = options.emissive ?? 0;
    const emissiveIntensity = options.emissiveIntensity ?? (emissive ? 0.7 : 0);
    const opacity = options.opacity ?? 1;
    const transparent = options.transparent ?? opacity < 1;
    const side = options.side ?? THREE.FrontSide;
    const flatShading = options.flatShading ?? profile.flatShading;
    const key = [kind, colorKey(color), roughness, metalness, emissive, emissiveIntensity, opacity, transparent ? 1 : 0, side, flatShading ? 1 : 0].join(':');
    const cached = this.materialCache.get(key);
    if (cached) return cached;

    const common: THREE.MeshStandardMaterialParameters = {
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity,
      transparent,
      opacity,
      side,
      flatShading,
      envMapIntensity: profile.envMapIntensity,
    };
    let material: THREE.MeshStandardMaterial;
    if (profile.physical === 'cloth') {
      material = new THREE.MeshPhysicalMaterial({
        ...common,
        sheen: 0.58,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.22),
        sheenRoughness: 0.78,
        specularIntensity: 0.38,
      });
    } else if (profile.physical === 'leather') {
      material = new THREE.MeshPhysicalMaterial({
        ...common,
        clearcoat: kind === 'mud' ? 0.34 : 0.2,
        clearcoatRoughness: kind === 'mud' ? 0.22 : 0.58,
        specularIntensity: 0.52,
        ior: 1.48,
      });
    } else if (profile.physical === 'metal') {
      material = new THREE.MeshPhysicalMaterial({
        ...common,
        anisotropy: 0.56,
        anisotropyRotation: Math.PI * 0.5,
        clearcoat: 0.08,
        clearcoatRoughness: 0.28,
      });
    } else if (profile.physical === 'hair') {
      material = new THREE.MeshPhysicalMaterial({
        ...common,
        anisotropy: 0.72,
        anisotropyRotation: Math.PI * 0.5,
        sheen: 0.2,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.12),
        sheenRoughness: 0.64,
      });
    } else if (profile.physical === 'fur') {
      material = new THREE.MeshPhysicalMaterial({
        ...common,
        sheen: 0.34,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffe5c2), 0.18),
        sheenRoughness: 0.82,
        specularIntensity: 0.3,
      });
    } else if (profile.physical === 'skin') {
      material = new THREE.MeshPhysicalMaterial({
        ...common,
        specularIntensity: 0.34,
        specularColor: new THREE.Color(0xffd8c8),
        ior: 1.42,
        sheen: 0.06,
        sheenColor: new THREE.Color(0xffb599),
        sheenRoughness: 0.9,
      });
    } else if (profile.physical === 'crystal') {
      material = new THREE.MeshPhysicalMaterial({
        ...common,
        clearcoat: 0.88,
        clearcoatRoughness: 0.1,
        transmission: transparent ? 0.32 : 0.08,
        ior: 1.46,
        thickness: 0.42,
        attenuationDistance: 2.4,
        attenuationColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35),
        iridescence: 0.24,
        iridescenceIOR: 1.34,
        iridescenceThicknessRange: [120, 520],
        dispersion: transparent ? 0.18 : 0.04,
      });
    } else {
      material = new THREE.MeshStandardMaterial(common);
    }

    if (kind !== 'plain') {
      const textures = this.textures(kind);
      material.map = textures.baseColor;
      material.normalMap = textures.normal;
      material.normalScale.setScalar(profile.normalScale);
      material.aoMap = textures.orm;
      material.aoMapIntensity = profile.aoIntensity;
      material.roughnessMap = textures.orm;
      material.metalnessMap = textures.orm;
    }

    this.applySurfaceVariation(material, kind, profile.macroVariation, profile.detailNormal, profile.detailRoughness);
    material.name = `undral-pbr:${kind}:${colorKey(color)}`;
    material.needsUpdate = true;
    this.materialCache.set(key, material);
    return material;
  }

  bindSurfaceVariant(mesh: THREE.Mesh, seed?: number): void {
    const transform = surfaceUvTransform(seed);
    mesh.userData.undralSurfaceVariant = seed;
    const previous = mesh.onBeforeRender;
    mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      previous.call(mesh, renderer, scene, camera, geometry, material, group);
      const materials = Array.isArray(material) ? material : [material];
      for (const value of materials) {
        const uniforms = this.shaderUniforms.get(value);
        if (!uniforms) continue;
        for (const uniform of uniforms) {
          uniform.uvMatrix.value.fromArray(transform.matrix.elements);
          uniform.uvOffset.value.copy(transform.offset);
        }
      }
    };
  }

  private textures(kind: Exclude<SurfaceKind, 'plain'>): RuntimeTextureSet {
    const cached = this.textureCache.get(kind);
    if (cached) return cached;
    const urls = PBR_TEXTURE_URLS[kind];
    const set = this.textureLoader ? this.loadTextureSet(kind, urls) : this.makeFallbackSet(kind);
    this.textureCache.set(kind, set);
    return set;
  }

  private loadTextureSet(kind: Exclude<SurfaceKind, 'plain'>, urls: PbrTextureUrls): RuntimeTextureSet {
    const baseColor = this.textureLoader!.load(urls.baseColor);
    const normal = this.textureLoader!.load(urls.normal);
    const orm = this.textureLoader!.load(urls.orm);
    this.configureTexture(baseColor, `${kind}:baseColor`, THREE.SRGBColorSpace);
    this.configureTexture(normal, `${kind}:normal`, THREE.NoColorSpace);
    this.configureTexture(orm, `${kind}:orm`, THREE.NoColorSpace);
    return { baseColor, normal, orm };
  }

  private makeFallbackSet(kind: Exclude<SurfaceKind, 'plain'>): RuntimeTextureSet {
    const baseColor = makeFallbackTexture([238, 238, 238, 255], THREE.SRGBColorSpace);
    const normal = makeFallbackTexture([128, 128, 255, 255], THREE.NoColorSpace);
    const metal = kind === 'metal' ? 220 : kind === 'crystal' ? 24 : 0;
    const rough = Math.round(SURFACE_PROFILES[kind].roughness * 255);
    const orm = makeFallbackTexture([255, rough, metal, 255], THREE.NoColorSpace);
    this.configureTexture(baseColor, `${kind}:baseColor:fallback`, THREE.SRGBColorSpace);
    this.configureTexture(normal, `${kind}:normal:fallback`, THREE.NoColorSpace);
    this.configureTexture(orm, `${kind}:orm:fallback`, THREE.NoColorSpace);
    this.ownedFallbacks.push(baseColor, normal, orm);
    return { baseColor, normal, orm };
  }

  private configureTexture(texture: THREE.Texture, name: string, colorSpace: THREE.ColorSpace): void {
    texture.name = `undral:${name}`;
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.maxAnisotropy;
    texture.generateMipmaps = true;
  }

  private applySurfaceVariation(
    material: THREE.MeshStandardMaterial,
    kind: SurfaceKind,
    macroStrength: number,
    detailNormal: number,
    detailRoughness: number,
  ): void {
    if (macroStrength <= 0 && detailNormal <= 0 && detailRoughness <= 0) return;
    material.onBeforeCompile = (shader) => {
      const surfaceUniforms: SurfaceShaderUniforms = {
        uvMatrix: { value: new THREE.Matrix2().identity() },
        uvOffset: { value: new THREE.Vector2() },
      };
      shader.uniforms.undralUvMatrix = surfaceUniforms.uvMatrix;
      shader.uniforms.undralUvOffset = surfaceUniforms.uvOffset;
      const registered = this.shaderUniforms.get(material) ?? new Set<SurfaceShaderUniforms>();
      registered.add(surfaceUniforms);
      this.shaderUniforms.set(material, registered);
      shader.uniforms.undralMacroStrength = { value: macroStrength };
      shader.uniforms.undralDetailNormal = { value: detailNormal };
      shader.uniforms.undralDetailRoughness = { value: detailRoughness };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
varying vec3 vUndralWorldPosition;
uniform mat2 undralUvMatrix;
uniform vec2 undralUvOffset;
vec2 undralTransformUv(vec2 value) { return undralUvMatrix * (value - 0.5) + 0.5 + undralUvOffset; }`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = undralTransformUv(vMapUv);
#endif
#ifdef USE_AOMAP
  vAoMapUv = undralTransformUv(vAoMapUv);
#endif
#ifdef USE_NORMALMAP
  vNormalMapUv = undralTransformUv(vNormalMapUv);
#endif
#ifdef USE_METALNESSMAP
  vMetalnessMapUv = undralTransformUv(vMetalnessMapUv);
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv = undralTransformUv(vRoughnessMapUv);
#endif`)
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvUndralWorldPosition = worldPosition.xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vUndralWorldPosition;
uniform float undralMacroStrength;
uniform float undralDetailNormal;
uniform float undralDetailRoughness;
float undralHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2 undralGradient(vec2 p) { float angle = undralHash(p) * 6.28318530718; return vec2(cos(angle), sin(angle)); }
float undralNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 s = f*f*f*(f*(f*6.0-15.0)+10.0);
  float a = dot(undralGradient(i), f);
  float b = dot(undralGradient(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(undralGradient(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(undralGradient(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y) * 0.70710678 + 0.5;
}
float undralFbm(vec2 p) { return undralNoise(p) * 0.58 + undralNoise(p * 2.03 + 17.3) * 0.28 + undralNoise(p * 4.11 - 8.7) * 0.14; }
float undralWarpedNoise(vec2 p) {
  vec2 warp = vec2(undralFbm(p * 0.43 + 5.7), undralFbm(p * 0.43 - 13.2)) - 0.5;
  return undralFbm(p + warp * 1.65);
}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float undralMacro = undralWarpedNoise(vUndralWorldPosition.xz * 0.24) * 0.72 + undralWarpedNoise(vUndralWorldPosition.xz * 0.71 + 19.7) * 0.28;
diffuseColor.rgb *= 1.0 + (undralMacro - 0.5) * undralMacroStrength;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 undralMicroNormal = texture2D(normalMap, vNormalMapUv * 4.13 + vec2(0.173, 0.619)).xyz * 2.0 - 1.0;
  undralMicroNormal.xy *= normalScale;
  vec2 undralCombinedXY = mapN.xy + undralMicroNormal.xy * undralDetailNormal;
  float undralCombinedZ = sqrt(saturate(1.0 - dot(undralCombinedXY, undralCombinedXY)));
  normal = normalize(tbn * vec3(undralCombinedXY, undralCombinedZ));
#endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef USE_ROUGHNESSMAP
  float undralMicroRoughness = texture2D(roughnessMap, vRoughnessMapUv * 3.71 + vec2(0.411, 0.237)).g;
  roughnessFactor = clamp(roughnessFactor + (undralMicroRoughness - 0.5) * undralDetailRoughness, 0.04, 1.0);
#endif
roughnessFactor = clamp(roughnessFactor + (undralMacro - 0.5) * undralMacroStrength * 0.42, 0.04, 1.0);`);
    };
    material.customProgramCacheKey = () => `undral-pbr-surface:${kind}:${macroStrength.toFixed(4)}:${detailNormal.toFixed(4)}:${detailRoughness.toFixed(4)}`;
  }

  dispose(): void {
    for (const material of this.materialCache.values()) material.dispose();
    for (const set of this.textureCache.values()) {
      set.baseColor.dispose();
      set.normal.dispose();
      set.orm.dispose();
    }
    for (const texture of this.ownedFallbacks) texture.dispose();
    this.materialCache.clear();
    this.textureCache.clear();
    this.ownedFallbacks.length = 0;
  }
}
