import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceUvTransform, type StylizedMaterialLibrary, type StylizedMaterialOptions, type SurfaceKind } from './materials';

export interface PrimitiveOptions {
  rotation?: [number, number, number];
  outline?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  name?: string;
}

export interface MaterialSpec extends StylizedMaterialOptions {
  kind: SurfaceKind;
  color: number;
}

const UP = new THREE.Vector3(0, 1, 0);

function keyNumber(value: number): string {
  return value.toFixed(4);
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function surfaceSeed(
  parent: THREE.Object3D,
  position: [number, number, number],
  material: MaterialSpec,
  options: PrimitiveOptions,
): number {
  let hash = material.color ^ hashText(material.kind) ^ hashText(options.name ?? parent.name ?? 'mesh');
  hash ^= Math.imul(Math.round(position[0] * 97), 0x9e3779b1);
  hash ^= Math.imul(Math.round(position[1] * 89), 0x85ebca77);
  hash ^= Math.imul(Math.round(position[2] * 83), 0xc2b2ae3d);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function bakeUvTransform(geometry: THREE.BufferGeometry, seed: number): void {
  const transform = surfaceUvTransform(seed);
  for (const attributeName of ['uv', 'uv1'] as const) {
    const attribute = geometry.getAttribute(attributeName);
    if (!attribute) continue;
    for (let i = 0; i < attribute.count; i++) {
      const x = attribute.getX(i) - 0.5;
      const y = attribute.getY(i) - 0.5;
      attribute.setXY(
        i,
        transform.matrix.elements[0] * x + transform.matrix.elements[2] * y + 0.5 + transform.offset.x,
        transform.matrix.elements[1] * x + transform.matrix.elements[3] * y + 0.5 + transform.offset.y,
      );
    }
    attribute.needsUpdate = true;
  }
}

function ensureUv1(geometry: THREE.BufferGeometry): void {
  const uv = geometry.getAttribute('uv');
  if (!uv || geometry.getAttribute('uv1')) return;
  geometry.setAttribute('uv1', uv.clone());
}

function scaleExistingUvs(geometry: THREE.BufferGeometry, scaleU: number, scaleV: number): void {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * Math.max(0.25, scaleU), uv.getY(i) * Math.max(0.25, scaleV));
  }
  uv.needsUpdate = true;
  ensureUv1(geometry);
}

/** Box projection keeps a stable world-like texel density on modular pieces.
 * Rounded boxes and extrusions otherwise map every face into 0..1 UV space,
 * stretching the same texture across both tiny props and entire walls. */
