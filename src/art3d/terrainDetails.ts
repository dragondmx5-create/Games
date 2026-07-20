import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Tile, World, inGreenZone, isSolid, tileAt } from '../world';
import { groundMaterialAt, hashXY, meadowAt } from '../render/terrainField';
import { isPathFloorVariant } from '../../server/src/world/overworldTopology';

const SHORT_GRASS_MAX = 2800;
const TALL_GRASS_MAX = 1400;
const FLOWER_MAX = 620;
const STONE_MAX = 900;
const LEAF_MAX = 900;

export interface TerrainDetailPalette {
  floor: number;
  floorAlt: number;
  rock: number;
  accent: number;
}

interface TerrainDetailProfile {
  grass: number;
  flowers: number;
  leaves: number;
}

const DETAIL_PROFILES: Record<string, TerrainDetailProfile> = {
  default: { grass: 0.66, flowers: 0.45, leaves: 0.55 },
  witchlands: { grass: 0.58, flowers: 0.5, leaves: 0.72 },
  'green-land': { grass: 1, flowers: 1, leaves: 0.86 },
  rainforest: { grass: 1.08, flowers: 0.82, leaves: 1.18 },
  frostlands: { grass: 0.34, flowers: 0.2, leaves: 0.18 },
  'sunscorched-desert': { grass: 0.18, flowers: 0.12, leaves: 0.08 },
  'cinder-coast': { grass: 0.27, flowers: 0.15, leaves: 0.24 },
};

function shiftedHex(color: number, saturation: number, lightness: number): number {
  return new THREE.Color(color).offsetHSL(0, saturation, lightness).getHex();
}

function bladeTriangle(height: number, width: number, offsetX: number, offsetZ: number, rotation: number, lean: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const rightX = c * width * 0.5;
  const rightZ = -s * width * 0.5;
  const tipX = offsetX + Math.sin(rotation) * lean;
  const tipZ = offsetZ + Math.cos(rotation) * lean;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    offsetX - rightX, 0, offsetZ - rightZ,
    offsetX + rightX, 0, offsetZ + rightZ,
    tipX, height, tipZ,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  geometry.computeVertexNormals();
  return geometry;
}

function makeGrassClusterGeometry(tall: boolean): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const count = tall ? 9 : 7;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963229728653;
    const radius = (i % 3) * (tall ? 0.045 : 0.035);
    const height = (tall ? 0.48 : 0.28) * (0.76 + ((i * 37) % 11) / 24);
    pieces.push(bladeTriangle(height, tall ? 0.07 : 0.052, Math.cos(angle) * radius, Math.sin(angle) * radius, angle + i * 0.47, tall ? 0.08 : 0.035));
  }
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  if (!merged) throw new Error('Failed to build grass cluster geometry.');
  merged.computeBoundingSphere();
  return merged;
}

function makeFlowerGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.28, 5);
  stem.translate(0, 0.14, 0);
  pieces.push(stem);
  for (let i = 0; i < 5; i++) {
    const petal = new THREE.SphereGeometry(0.055, 5, 3);
    const angle = i * Math.PI * 0.4;
    petal.scale(1.25, 0.42, 0.72);
    petal.rotateY(angle);
    petal.translate(Math.cos(angle) * 0.052, 0.3, Math.sin(angle) * 0.052);
    pieces.push(petal);
  }
  const center = new THREE.SphereGeometry(0.035, 6, 4);
  center.translate(0, 0.305, 0);
  pieces.push(center);
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  if (!merged) throw new Error('Failed to build flower geometry.');
  return merged;
}

function makeLeafGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(0.075, 5);
  geometry.rotateX(-Math.PI * 0.5);
  geometry.scale(1, 1, 0.55);
  return geometry;
}

function setInstance(mesh: THREE.InstancedMesh, index: number, matrix: THREE.Matrix4, color: THREE.Color): void {
  mesh.setMatrixAt(index, matrix);
  mesh.setColorAt(index, color);
}

/** Real geometry layer on top of the texture terrain: short/tall grass,
 * flowers, pebbles and leaf litter. Distribution is deterministic, tied to
 * the same world coordinates on every client, and quality-scaled. */
export class TerrainDetailSystem {
  readonly root = new THREE.Group();
  private readonly shortGrassGeometry = makeGrassClusterGeometry(false);
  private readonly tallGrassGeometry = makeGrassClusterGeometry(true);
  private readonly flowerGeometry = makeFlowerGeometry();
  private readonly stoneGeometry = new THREE.DodecahedronGeometry(0.13, 0);
  private readonly leafGeometry = makeLeafGeometry();
  private readonly grassMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    sheen: 0.24,
    sheenColor: new THREE.Color(0xcfe6a1),
    sheenRoughness: 0.88,
    envMapIntensity: 0.38,
  });
  private readonly tallGrassMaterial = this.grassMaterial.clone();
  private readonly flowerMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide, envMapIntensity: 0.42 });
  private readonly stoneMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.01, envMapIntensity: 0.5 });
  private readonly leafMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, clearcoat: 0.06, clearcoatRoughness: 0.62, envMapIntensity: 0.34 });
  private readonly shortGrass = new THREE.InstancedMesh(this.shortGrassGeometry, this.grassMaterial, SHORT_GRASS_MAX);
  private readonly tallGrass = new THREE.InstancedMesh(this.tallGrassGeometry, this.tallGrassMaterial, TALL_GRASS_MAX);
  private readonly flowers = new THREE.InstancedMesh(this.flowerGeometry, this.flowerMaterial, FLOWER_MAX);
  private readonly stones = new THREE.InstancedMesh(this.stoneGeometry, this.stoneMaterial, STONE_MAX);
  private readonly leaves = new THREE.InstancedMesh(this.leafGeometry, this.leafMaterial, LEAF_MAX);
  private readonly dummy = new THREE.Object3D();
  private readonly windUniforms: Array<{ value: number }> = [];
  private readonly color = new THREE.Color();
  private quality: 'low' | 'medium' | 'high' = 'medium';

  constructor() {
    this.root.name = 'terrain-detail-system';
    this.installWind(this.grassMaterial, 0.035, 1.35);
    this.installWind(this.tallGrassMaterial, 0.085, 1.05);
    this.installWind(this.flowerMaterial, 0.028, 1.18);
    this.root.add(this.shortGrass, this.tallGrass, this.flowers, this.stones, this.leaves);
    for (const mesh of [this.shortGrass, this.tallGrass, this.flowers, this.stones, this.leaves]) {
      mesh.count = 0;
      mesh.castShadow = mesh === this.stones;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }

  private installWind(material: THREE.Material, amplitude: number, speed: number): void {
    const time = { value: 0 };
    this.windUniforms.push(time);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.undralWindTime = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float undralWindTime;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n#ifdef USE_INSTANCING\n  float undralPhase = instanceMatrix[3].x * 0.73 + instanceMatrix[3].z * 1.17;\n#else\n  float undralPhase = position.x * 0.73 + position.z * 1.17;\n#endif\n  float undralBladeMask = smoothstep(0.02, 0.5, position.y);\n  float undralGust = sin(undralWindTime * ${speed.toFixed(3)} + undralPhase) * 0.68 + sin(undralWindTime * ${(speed * 2.17).toFixed(3)} + undralPhase * 1.71) * 0.32;\n  transformed.x += undralGust * ${amplitude.toFixed(4)} * undralBladeMask;\n  transformed.z += cos(undralWindTime * ${(speed * 0.83).toFixed(3)} + undralPhase) * ${(amplitude * 0.42).toFixed(4)} * undralBladeMask;`);
    };
    material.customProgramCacheKey = () => `undral-wind-${amplitude}-${speed}`;
    material.needsUpdate = true;
  }

  setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.quality = quality;
    this.stones.castShadow = quality === 'high';
  }

  rebuild(
    world: World,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    heightAt: (tx: number, ty: number) => number,
    palette: TerrainDetailPalette,
  ): void {
    const qualityDensity = this.quality === 'low' ? 0.34 : this.quality === 'medium' ? 0.68 : 1;
    const profile = DETAIL_PROFILES[world.profile?.landId ?? 'default'] ?? DETAIL_PROFILES.default;
    const grassDensity = qualityDensity * profile.grass;
    const flowerDensity = qualityDensity * profile.flowers;
    const leafDensity = qualityDensity * profile.leaves;
    const biomeShortGrass = shiftedHex(palette.floor, 0.07, 0.1);
    const biomeTallGrass = shiftedHex(palette.floorAlt, 0.09, 0.16);
    const biomeStoneA = shiftedHex(palette.rock, -0.03, 0.08);
    const biomeStoneB = shiftedHex(palette.rock, 0.02, -0.02);
    const biomeLeafA = shiftedHex(palette.floorAlt, 0.02, -0.08);
    const biomeLeafB = shiftedHex(palette.accent, -0.16, -0.2);
    const flowerColors = [shiftedHex(palette.accent, 0, 0.05), 0xd9d5f2, 0xf0bb65, 0xe9ece3];
    let shortCount = 0;
    let tallCount = 0;
    let flowerCount = 0;
    let stoneCount = 0;
    let leafCount = 0;

    const place = (mesh: THREE.InstancedMesh, index: number, tx: number, ty: number, salt: number, yOffset: number, baseScale: number, color: number): void => {
      const rx = hashXY(tx * 31 + salt * 13, ty * 17 - salt * 7);
      const rz = hashXY(tx * 11 - salt * 19, ty * 29 + salt * 5);
      const scale = baseScale * (0.72 + hashXY(tx * 43 + salt, ty * 47 - salt) * 0.56);
      this.dummy.position.set(tx + 0.1 + rx * 0.8, heightAt(tx, ty) + yOffset, ty + 0.1 + rz * 0.8);
      this.dummy.rotation.set(0, hashXY(tx * 61 + salt, ty * 67) * Math.PI * 2, 0);
      this.dummy.scale.set(scale * (0.82 + rx * 0.28), scale, scale * (0.82 + rz * 0.28));
      this.dummy.updateMatrix();
      this.color.setHex(color).offsetHSL((rx - 0.5) * 0.035, (rz - 0.5) * 0.08, (rx + rz - 1) * 0.06);
      setInstance(mesh, index, this.dummy.matrix, this.color);
    };

    const houseTiles = new Set<number>();
    for (const house of world.houses ?? []) {
      for (let ty = Math.max(minY, house.y0); ty <= Math.min(maxY, house.y1); ty++) {
        for (let tx = Math.max(minX, house.x0); tx <= Math.min(maxX, house.x1); tx++) {
          houseTiles.add(ty * world.w + tx);
        }
      }
    }
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const tile = tileAt(world, tx, ty);
        if (tile === Tile.Water || isSolid(tile)) continue;
        if (houseTiles.has(ty * world.w + tx)) continue;
        const material = groundMaterialAt(tx, ty);
        const greenZone = inGreenZone(world, tx, ty);
        const green = material === 0 || greenZone;
        const meadow = green && meadowAt(tx, ty);
        const pathLike = isPathFloorVariant(world.floorVariant[ty * world.w + tx] ?? 0) || tile === Tile.Farmland;
        const seed = hashXY(tx, ty);
        const shortGrassColor = greenZone ? 0x63833c : biomeShortGrass;
        const tallGrassColor = greenZone ? 0x718d3f : biomeTallGrass;

        if (green && !pathLike) {
          const blades = meadow ? 3 : 2;
          for (let i = 0; i < blades && shortCount < SHORT_GRASS_MAX; i++) {
            if (hashXY(tx * 7 + i * 19, ty * 13 - i * 11) > grassDensity * (meadow ? 0.98 : 0.76)) continue;
            place(this.shortGrass, shortCount++, tx, ty, i + 1, 0.015, meadow ? 1.08 : 0.82, meadow ? tallGrassColor : shortGrassColor);
          }
          if (meadow && tallCount < TALL_GRASS_MAX && hashXY(tx * 23, ty * 31) < grassDensity * 0.52) {
            place(this.tallGrass, tallCount++, tx, ty, 9, 0.015, 0.92, tallGrassColor);
          }
          if (flowerCount < FLOWER_MAX && hashXY(tx * 41, ty * 37) < flowerDensity * (meadow ? 0.16 : 0.055)) {
            place(this.flowers, flowerCount++, tx, ty, 15, 0.018, 0.72, flowerColors[Math.floor(seed * flowerColors.length) % flowerColors.length]);
          }
          if (leafCount < LEAF_MAX && hashXY(tx * 73, ty * 79) < leafDensity * 0.19) {
            place(this.leaves, leafCount++, tx, ty, 21, 0.02, 0.88, seed > 0.52 ? biomeLeafA : biomeLeafB);
          }
        }

        if ((pathLike || material !== 0) && stoneCount < STONE_MAX && hashXY(tx * 53, ty * 59) < qualityDensity * 0.22) {
          place(this.stones, stoneCount++, tx, ty, 27, 0.075, pathLike ? 0.72 : 0.58, seed > 0.5 ? biomeStoneA : biomeStoneB);
        }
      }
    }

    for (const [mesh, count] of [[this.shortGrass, shortCount], [this.tallGrass, tallCount], [this.flowers, flowerCount], [this.stones, stoneCount], [this.leaves, leafCount]] as const) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (count > 0) {
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
      }
    }
  }

  update(time: number): void {
    for (const uniform of this.windUniforms) uniform.value = time;
  }

  dispose(): void {
    this.shortGrassGeometry.dispose();
    this.tallGrassGeometry.dispose();
    this.flowerGeometry.dispose();
    this.stoneGeometry.dispose();
    this.leafGeometry.dispose();
    this.grassMaterial.dispose();
    this.tallGrassMaterial.dispose();
    this.flowerMaterial.dispose();
    this.stoneMaterial.dispose();
    this.leafMaterial.dispose();
  }
}