function applyBoxProjectedUvs(geometry: THREE.BufferGeometry, texelsPerUnit = 1.15): void {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    let u: number;
    let v: number;
    if (ax >= ay && ax >= az) {
      u = z * texelsPerUnit * (nx >= 0 ? -1 : 1);
      v = y * texelsPerUnit;
    } else if (ay >= ax && ay >= az) {
      u = x * texelsPerUnit;
      v = z * texelsPerUnit * (ny >= 0 ? 1 : -1);
    } else {
      u = x * texelsPerUnit * (nz >= 0 ? 1 : -1);
      v = y * texelsPerUnit;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  ensureUv1(geometry);
}

export class ModelingToolkit {
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly edgeCache = new Map<string, THREE.EdgesGeometry>();
  private readonly outlineMaterial = new THREE.LineBasicMaterial({ color: 0x171311, transparent: true, opacity: 0.74, depthWrite: false });

  constructor(private readonly materials: StylizedMaterialLibrary) {}

  group(name?: string): THREE.Group {
    const group = new THREE.Group();
    if (name) group.name = name;
    return group;
  }

  box(
    parent: THREE.Object3D,
    size: [number, number, number],
    position: [number, number, number],
    material: MaterialSpec,
    options: PrimitiveOptions = {},
    radius = 0.045,
  ): THREE.Mesh {
    const [width, height, depth] = size;
    const safeRadius = Math.min(radius, Math.min(width, height, depth) * 0.22);
    const key = `roundedBox:${keyNumber(width)}:${keyNumber(height)}:${keyNumber(depth)}:${keyNumber(safeRadius)}`;
    const geometry = this.geometry(key, () => {
      const value = new RoundedBoxGeometry(width, height, depth, 1, safeRadius);
      applyBoxProjectedUvs(value);
      return value;
    });
    return this.addMesh(parent, geometry, position, material, options);
  }

  cylinder(
    parent: THREE.Object3D,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number,
    position: [number, number, number],
    material: MaterialSpec,
    options: PrimitiveOptions = {},
  ): THREE.Mesh {
    const key = `cylinder:${keyNumber(radiusTop)}:${keyNumber(radiusBottom)}:${keyNumber(height)}:${segments}`;
    const geometry = this.geometry(key, () => {
      const value = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
      scaleExistingUvs(value, Math.max(radiusTop, radiusBottom) * Math.PI * 1.45, height * 0.9);
      return value;
    });
    return this.addMesh(parent, geometry, position, material, options);
  }

  sphere(
    parent: THREE.Object3D,
    radius: number,
    segments: number,
    position: [number, number, number],
    material: MaterialSpec,
    options: PrimitiveOptions & { scale?: [number, number, number] } = {},
  ): THREE.Mesh {
    const key = `sphere:${keyNumber(radius)}:${segments}`;
    const geometry = this.geometry(key, () => {
      const value = new THREE.SphereGeometry(radius, segments, Math.max(5, Math.floor(segments * 0.7)));
      scaleExistingUvs(value, Math.max(0.7, radius * Math.PI * 1.35), Math.max(0.7, radius * Math.PI * 0.78));
      return value;
    });
    const mesh = this.addMesh(parent, geometry, position, material, options);
    if (options.scale) mesh.scale.set(...options.scale);
    return mesh;
  }

  cone(
    parent: THREE.Object3D,
    radius: number,
    height: number,
    segments: number,
    position: [number, number, number],
    material: MaterialSpec,
    options: PrimitiveOptions = {},
  ): THREE.Mesh {
    const key = `cone:${keyNumber(radius)}:${keyNumber(height)}:${segments}`;
    const geometry = this.geometry(key, () => {
      const value = new THREE.ConeGeometry(radius, height, segments);
      scaleExistingUvs(value, Math.max(0.7, radius * Math.PI * 1.4), Math.max(0.7, height * 0.82));
      return value;
    });
    return this.addMesh(parent, geometry, position, material, options);
  }

  torus(
    parent: THREE.Object3D,
    radius: number,
    tube: number,
    radialSegments: number,
    tubularSegments: number,
    position: [number, number, number],
    material: MaterialSpec,
    options: PrimitiveOptions = {},
  ): THREE.Mesh {
    const key = `torus:${keyNumber(radius)}:${keyNumber(tube)}:${radialSegments}:${tubularSegments}`;
    const geometry = this.geometry(key, () => {
      const value = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments);
      scaleExistingUvs(value, Math.max(0.8, radius * Math.PI * 1.2), 1);
      return value;
    });
    return this.addMesh(parent, geometry, position, material, options);
  }

  extrudedShape(
    parent: THREE.Object3D,
    shape: THREE.Shape,
    cacheKey: string,
    depth: number,
    position: [number, number, number],
    material: MaterialSpec,
    options: PrimitiveOptions = {},
  ): THREE.Mesh {
    const key = `extrude:${cacheKey}:${keyNumber(depth)}`;
    const geometry = this.geometry(key, () => {
      const value = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: Math.min(0.035, depth * 0.12),
        bevelThickness: Math.min(0.035, depth * 0.12),
        curveSegments: 4,
        steps: 1,
      });
      value.center();
      applyBoxProjectedUvs(value);
      return value;
    });
    return this.addMesh(parent, geometry, position, material, options);
  }

  beamBetween(
    parent: THREE.Object3D,
    start: THREE.Vector3,
    end: THREE.Vector3,
    thickness: number,
    depth: number,
    material: MaterialSpec,
    outline = true,
  ): THREE.Mesh {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const mesh = this.box(parent, [thickness, length, depth], [midpoint.x, midpoint.y, midpoint.z], material, { outline }, thickness * 0.18);
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    return mesh;
  }

  clonePrototype(prototype: THREE.Object3D): THREE.Object3D {
    return prototype.clone(true);
  }

  bakeStaticGroup(group: THREE.Group): void {
    group.updateMatrixWorld(true);
    const inverseRoot = group.matrixWorld.clone().invert();
    const meshBuckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    const lineBuckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    const preserved: THREE.Object3D[] = [];

    group.traverse((child) => {
      if (child === group) return;
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        const material = Array.isArray(child.material) ? child.material[0] : child.material;
        if (!material) return;
        const geometry = child.geometry.clone();
        const localMatrix = inverseRoot.clone().multiply(child.matrixWorld);
        geometry.applyMatrix4(localMatrix);
        if (child instanceof THREE.Mesh && typeof child.userData.undralSurfaceVariant === 'number') {
          bakeUvTransform(geometry, child.userData.undralSurfaceVariant);
        }
        const attributes = Object.keys(geometry.attributes).sort().join(',');
        const key = `${material.uuid}:${attributes}:${geometry.index ? 'indexed' : 'plain'}`;
        if (child instanceof THREE.LineSegments) {
          const bucket = lineBuckets.get(key) ?? { material, geometries: [] as THREE.BufferGeometry[] };
          bucket.geometries.push(geometry);
          lineBuckets.set(key, bucket);
        } else {
          const bucket = meshBuckets.get(key) ?? { material, geometries: [] as THREE.BufferGeometry[] };
          bucket.geometries.push(geometry);
          meshBuckets.set(key, bucket);
        }
        return;
      }
      if (child instanceof THREE.Light) {
        const clone = child.clone();
        clone.applyMatrix4(inverseRoot.clone().multiply(child.matrixWorld));
        preserved.push(clone);
      }
    });

    while (group.children.length) group.remove(group.children[group.children.length - 1]);
    for (const bucket of meshBuckets.values()) {
      const merged = mergeGeometries(bucket.geometries, false);
      for (const geometry of bucket.geometries) geometry.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.materials.bindSurfaceVariant(mesh);
      group.add(mesh);
    }
    for (const bucket of lineBuckets.values()) {
      const merged = mergeGeometries(bucket.geometries, false);
      for (const geometry of bucket.geometries) geometry.dispose();
      if (!merged) continue;
      const lines = new THREE.LineSegments(merged, bucket.material);
      lines.renderOrder = 3;
      group.add(lines);
    }
    if (preserved.length) group.add(...preserved);
  }

  private addMesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    position: [number, number, number],
    materialSpec: MaterialSpec,
    options: PrimitiveOptions,
  ): THREE.Mesh {
    const material = this.materials.material(materialSpec.kind, materialSpec.color, materialSpec);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (options.rotation) mesh.rotation.set(...options.rotation);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    if (options.name) mesh.name = options.name;
    this.materials.bindSurfaceVariant(mesh, surfaceSeed(parent, position, materialSpec, options));
    parent.add(mesh);
    if (options.outline) this.addOutline(mesh, geometry);
    return mesh;
  }

  private addOutline(mesh: THREE.Mesh, geometry: THREE.BufferGeometry): void {
    const key = geometry.uuid;
    let edges = this.edgeCache.get(key);
    if (!edges) {
      edges = new THREE.EdgesGeometry(geometry, 34);
      this.edgeCache.set(key, edges);
    }
    const lines = new THREE.LineSegments(edges, this.outlineMaterial);
    lines.name = 'ink-outline';
    lines.renderOrder = 3;
    lines.scale.setScalar(1.004);
    mesh.add(lines);
  }

  private geometry(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
    const cached = this.geometryCache.get(key);
    if (cached) return cached;
    const geometry = factory();
    geometry.computeVertexNormals();
    ensureUv1(geometry);
    this.geometryCache.set(key, geometry);
    return geometry;
  }

  dispose(): void {
    for (const edges of this.edgeCache.values()) edges.dispose();
    for (const geometry of this.geometryCache.values()) geometry.dispose();
    this.edgeCache.clear();
    this.geometryCache.clear();
    this.outlineMaterial.dispose();
  }
}
