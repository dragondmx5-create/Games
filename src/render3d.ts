import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TILE, WEAPONS } from './config';
import { World, Tile, tileAt, isSolid } from './world';
import type { Player, Enemy, Npc, Animal, Pet, LootBag, WeaponPickup } from './entities';
import { currentWeapon } from './entities';
import type { Assets, Drawable } from './assets';
import { WebGL2NotSupportedError } from './rendering/core/WebGLSupportError';
import { StylizedMaterialLibrary } from './art3d/materials';
import { ModelingToolkit } from './art3d/modeling';
import { StylizedAssetFactory } from './art3d/assets';
import type { HouseModel } from './art3d/assets';
import { AdaptiveResolutionGovernor, getGraphicsQuality, resolveGraphicsQuality, type ResolvedGraphicsQuality } from './rendering/quality/QualityManager';
import { AdvancedTerrainMaterial } from './art3d/advancedTerrainMaterial';
import { TerrainDetailSystem } from './art3d/terrainDetails';
import { terrainBaseColorHex } from './render/terrainPresentation';
import { encodeWaterNormalSample } from './rendering/core/normalMap';
import { CinematicPipeline3D } from './rendering/postprocessing/CinematicPipeline3D';
import { ambientWeatherForLand } from './rendering/weather';
import { windSway } from './rendering/effects';
import { worldVisualRevision } from './rendering/worldVisualRevision';

export const HIT_FLASH_TIME = 0.15;

const MAX_TILE_INSTANCES = 3600;
const MAX_WALL_INSTANCES = 2600;
const MAX_WATER_INSTANCES = 1800;
const MAX_RESOURCE_INSTANCES = 1200;
const CHUNK_STEP = 3;
const FLOAT_LIFE = 0.95;
const MAX_PARTICLES = 180;
const WORLD_UNIT = 1 / TILE;

interface FloatText3D {
  node: HTMLDivElement;
  x: number;
  z: number;
  height: number;
  life: number;
  maxLife: number;
}

interface Particle3D {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
  gravity?: number;
  size?: number;
  opacity?: number;
}

interface FoliageVisual {
  node: THREE.Object3D;
  worldX: number;
  worldZ: number;
  baseRotationX: number;
  baseRotationZ: number;
  amplitude: number;
}

interface NatureEmitter {
  kind: 'tree' | 'flower' | 'reed';
  x: number;
  y: number;
  z: number;
  seed: number;
}

interface ActorVisual {
  root: THREE.Group;
  body: THREE.Object3D;
  weaponPivot?: THREE.Group;
  arc?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  arcKey?: string;
  hpBack?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hpFill?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  label?: HTMLDivElement;
  lastSeen: number;
}

interface Palette {
  sky: number;
  fog: number;
  floor: number;
  floorAlt: number;
  path: number;
  farm: number;
  rock: number;
  brick: number;
  water: number;
  accent: number;
  daylight: number;
}

interface AtmosphereProfile {
  fogDensity: number;
  hemisphereIntensity: number;
  environmentIntensity: number;
  sunIntensity: number;
  coolFillIntensity: number;
  warmRimIntensity: number;
}

const DEFAULT_SURFACE_ATMOSPHERE: AtmosphereProfile = {
  fogDensity: 0.014,
  hemisphereIntensity: 1.22,
  environmentIntensity: 0.72,
  sunIntensity: 2.55,
  // Bumped from 0.52/0.68: the cool-fill/warm-rim pair is what gives the
  // scene directional depth against the flatter hemisphere/sun pairing —
  // too low and daylight scenes read as flat/"raw" despite otherwise
  // correct exposure.
  coolFillIntensity: 0.62,
  warmRimIntensity: 0.84,
};

const LAND_ATMOSPHERE: Partial<Record<string, AtmosphereProfile>> = {
  witchlands: { fogDensity: 0.0185, hemisphereIntensity: 1.05, environmentIntensity: 0.62, sunIntensity: 2.15, coolFillIntensity: 0.58, warmRimIntensity: 0.82 },
  rainforest: { fogDensity: 0.0195, hemisphereIntensity: 1.13, environmentIntensity: 0.66, sunIntensity: 2.28, coolFillIntensity: 0.48, warmRimIntensity: 0.55 },
  frostlands: { fogDensity: 0.0125, hemisphereIntensity: 1.3, environmentIntensity: 0.82, sunIntensity: 2.42, coolFillIntensity: 0.7, warmRimIntensity: 0.42 },
  'sunscorched-desert': { fogDensity: 0.0095, hemisphereIntensity: 1.34, environmentIntensity: 0.76, sunIntensity: 2.82, coolFillIntensity: 0.34, warmRimIntensity: 0.86 },
  'cinder-coast': { fogDensity: 0.0165, hemisphereIntensity: 0.98, environmentIntensity: 0.56, sunIntensity: 2.08, coolFillIntensity: 0.42, warmRimIntensity: 0.92 },
};

const PALETTES: Record<string, Palette> = {
  default: {
    sky: 0x11161a,
    fog: 0x151c1e,
    floor: 0x465a3d,
    floorAlt: 0x354a35,
    path: 0x75634b,
    farm: 0x59402d,
    rock: 0x3c4247,
    brick: 0x66564e,
    water: 0x24596b,
    accent: 0x8ee6c8,
    daylight: 0xdce6d1,
  },
  witchlands: {
    sky: 0x17121c,
    fog: 0x21182a,
    floor: 0x3d4838,
    floorAlt: 0x2d342f,
    path: 0x66556b,
    farm: 0x4a342f,
    rock: 0x393443,
    brick: 0x5d4b62,
    water: 0x342e58,
    accent: 0xb98af0,
    daylight: 0xcbb8e5,
  },
  'green-land': {
    sky: 0x9bb6b6,
    fog: 0xa7beb3,
    floor: 0x557c45,
    floorAlt: 0x416b3a,
    path: 0x8d7656,
    farm: 0x6e4a2f,
    rock: 0x555b58,
    brick: 0x796652,
    water: 0x347f94,
    accent: 0x8ee6c8,
    daylight: 0xfff0cf,
  },
  rainforest: {
    sky: 0x4d7d72,
    fog: 0x50796b,
    floor: 0x286343,
    floorAlt: 0x194b35,
    path: 0x705739,
    farm: 0x5b3e2b,
    rock: 0x40534d,
    brick: 0x5d6953,
    water: 0x1b6f79,
    accent: 0x74f0ba,
    daylight: 0xd6f0bd,
  },
  frostlands: {
    sky: 0x8faab9,
    fog: 0xaec1c9,
    floor: 0x82969a,
    floorAlt: 0x6d858a,
    path: 0xa89f8d,
    farm: 0x67564b,
    rock: 0x66747f,
    brick: 0x7f8992,
    water: 0x4b8da6,
    accent: 0xa7e8ff,
    daylight: 0xe8f4ff,
  },
  'sunscorched-desert': {
    sky: 0xc28a58,
    fog: 0xc69262,
    floor: 0xb27b43,
    floorAlt: 0x966539,
    path: 0xc89a64,
    farm: 0x765035,
    rock: 0x805b43,
    brick: 0xa66f47,
    water: 0x2e8793,
    accent: 0xffcf70,
    daylight: 0xffe0a3,
  },
  'cinder-coast': {
    sky: 0x4b4548,
    fog: 0x51484a,
    floor: 0x514945,
    floorAlt: 0x3d3735,
    path: 0x75605a,
    farm: 0x594138,
    rock: 0x373436,
    brick: 0x704a43,
    water: 0x24556d,
    accent: 0xff856d,
    daylight: 0xe8c3aa,
  },
};

function hash2(x: number, y: number): number {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 0xffffffff;
}

function terrainHeight(tx: number, ty: number): number {
  return (hash2(tx, ty) - 0.5) * 0.07;
}

function colorOffset3d(color: number, lightness: number): number {
  return new THREE.Color(color).offsetHSL(0, 0, lightness).getHex();
}

function clearChildren(root: THREE.Object3D): void {
  while (root.children.length) root.remove(root.children[root.children.length - 1]);
}

function setShadow(object: THREE.Object3D, cast = true, receive = true): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}


function createProceduralWaterNormal(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to allocate water normal texture.');
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size * Math.PI * 2;
      const v = y / size * Math.PI * 2;
      const dx = Math.cos(u * 3 + Math.sin(v * 2)) * 0.52 + Math.cos(u * 7 - v * 3) * 0.18;
      const dz = Math.sin(v * 4 + Math.cos(u * 2)) * 0.5 + Math.sin(v * 9 + u * 2) * 0.16;
      const normal = encodeWaterNormalSample(dx, dz);
      const index = (y * size + x) * 4;
      image.data[index] = normal[0];
      image.data[index + 1] = normal[1];
      image.data[index + 2] = normal[2];
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'undral:procedural-water-normal';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 3.5);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export class Renderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly environmentMap: THREE.Texture;
  private readonly cinematicPipeline: CinematicPipeline3D;
  private readonly terrainSurface: AdvancedTerrainMaterial;
  private readonly terrainDetails: TerrainDetailSystem;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
  private readonly terrainRoot = new THREE.Group();
  private readonly propRoot = new THREE.Group();
  private readonly actorRoot = new THREE.Group();
  private readonly effectsRoot = new THREE.Group();
  private readonly actors = new Map<string, ActorVisual>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly artMaterials: StylizedMaterialLibrary;
  private readonly modelKit: ModelingToolkit;
  private readonly assetFactory: StylizedAssetFactory;
  private readonly houseVisuals: HouseModel[] = [];
  private readonly flickerLights: THREE.PointLight[] = [];
  private readonly icons = new Map<string, HTMLCanvasElement>();
  private readonly floats: FloatText3D[] = [];
  private readonly particles: Particle3D[] = [];
  private readonly floatLayer: HTMLDivElement;
  private readonly labelLayer: HTMLDivElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly weaponIcon: HTMLCanvasElement;
  private readonly hemi = new THREE.HemisphereLight(0xdcebdc, 0x182027, 1.25);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.1);
  private readonly coolFill = new THREE.DirectionalLight(0x86a8d2, 0.48);
  private readonly warmRim = new THREE.DirectionalLight(0xffad72, 0.72);
  private readonly playerLight = new THREE.PointLight(0x9fffe2, 1.5, 13, 1.8);
  private readonly heroRimLight = new THREE.PointLight(0x6fa9ff, 0.64, 5.6, 2);
  private readonly sunTarget = new THREE.Object3D();
  private readonly target = new THREE.Vector3();
  private readonly smoothTarget = new THREE.Vector3();
  private readonly projectionScratch = new THREE.Vector3();
  private readonly matrixScratch = new THREE.Object3D();
  private readonly colorScratch = new THREE.Color();
  private readonly particlePositions = new Float32Array(MAX_PARTICLES * 3);
  private readonly particleColors = new Float32Array(MAX_PARTICLES * 3);
  private readonly particleSizes = new Float32Array(MAX_PARTICLES);
  private readonly particleAlphas = new Float32Array(MAX_PARTICLES);
  private readonly particleGeometry = new THREE.BufferGeometry();
  private readonly particleMaterial: THREE.ShaderMaterial;
  private readonly particlePoints: THREE.Points;
  private readonly foliageVisuals: FoliageVisual[] = [];
  private readonly natureEmitters: NatureEmitter[] = [];
  private readonly terrainMesh: THREE.InstancedMesh;
  private readonly wallMesh: THREE.InstancedMesh;
  private readonly waterMesh: THREE.InstancedMesh;
  private readonly resourceMesh: THREE.InstancedMesh;
  private readonly floorGeometry = new THREE.BoxGeometry(1.01, 0.12, 1.01);
  private readonly wallGeometry = new THREE.BoxGeometry(1.04, 1, 1.04);
  private readonly waterGeometry = new THREE.BoxGeometry(1.01, 0.045, 1.01);
  private readonly resourceGeometry = new THREE.ConeGeometry(0.26, 0.85, 6);
  private readonly floorMaterial: THREE.MeshPhysicalMaterial;
  private readonly waterNormalTexture = createProceduralWaterNormal();
  private readonly wallMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.03 });
  private readonly waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2f7185,
    transparent: true,
    opacity: 0.82,
    roughness: 0.12,
    metalness: 0,
    transmission: 0.38,
    thickness: 0.62,
    ior: 1.333,
    attenuationColor: new THREE.Color(0x246b75),
    attenuationDistance: 2.8,
    specularIntensity: 0.92,
    specularColor: new THREE.Color(0xd9f8ff),
    clearcoat: 0.95,
    clearcoatRoughness: 0.13,
    envMapIntensity: 1.08,
    normalMap: this.waterNormalTexture,
    normalScale: new THREE.Vector2(0.32, 0.32),
  });
  private readonly resourceMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2, emissive: 0x151515 });
  private readonly onResize = (): void => this.resize();
  private readonly onGraphicsQuality = (): void => this.applyGraphicsQuality();
  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + event.deltaY * 0.012, 12, 31);
  };
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2 && event.button !== 1) return;
    this.dragging = true;
    this.dragPointer = event.pointerId;
    this.dragX = event.clientX;
    this.dragY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.dragPointer) return;
    const dx = event.clientX - this.dragX;
    const dy = event.clientY - this.dragY;
    this.dragX = event.clientX;
    this.dragY = event.clientY;
    this.cameraYaw -= dx * 0.006;
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * 0.004, THREE.MathUtils.degToRad(39), THREE.MathUtils.degToRad(69));
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointer) return;
    this.dragging = false;
    this.dragPointer = -1;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };
  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('undral:webgl-context-lost'));
  };

  private currentQuality: ResolvedGraphicsQuality = resolveGraphicsQuality();
  private autoQuality = getGraphicsQuality() === 'auto';
  private resolutionScale = 1;
  private readonly resolutionGovernor = new AdaptiveResolutionGovernor();
  private currentWorld: World | null = null;
  private chunkTx = Number.NaN;
  private chunkTy = Number.NaN;
  private nextWorldRefresh = 0;
  private worldVisualRevision = '';
  private frameClock = 0;
  private actorFrame = 0;
  private cameraYaw = Math.PI * 0.25;
  private cameraPitch = THREE.MathUtils.degToRad(55);
  private cameraDistance = 21;
  private dragging = false;
  private dragPointer = -1;
  private dragX = 0;
  private dragY = 0;
  private shakeTime = 0;
  private shakeMagnitude = 0;
  private disposed = false;
  private minimapAccumulator = 0;
  private weatherAccumulator = 0;
  private natureAccumulator = 0;
  private footstepDistance = 0;
  private lastFootX = Number.NaN;
  private lastFootZ = Number.NaN;
  camX = 0;
  camY = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly assets: Assets) {
    this.currentQuality = resolveGraphicsQuality();
    this.autoQuality = getGraphicsQuality() === 'auto';
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: this.currentQuality !== 'low',
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      console.error('[undral:3d] WebGL renderer startup failed', error);
      throw new WebGL2NotSupportedError();
    }

    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.currentQuality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setAnimationLoop(null);

    this.artMaterials = new StylizedMaterialLibrary(this.renderer);
    this.terrainSurface = new AdvancedTerrainMaterial(this.renderer);
    this.floorMaterial = this.terrainSurface.material;
    this.terrainDetails = new TerrainDetailSystem();
    this.cinematicPipeline = new CinematicPipeline3D(this.renderer, this.scene, this.camera);
    this.modelKit = new ModelingToolkit(this.artMaterials);
    this.assetFactory = new StylizedAssetFactory(this.modelKit);
    const wallSurface = this.artMaterials.material('stone', 0xffffff);
    this.copyPbrSurface(this.wallMaterial, wallSurface);
    this.ensureSecondaryUv(this.floorGeometry);
    this.ensureSecondaryUv(this.wallGeometry);

    const roomEnvironment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentMap = pmrem.fromScene(roomEnvironment, 0.045).texture;
    this.environmentMap.name = 'undral:pmrem-environment';
    roomEnvironment.dispose();
    pmrem.dispose();
    this.scene.environment = this.environmentMap;
    this.scene.environmentIntensity = 0.68;

    this.scene.add(this.terrainRoot, this.propRoot, this.actorRoot, this.effectsRoot);
    this.terrainRoot.add(this.terrainDetails.root);
    this.scene.add(this.hemi, this.sun, this.coolFill, this.warmRim, this.playerLight, this.heroRimLight, this.sunTarget);
    this.scene.fog = new THREE.FogExp2(0x151c1e, 0.018);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 70;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.035;
    this.sun.target = this.sunTarget;
    this.coolFill.target = this.sunTarget;
    this.warmRim.target = this.sunTarget;
    this.applyGraphicsQuality();

    this.terrainMesh = new THREE.InstancedMesh(this.floorGeometry, this.floorMaterial, MAX_TILE_INSTANCES);
    this.wallMesh = new THREE.InstancedMesh(this.wallGeometry, this.wallMaterial, MAX_WALL_INSTANCES);
    this.waterMesh = new THREE.InstancedMesh(this.waterGeometry, this.waterMaterial, MAX_WATER_INSTANCES);
    this.resourceMesh = new THREE.InstancedMesh(this.resourceGeometry, this.resourceMaterial, MAX_RESOURCE_INSTANCES);
    this.terrainMesh.count = 0;
    this.wallMesh.count = 0;
    this.waterMesh.count = 0;
    this.resourceMesh.count = 0;
    this.terrainMesh.receiveShadow = true;
    this.wallMesh.castShadow = true;
    this.wallMesh.receiveShadow = true;
    this.resourceMesh.castShadow = true;
    this.resourceMesh.receiveShadow = true;
    this.terrainMesh.frustumCulled = true;
    this.wallMesh.frustumCulled = true;
    this.waterMesh.frustumCulled = true;
    this.resourceMesh.frustumCulled = true;
    this.terrainRoot.add(this.terrainMesh, this.wallMesh, this.waterMesh, this.resourceMesh);

    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.particleGeometry.setAttribute('particleSize', new THREE.BufferAttribute(this.particleSizes, 1));
    this.particleGeometry.setAttribute('particleAlpha', new THREE.BufferAttribute(this.particleAlphas, 1));
    this.particleMaterial = new THREE.ShaderMaterial({
      precision: 'mediump',
      uniforms: { uPointScale: { value: Math.max(1, window.innerHeight * this.renderer.getPixelRatio() * 0.5) } },
      vertexShader: `
        attribute vec3 color;
        attribute float particleSize;
        attribute float particleAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPointScale;
        void main() {
          vColor = color;
          vAlpha = particleAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(particleSize * uPointScale / max(1.0, -mvPosition.z), 1.0, 48.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float distanceToCenter = length(gl_PointCoord - vec2(0.5));
          float softCircle = 1.0 - smoothstep(0.18, 0.5, distanceToCenter);
          float alpha = softCircle * vAlpha;
          if (alpha <= 0.01) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.NormalBlending,
    });
    this.particlePoints = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.particlePoints.frustumCulled = false;
    this.effectsRoot.add(this.particlePoints);

    this.floatLayer = this.makeOverlayLayer('undral-3d-floats');
    this.labelLayer = this.makeOverlayLayer('undral-3d-labels');
    this.minimap = document.getElementById('minimap') as HTMLCanvasElement;
    this.weaponIcon = document.getElementById('weapon-icon') as HTMLCanvasElement;

    this.buildInventoryIcons();
    this.resize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('undral:graphics-quality', this.onGraphicsQuality);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);

    canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  private ensureSecondaryUv(geometry: THREE.BufferGeometry): void {
    const uv = geometry.getAttribute('uv');
    if (uv && !geometry.getAttribute('uv1')) geometry.setAttribute('uv1', uv.clone());
  }

  private copyPbrSurface(target: THREE.MeshStandardMaterial, source: THREE.MeshStandardMaterial): void {
    target.map = source.map;
    target.normalMap = source.normalMap;
    target.normalScale.copy(source.normalScale);
    target.aoMap = source.aoMap;
    target.aoMapIntensity = source.aoMapIntensity;
    target.roughnessMap = source.roughnessMap;
    target.metalnessMap = source.metalnessMap;
    target.envMapIntensity = source.envMapIntensity;
    target.onBeforeCompile = source.onBeforeCompile;
    target.customProgramCacheKey = source.customProgramCacheKey;
    target.needsUpdate = true;
  }

  private makeOverlayLayer(className: string): HTMLDivElement {
    const layer = document.createElement('div');
    layer.className = className;
    const parent = this.canvas.parentElement ?? document.body;
    parent.appendChild(layer);
    return layer;
  }

  private applyGraphicsQuality(): void {
    const quality = resolveGraphicsQuality();
    this.currentQuality = quality;
    this.autoQuality = getGraphicsQuality() === 'auto';
    if (!this.autoQuality) {
      this.resolutionScale = 1;
      this.resolutionGovernor.reset();
    }
    const pixelRatioCap = quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap) * this.resolutionScale;
    this.renderer.setPixelRatio(pixelRatio);
    this.cinematicPipeline.setQuality(quality);
    this.terrainSurface.setQuality(quality);
    this.terrainDetails.setQuality(quality);
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.sun.castShadow = quality !== 'low';
    const shadowSize = quality === 'low' ? 512 : quality === 'medium' ? 1536 : 3072;
    if (this.sun.shadow.mapSize.width !== shadowSize) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (this.canvas.width > 0 && this.canvas.height > 0) this.resize();
  }

  private resize(): void {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.cinematicPipeline.setSize(width, height, this.renderer.getPixelRatio());
    if (this.particleMaterial) this.particleMaterial.uniforms.uPointScale.value = Math.max(1, height * this.renderer.getPixelRatio() * 0.5);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  private material(color: number, roughness = 0.72, emissive = 0x000000): THREE.MeshStandardMaterial {
    const key = `${color}:${roughness}:${emissive}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04, emissive, emissiveIntensity: emissive ? 0.55 : 0 });
    this.materials.set(key, material);
    return material;
  }

  private paletteFor(world: World): Palette {
    const land = world.profile?.landId;
    if (land && PALETTES[land]) return PALETTES[land];
    if (!world.region || world.layer > 1) {
      return {
        ...PALETTES.default,
        sky: 0x090b0f,
        fog: 0x10131a,
        floor: 0x343d3c,
        floorAlt: 0x293130,
        rock: 0x2c3036,
        water: 0x193f52,
        accent: 0x7ad4e8,
        daylight: 0x8ba4b8,
      };
    }
    return PALETTES.default;
  }

  private applyPalette(world: World): Palette {
    const palette = this.paletteFor(world);
    const surfaceAtmosphere = LAND_ATMOSPHERE[world.profile?.landId ?? ''] ?? DEFAULT_SURFACE_ATMOSPHERE;
    this.scene.background = new THREE.Color(palette.sky);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(palette.fog);
      this.scene.fog.density = world.region ? surfaceAtmosphere.fogDensity : 0.024;
    }
    this.hemi.color.setHex(palette.daylight);
    this.hemi.groundColor.setHex(world.region ? 0x263029 : 0x11151c);
    this.hemi.intensity = world.region ? surfaceAtmosphere.hemisphereIntensity : 0.66;
    this.scene.environmentIntensity = world.region ? surfaceAtmosphere.environmentIntensity : 0.38;
    this.sun.color.setHex(world.region ? 0xffd5a1 : palette.daylight);
    this.sun.intensity = world.region ? surfaceAtmosphere.sunIntensity : 1.25;
    this.coolFill.color.setHex(world.region ? 0x8ca9c8 : 0x536f91);
    this.coolFill.intensity = world.region ? surfaceAtmosphere.coolFillIntensity : 0.34;
    this.warmRim.color.setHex(world.region ? 0xffa65f : palette.accent);
    this.warmRim.intensity = world.region ? surfaceAtmosphere.warmRimIntensity : 0.46;
    this.waterMaterial.color.setHex(palette.water);
    return palette;
  }

  private tileColor(world: World, tx: number, ty: number, tile: Tile, palette: Palette): THREE.Color {
    const base = terrainBaseColorHex(world, tx, ty, tile, palette);
    if (tile === Tile.Entrance || tile === Tile.Exit) {
      return this.colorScratch.setHex(base).lerp(new THREE.Color(palette.floor), 0.34);
    }
    const jitter = (hash2(tx * 7, ty * 11) - 0.5) * 0.08;
    return this.colorScratch.setHex(base).offsetHSL(0, 0, jitter);
  }


  private updateInstancedBounds(mesh: THREE.InstancedMesh): void {
    if (mesh.count <= 0) return;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }

  private applyStaticObjectBudget(object: THREE.Object3D, distanceSq: number): void {
    const shadowRadius = this.currentQuality === 'high' ? 18 : this.currentQuality === 'medium' ? 10 : 0;
    const outlineRadius = this.currentQuality === 'high' ? 25 : this.currentQuality === 'medium' ? 14 : 0;
    const castShadow = shadowRadius > 0 && distanceSq <= shadowRadius * shadowRadius;
    const showOutlines = outlineRadius > 0 && distanceSq <= outlineRadius * outlineRadius;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = castShadow;
        child.receiveShadow = true;
      } else if (child instanceof THREE.LineSegments) {
        child.visible = showOutlines;
      }
    });
  }

  private rebuildWorld(world: World, centerTx: number, centerTy: number): void {
    const worldChanged = this.currentWorld !== world;
    const palette = this.applyPalette(world);
    const baseRadius = this.currentQuality === 'low' ? 18 : this.currentQuality === 'medium' ? 22 : 25;
    const chunkRadius = Math.max(16, baseRadius - (this.resolutionScale < 0.82 ? 3 : 0));
    const minX = Math.max(0, centerTx - chunkRadius);
    const maxX = Math.min(world.w - 1, centerTx + chunkRadius);
    const minY = Math.max(0, centerTy - chunkRadius);
    const maxY = Math.min(world.h - 1, centerTy + chunkRadius);
    let floorCount = 0;
    let wallCount = 0;
    let waterCount = 0;
    let resourceCount = 0;
    const houseWallTiles = new Set<string>();
    for (const house of world.houses ?? []) {
      if (house.x1 < minX || house.x0 > maxX || house.y1 < minY || house.y0 > maxY) continue;
      for (let tx = house.x0; tx <= house.x1; tx++) {
        houseWallTiles.add(`${tx}:${house.y0}`);
        houseWallTiles.add(`${tx}:${house.y1}`);
      }
      for (let ty = house.y0; ty <= house.y1; ty++) {
        houseWallTiles.add(`${house.x0}:${ty}`);
        houseWallTiles.add(`${house.x1}:${ty}`);
      }
    }

    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const tile = tileAt(world, tx, ty);
        const y = terrainHeight(tx, ty);
        if (tile === Tile.Water) {
          if (waterCount < MAX_WATER_INSTANCES) {
            this.matrixScratch.position.set(tx + 0.5, y + 0.015, ty + 0.5);
            this.matrixScratch.rotation.set(0, 0, 0);
            this.matrixScratch.scale.set(1, 1, 1);
            this.matrixScratch.updateMatrix();
            this.waterMesh.setMatrixAt(waterCount++, this.matrixScratch.matrix);
          }
          continue;
        }

        if (isSolid(tile)) {
          if (houseWallTiles.has(`${tx}:${ty}`)) continue;
          if (wallCount < MAX_WALL_INSTANCES) {
            const height = tile === Tile.Brick ? 1.2 : 1.75 + hash2(tx, ty) * 0.38;
            this.matrixScratch.position.set(tx + 0.5, y + height * 0.5 - 0.02, ty + 0.5);
            this.matrixScratch.rotation.set(0, hash2(tx * 3, ty * 5) * 0.08 - 0.04, 0);
            this.matrixScratch.scale.set(1, height, 1);
            this.matrixScratch.updateMatrix();
            this.wallMesh.setMatrixAt(wallCount, this.matrixScratch.matrix);
            const wallColor = tile === Tile.Brick ? palette.brick : palette.rock;
            this.wallMesh.setColorAt(wallCount, new THREE.Color(wallColor).offsetHSL(0, 0, (hash2(tx, ty) - 0.5) * 0.1));
            wallCount++;
          }
          continue;
        }

        if (floorCount < MAX_TILE_INSTANCES) {
          this.matrixScratch.position.set(tx + 0.5, y - 0.06, ty + 0.5);
          this.matrixScratch.rotation.set(0, 0, 0);
          this.matrixScratch.scale.set(1, 1, 1);
          this.matrixScratch.updateMatrix();
          this.terrainMesh.setMatrixAt(floorCount, this.matrixScratch.matrix);
          this.terrainMesh.setColorAt(floorCount, this.tileColor(world, tx, ty, tile, palette).clone());
          floorCount++;
        }

        if ((tile === Tile.Glowshroom || tile === Tile.Crystal || tile === Tile.IronOre) && resourceCount < MAX_RESOURCE_INSTANCES) {
          const scale = tile === Tile.Glowshroom ? 0.48 : tile === Tile.Crystal ? 0.82 : 0.7;
          this.matrixScratch.position.set(tx + 0.5, y + scale * 0.43, ty + 0.5);
          this.matrixScratch.rotation.set(0, hash2(tx, ty) * Math.PI, 0);
          this.matrixScratch.scale.set(scale, scale, scale);
          this.matrixScratch.updateMatrix();
          this.resourceMesh.setMatrixAt(resourceCount, this.matrixScratch.matrix);
          this.resourceMesh.setColorAt(
            resourceCount,
            new THREE.Color(tile === Tile.Glowshroom ? 0x8ee6c8 : tile === Tile.Crystal ? 0x7ad4e8 : 0x9da5aa),
          );
          resourceCount++;
        }
      }
    }

    this.terrainMesh.count = floorCount;
    this.wallMesh.count = wallCount;
    this.waterMesh.count = waterCount;
    this.resourceMesh.count = resourceCount;
    this.terrainMesh.instanceMatrix.needsUpdate = true;
    this.wallMesh.instanceMatrix.needsUpdate = true;
    this.waterMesh.instanceMatrix.needsUpdate = true;
    this.resourceMesh.instanceMatrix.needsUpdate = true;
    if (this.terrainMesh.instanceColor) this.terrainMesh.instanceColor.needsUpdate = true;
    if (this.wallMesh.instanceColor) this.wallMesh.instanceColor.needsUpdate = true;
    if (this.resourceMesh.instanceColor) this.resourceMesh.instanceColor.needsUpdate = true;
    this.updateInstancedBounds(this.terrainMesh);
    this.updateInstancedBounds(this.wallMesh);
    this.updateInstancedBounds(this.waterMesh);
    this.updateInstancedBounds(this.resourceMesh);

    clearChildren(this.propRoot);
    this.houseVisuals.length = 0;
    this.flickerLights.length = 0;
    this.foliageVisuals.length = 0;
    this.natureEmitters.length = 0;
    // House clones share geometry with the factory prototypes. Once the old
    // streamed world has been detached, its cache can be safely disposed so
    // exploring many sectors does not retain every house mesh for the session.
    if (worldChanged) this.assetFactory.resetHousePrototypeCache();
    this.addWorldProps(world, minX, maxX, minY, maxY, palette);
    this.terrainDetails.rebuild(world, minX, maxX, minY, maxY, terrainHeight, {
      floor: palette.floor,
      floorAlt: palette.floorAlt,
      rock: palette.rock,
      accent: palette.accent,
    });
    this.chunkTx = centerTx;
    this.chunkTy = centerTy;
    this.currentWorld = world;
    this.worldVisualRevision = worldVisualRevision(world);
  }

  private visiblePx(x: number, y: number, minX: number, maxX: number, minY: number, maxY: number): boolean {
    const tx = x * WORLD_UNIT;
    const ty = y * WORLD_UNIT;
    return tx >= minX - 2 && tx <= maxX + 2 && ty >= minY - 2 && ty <= maxY + 2;
  }

  private addWorldProps(world: World, minX: number, maxX: number, minY: number, maxY: number, palette: Palette): void {
    for (const prop of world.props) {
      if (!this.visiblePx(prop.x, prop.y, minX, maxX, minY, maxY)) continue;
      const object = this.makeProp(prop.kind, prop.seed, palette, prop.length, world.profile?.landId);
      object.traverse((child) => { if (child instanceof THREE.PointLight) this.flickerLights.push(child); });
      object.position.set(prop.x * WORLD_UNIT, terrainHeight(Math.floor(prop.x * WORLD_UNIT), Math.floor(prop.y * WORLD_UNIT)), prop.y * WORLD_UNIT);
      object.rotation.y = prop.rotationY ?? hash2(Math.floor(prop.x), Math.floor(prop.y)) * Math.PI * 2;
      const propDx = object.position.x - (minX + maxX) * 0.5;
      const propDz = object.position.z - (minY + maxY) * 0.5;
      this.applyStaticObjectBudget(object, propDx * propDx + propDz * propDz);
      object.traverse((child) => {
        const amplitude = Number(child.userData.windAmplitude ?? 0);
        if (!Number.isFinite(amplitude) || amplitude <= 0) return;
        this.foliageVisuals.push({
          node: child,
          worldX: object.position.x,
          worldZ: object.position.z,
          baseRotationX: child.rotation.x,
          baseRotationZ: child.rotation.z,
          amplitude,
        });
      });
      const emitterKind: NatureEmitter['kind'] | undefined = prop.kind === 'flowerPatch' ? 'flower'
        : prop.kind === 'reedCluster' ? 'reed'
        : prop.kind === 'tree' || prop.kind === 'ancientTree' || prop.kind === 'pineTree' ? 'tree'
        : undefined;
      if (emitterKind) this.natureEmitters.push({
        kind: emitterKind,
        x: object.position.x,
        y: object.position.y,
        z: object.position.z,
        seed: prop.seed,
      });
      this.propRoot.add(object);
    }

    for (const node of world.miningNodes) {
      if (!node.available || !this.visiblePx(node.x, node.y, minX, maxX, minY, maxY)) continue;
      const object = this.makeCrystalCluster(node.kind === 'iron_vein' ? 0x9da5aa : node.kind === 'ancient_seam' ? 0xb98af0 : 0x7ad4e8, node.kind !== 'iron_vein');
      object.position.set(node.x * WORLD_UNIT, terrainHeight(node.tx, node.ty), node.y * WORLD_UNIT);
      this.propRoot.add(object);
    }

    for (const chest of world.chests) {
      if (chest.opened || !this.visiblePx(chest.x, chest.y, minX, maxX, minY, maxY)) continue;
      const chestObject = this.makeChest();
      chestObject.position.set(chest.x * WORLD_UNIT, 0.15, chest.y * WORLD_UNIT);
      this.propRoot.add(chestObject);
    }

    for (const portal of world.portals) {
      if (!this.visiblePx(portal.x, portal.y, minX, maxX, minY, maxY)) continue;
      const color = portal.kind === 'red-gate' ? 0xff554d : portal.kind === 'black-market' ? 0xb98af0 : portal.kind === 'dungeon' ? 0x7ad4e8 : palette.accent;
      const portalSeed = Array.from(portal.id).reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
      const portalObject = portal.kind === 'dungeon'
        ? this.assetFactory.makeDungeonEntrance(palette, portalSeed)
        : this.assetFactory.makePortal(color, 'arcane');
      portalObject.position.set(portal.x * WORLD_UNIT, terrainHeight(Math.floor(portal.x * WORLD_UNIT), Math.floor(portal.y * WORLD_UNIT)), portal.y * WORLD_UNIT);
      const portalDx = portalObject.position.x - (minX + maxX) * 0.5;
      const portalDz = portalObject.position.z - (minY + maxY) * 0.5;
      this.applyStaticObjectBudget(portalObject, portalDx * portalDx + portalDz * portalDz);
      portalObject.traverse((child) => { if (child instanceof THREE.PointLight) this.flickerLights.push(child); });
      this.propRoot.add(portalObject);
    }

    for (const plot of world.farmPlots) {
      if (plot.stage <= 0) continue;
      const px = (plot.tx + 0.5);
      const pz = (plot.ty + 0.5);
      if (px < minX || px > maxX || pz < minY || pz > maxY) continue;
      const plant = this.makePlant(plot.stage, plot.crop === 'glowshroom' ? 0x8ee6c8 : 0xb4d76c);
      plant.position.set(px, terrainHeight(plot.tx, plot.ty), pz);
      this.propRoot.add(plant);
    }

    for (const house of world.houses ?? []) {
      if (house.x1 < minX || house.x0 > maxX || house.y1 < minY || house.y0 > maxY) continue;
      const visual = this.assetFactory.makeHouse(house, palette);
      const centerX = (house.x0 + house.x1 + 1) * 0.5;
      const centerZ = (house.y0 + house.y1 + 1) * 0.5;
      visual.root.position.y = terrainHeight(Math.floor(centerX), Math.floor(centerZ));
      this.houseVisuals.push(visual);
      this.flickerLights.push(...visual.warmLights);
      this.propRoot.add(visual.root);
    }

    for (const pen of world.pens ?? []) {
      const x0 = pen.x0;
      const x1 = pen.x1 + 1;
      const y0 = pen.y0;
      const y1 = pen.y1 + 1;
      if (x1 < minX || x0 > maxX || y1 < minY || y0 > maxY) continue;
      for (let x = x0; x < x1; x += 2) {
        const north = this.assetFactory.makeFenceSegment(Math.min(2, x1 - x));
        north.position.set(x + Math.min(1, (x1 - x) * 0.5), 0, y0);
        const south = this.assetFactory.makeFenceSegment(Math.min(2, x1 - x));
        south.position.set(x + Math.min(1, (x1 - x) * 0.5), 0, y1);
        this.propRoot.add(north, south);
      }
      for (let z = y0; z < y1; z += 2) {
        const west = this.assetFactory.makeFenceSegment(Math.min(2, y1 - z), Math.PI * 0.5);
        west.position.set(x0, 0, z + Math.min(1, (y1 - z) * 0.5));
        const east = this.assetFactory.makeFenceSegment(Math.min(2, y1 - z), Math.PI * 0.5);
        east.position.set(x1, 0, z + Math.min(1, (y1 - z) * 0.5));
        this.propRoot.add(west, east);
      }
    }

    for (const gate of world.gates ?? []) {
      if (gate.tx < minX - 2 || gate.tx > maxX + 2 || gate.ty < minY - 2 || gate.ty > maxY + 2) continue;
      const sign = this.assetFactory.makeSignpost(gate.tx * 73 + gate.ty * 37);
      sign.position.set(gate.tx + 0.5, terrainHeight(gate.tx, gate.ty), gate.ty + 0.5);
      sign.rotation.y = gate.edge === 'w' ? Math.PI * 0.5 : gate.edge === 'e' ? -Math.PI * 0.5 : gate.edge === 'n' ? Math.PI : 0;
      sign.traverse((child) => { if (child instanceof THREE.PointLight) this.flickerLights.push(child); });
      this.propRoot.add(sign);
    }

    if (world.campAnchor && world.campAnchor.tx >= minX && world.campAnchor.tx <= maxX && world.campAnchor.ty >= minY && world.campAnchor.ty <= maxY) {
      const camp = this.assetFactory.makeCamp();
      camp.position.set(world.campAnchor.tx + 0.5, terrainHeight(world.campAnchor.tx, world.campAnchor.ty), world.campAnchor.ty + 0.5);
      camp.traverse((child) => { if (child instanceof THREE.PointLight) this.flickerLights.push(child); });
      this.propRoot.add(camp);
    }
  }

  private makeProp(kind: string, seed: number, palette: Palette, length?: number, landId?: string): THREE.Object3D {
    if (kind === 'tree') return this.makeTree(seed, palette, landId);
    if (kind === 'ancientTree') return this.assetFactory.makeAncientTree(seed, palette);
    if (kind === 'pineTree') return this.assetFactory.makePineTree(seed, palette);
    if (kind === 'boulder') return this.assetFactory.makeBoulder(seed, palette);
    if (kind === 'cliffOutcrop') return this.assetFactory.makeCliffOutcrop(seed, palette);
    if (kind === 'flowerPatch') return this.assetFactory.makeFlowerPatch(seed, palette);
    if (kind === 'reedCluster') return this.assetFactory.makeReedCluster(seed, palette);
    if (kind === 'cairn') return this.assetFactory.makeCairn(seed, palette.rock);
    if (kind === 'lanternPost') return this.assetFactory.makeLanternPost(seed);
    if (kind === 'shrub') return this.assetFactory.makeShrub(seed, palette);
    if (kind === 'townWell') return this.assetFactory.makeTownWell(seed, palette);
    if (kind === 'marketStall') return this.assetFactory.makeMarketStall(seed, palette);
    if (kind === 'handCart') return this.assetFactory.makeHandCart(seed, palette);
    if (kind === 'townBench') return this.assetFactory.makeTownBench(seed);
    if (kind === 'flowerPlanter') return this.assetFactory.makeFlowerPlanter(seed, palette);
    if (kind === 'cityFountain') return this.assetFactory.makeCityFountain(palette, seed);
    if (kind === 'clockTower') return this.assetFactory.makeClockTower(palette, seed);
    if (kind === 'parkGazebo') return this.assetFactory.makeParkGazebo(palette, seed);
    if (kind === 'lighthouse') return this.assetFactory.makeLighthouse(palette, seed);
    if (kind === 'cafeTerrace') return this.assetFactory.makeCafeTerrace(palette, seed);
    if (kind === 'dungeonPillar') return this.assetFactory.makeDungeonPillar(palette, seed);
    if (kind === 'dungeonBrazier') return this.assetFactory.makeDungeonBrazier(palette, seed);
    if (kind === 'dungeonRubble') return this.assetFactory.makeDungeonRubble(palette, seed);
    if (kind === 'wallSection') return this.assetFactory.makeWallSection(length ?? 4, palette);
    if (kind === 'wallTower') return this.assetFactory.makeWallTower(palette);
    if (kind === 'gatehouse') return this.assetFactory.makeGatehouse(palette, length ?? 5);
    if (kind === 'keep') return this.assetFactory.makeKeep(palette, seed);
    if (kind === 'bridge') return this.assetFactory.makeBridge(length ?? 4, palette);
    if (kind === 'dock') return this.assetFactory.makeDock(length ?? 6, palette);
    if (kind === 'roadMarker') return this.assetFactory.makeRoadMarker(palette, seed);
    if (kind === 'monument') return this.assetFactory.makeMonument(palette, seed);
    if (kind === 'ruinedTower') return this.assetFactory.makeRuinedTower(palette, seed);
    if (kind === 'bigCrystal') return this.assetFactory.makeCrystalCluster(0x7ad4e8, true);
    if (kind === 'shrooms') return this.makeMushrooms();
    if (kind === 'stump') {
      const stump = this.assetFactory.makeRockCluster(seed, 0x5a3a27);
      stump.scale.set(0.72, 0.45, 0.72);
      return stump;
    }
    if (kind === 'statue') {
      const statue = this.assetFactory.makeHero(0x70777a, 0x858b8d).root;
      statue.scale.setScalar(1.08);
      return statue;
    }
    if (kind === 'pillar' || kind === 'brokenPillar') {
      const group = this.modelKit.group(kind);
      const height = kind === 'pillar' ? 1.9 : 1.1;
      this.modelKit.cylinder(group, 0.24, 0.3, height, 8, [0, height * 0.5, 0], { kind: 'stone', color: palette.brick }, { outline: true });
      this.modelKit.box(group, [0.7, 0.18, 0.7], [0, 0.09, 0], { kind: 'stone', color: colorOffset3d(palette.brick, -0.04) }, { outline: true }, 0.04);
      this.modelKit.box(group, [0.58, 0.18, 0.58], [0, height + 0.09, 0], { kind: 'stone', color: colorOffset3d(palette.brick, 0.04) }, { outline: true }, 0.04);
      return group;
    }
    if (kind === 'root') {
      const group = this.modelKit.group('root');
      this.modelKit.beamBetween(group, new THREE.Vector3(-0.55, 0.06, 0), new THREE.Vector3(0.55, 0.28, 0.12), 0.16, 0.16, { kind: 'wood', color: 0x513421 }, true);
      return group;
    }
    if (kind === 'bones' || kind === 'skull') {
      const group = this.modelKit.group(kind);
      for (let i = 0; i < 4; i++) this.modelKit.cylinder(group, 0.035, 0.045, 0.55, 6, [(i - 1.5) * 0.12, 0.08, (i % 2) * 0.12], { kind: 'plain', color: 0xd0c7aa }, { rotation: [0, 0, Math.PI * (0.35 + i * 0.13)], outline: true });
      if (kind === 'skull') this.modelKit.sphere(group, 0.2, 9, [0.12, 0.23, -0.12], { kind: 'plain', color: 0xd0c7aa }, { scale: [1, 0.82, 0.92], outline: true });
      return group;
    }
    if (kind === 'stalagmite') {
      const group = this.modelKit.group(kind);
      this.modelKit.cone(group, 0.38, 1.35, 7, [0, 0.68, 0], { kind: 'stone', color: palette.rock }, { outline: true });
      return group;
    }
    return this.assetFactory.makeRockCluster(seed, palette.rock);
  }

  private makeTree(seed: number, palette: Palette, landId?: string): THREE.Group {
    return this.assetFactory.makeTree(seed, palette, landId);
  }

  private makeCrystalCluster(color: number, emissive: boolean): THREE.Group {
    return this.assetFactory.makeCrystalCluster(color, emissive);
  }

  private makeMushrooms(): THREE.Group {
    const group = this.modelKit.group('shrooms');
    const stem: import('./art3d/modeling').MaterialSpec = { kind: 'plain', color: 0xd9d1b9, roughness: 0.92 };
    const cap: import('./art3d/modeling').MaterialSpec = { kind: 'crystal', color: 0x8ee6c8, emissive: 0x3f9e88, emissiveIntensity: 0.95, roughness: 0.65 };
    for (let i = 0; i < 4; i++) {
      const height = 0.28 + i * 0.035;
      const x = (i - 1.5) * 0.16;
      const z = (i % 2) * 0.12 - 0.06;
      this.modelKit.cylinder(group, 0.035, 0.05, height, 6, [x, height * 0.5, z], stem, { outline: true });
      this.modelKit.sphere(group, 0.12 + i * 0.008, 8, [x, height + 0.04, z], cap, { scale: [1, 0.48, 1], outline: true });
    }
    return group;
  }

  private makeChest(): THREE.Group {
    return this.assetFactory.makeChest();
  }

  private makePlant(stage: number, color: number): THREE.Group {
    return this.assetFactory.makePlant(stage, color);
  }

  private makeHumanoid(baseColor: number, accentColor: number, scale = 1): ActorVisual {
    const model = this.assetFactory.makeHero(baseColor, accentColor);
    model.root.scale.setScalar(scale);
    return { root: model.root, body: model.body, weaponPivot: model.weaponPivot, lastSeen: 0 };
  }

  private makeEnemy(kind: string): ActorVisual {
    const model = this.assetFactory.makeEnemy(kind);
    return { root: model.root, body: model.body, weaponPivot: model.weaponPivot, lastSeen: 0 };
  }

  private makeAnimal(kind: string): ActorVisual {
    const model = this.assetFactory.makeAnimal(kind);
    return { root: model.root, body: model.body, lastSeen: 0 };
  }

  private makePet(): ActorVisual {
    const model = this.assetFactory.makeAnimal('pet', true);
    return { root: model.root, body: model.body, lastSeen: 0 };
  }

  private ensureActor(key: string, factory: () => ActorVisual): ActorVisual {
    let visual = this.actors.get(key);
    if (!visual) {
      visual = factory();
      this.actors.set(key, visual);
      this.actorRoot.add(visual.root);
    }
    visual.lastSeen = this.actorFrame;
    visual.root.visible = true;
    return visual;
  }

  private updateActorTransform(visual: ActorVisual, x: number, y: number, facing: number, animTime: number, moving: boolean, scale = 1): void {
    const tx = x * WORLD_UNIT;
    const tz = y * WORLD_UNIT;
    visual.root.position.set(tx, terrainHeight(Math.floor(tx), Math.floor(tz)), tz);
    visual.root.rotation.y = -facing + Math.PI;
    visual.root.scale.setScalar(scale);
    const bob = moving ? Math.abs(Math.sin(animTime * 8)) * 0.08 : Math.sin(this.frameClock * 2 + tx) * 0.012;
    visual.body.position.y = bob;
    const rig = visual.root.userData.rig as { leftLeg?: THREE.Object3D; rightLeg?: THREE.Object3D; leftArm?: THREE.Object3D; rightArm?: THREE.Object3D } | undefined;
    if (rig) {
      const stride = moving ? Math.sin(animTime * 8) * 0.42 : Math.sin(this.frameClock * 1.8 + tx) * 0.025;
      if (rig.leftLeg) rig.leftLeg.rotation.x = stride;
      if (rig.rightLeg) rig.rightLeg.rotation.x = -stride;
      if (rig.leftArm) rig.leftArm.rotation.x = -stride * 0.72;
      if (rig.rightArm) rig.rightArm.rotation.x = stride * 0.72;
    }
  }

  private updateAttackArc(visual: ActorVisual, player: Player): void {
    const active = player.swingT > 0.02;
    if (!active) {
      if (visual.arc) visual.arc.visible = false;
      if (visual.weaponPivot) visual.weaponPivot.rotation.y = 0;
      return;
    }
    const range = Math.max(0.9, player.swingRange * WORLD_UNIT);
    const arc = Math.min(Math.PI * 1.8, Math.max(0.3, player.swingArc));
    const key = `${range.toFixed(2)}:${arc.toFixed(2)}:${player.swingPower}`;
    if (!visual.arc || visual.arcKey !== key) {
      if (visual.arc) visual.root.remove(visual.arc);
      const geometry = new THREE.RingGeometry(range * 0.55, range, 36, 1, -arc * 0.5, arc);
      const color = new THREE.Color(currentWeapon(player).color).getHex();
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: player.swingPower === 2 ? 0.58 : 0.36, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI * 0.5;
      mesh.position.y = 0.09;
      visual.root.add(mesh);
      visual.arc = mesh;
      visual.arcKey = key;
    }
    visual.arc.visible = true;
    if (visual.arc.material) visual.arc.material.opacity = (player.swingPower === 2 ? 0.62 : 0.4) * Math.min(1, player.swingT * 2);
    if (visual.weaponPivot) visual.weaponPivot.rotation.y = (1 - player.swingT) * player.swingArc - player.swingArc * 0.5;
  }

  private ensureHpBar(visual: ActorVisual): void {
    if (visual.hpBack && visual.hpFill) return;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.09), new THREE.MeshBasicMaterial({ color: 0x160d0d, depthTest: false, transparent: true, opacity: 0.85 }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.055), new THREE.MeshBasicMaterial({ color: 0xe05252, depthTest: false }));
    back.position.y = 1.35;
    fill.position.set(0, 1.35, 0.001);
    back.renderOrder = 20;
    fill.renderOrder = 21;
    visual.root.add(back, fill);
    visual.hpBack = back;
    visual.hpFill = fill;
  }

  private updateHpBar(visual: ActorVisual, hp: number, maxHp: number, visible: boolean): void {
    this.ensureHpBar(visual);
    const ratio = THREE.MathUtils.clamp(hp / Math.max(1, maxHp), 0, 1);
    if (visual.hpBack && visual.hpFill) {
      visual.hpBack.visible = visible;
      visual.hpFill.visible = visible;
      visual.hpBack.quaternion.copy(this.camera.quaternion);
      visual.hpFill.quaternion.copy(this.camera.quaternion);
      visual.hpFill.scale.x = ratio;
      visual.hpFill.position.x = -0.43 * (1 - ratio);
    }
  }

  private updateActors(
    player: Player,
    enemies: Enemy[],
    npcs: Npc[],
    animals: Animal[],
    pet: Pet | null,
    bags: LootBag[],
    pickups: WeaponPickup[],
    otherPlayers: { player: Player; username: string }[],
  ): void {
    this.actorFrame++;

    const self = this.ensureActor('player:self', () => this.makeHumanoid(0x2f7668, 0x8ee6c8, 0.95));
    this.updateActorTransform(self, player.x, player.y, player.facing, player.animTime, player.moving, 0.95);
    this.updateAttackArc(self, player);

    otherPlayers.forEach(({ player: remote, username }, index) => {
      const key = `remote:${username || index}`;
      const visual = this.ensureActor(key, () => this.makeHumanoid(0x765d32, 0xd8b56b, 0.93));
      this.updateActorTransform(visual, remote.x, remote.y, remote.facing, remote.animTime, remote.moving, 0.93);
      this.updateAttackArc(visual, remote);
      this.updateActorLabel(visual, username, remote.x, remote.y, 1.8);
    });

    enemies.forEach((enemy, index) => {
      const key = `enemy:${enemy.id ?? `${enemy.kind}:${index}`}`;
      const visual = this.ensureActor(key, () => this.makeEnemy(enemy.kind));
      this.updateActorTransform(visual, enemy.x, enemy.y, enemy.wanderAngle, enemy.animTime, true, enemy.kind === 'wallworm' ? 1.05 : 0.9);
      const hitScale = enemy.hitFlash > 0 ? 1 + Math.min(0.22, enemy.hitFlash / HIT_FLASH_TIME * 0.22) : 1;
      visual.body.scale.setScalar(hitScale);
      this.updateHpBar(visual, enemy.hp, enemy.maxHp, enemy.hpBarTimer > 0 || enemy.hp < enemy.maxHp);
    });

    npcs.forEach((npc, index) => {
      const key = `npc:${npc.id ?? index}`;
      const visual = this.ensureActor(key, () => this.makeHumanoid(npc.kind === 'shopkeeper' ? 0x725538 : 0x4b6073, npc.kind === 'shopkeeper' ? 0xd8b56b : 0x9db7ce, 0.9));
      const facing = npc.dir === 'up' ? -Math.PI * 0.5 : npc.dir === 'down' ? Math.PI * 0.5 : npc.flipX ? Math.PI : 0;
      this.updateActorTransform(visual, npc.x, npc.y, facing, npc.animTime, npc.moving, 0.9);
      if (npc.name) this.updateActorLabel(visual, npc.name, npc.x, npc.y, 1.75);
    });

    animals.forEach((animal, index) => {
      if (animal.dead) return;
      const key = `animal:${animal.id ?? `${animal.kind}:${index}`}`;
      const visual = this.ensureActor(key, () => this.makeAnimal(animal.kind));
      const facing = animal.dir === 'up' ? -Math.PI * 0.5 : animal.dir === 'down' ? Math.PI * 0.5 : animal.flipX ? Math.PI : 0;
      this.updateActorTransform(visual, animal.x, animal.y, facing, animal.animTime, animal.moving, animal.kind === 'chicken' ? 0.72 : 0.92);
      this.updateHpBar(visual, animal.hp, animal.maxHp, animal.hitFlash > 0 || animal.hp < animal.maxHp);
    });

    if (pet) {
      const visual = this.ensureActor('pet:self', () => this.makePet());
      const facing = pet.dir === 'up' ? -Math.PI * 0.5 : pet.dir === 'down' ? Math.PI * 0.5 : pet.flipX ? Math.PI : 0;
      this.updateActorTransform(visual, pet.x, pet.y, facing, pet.animTime, pet.moving, 0.68);
    }

    bags.forEach((bag, index) => {
      const key = `bag:${bag.id ?? index}`;
      const visual = this.ensureActor(key, () => {
        const root = new THREE.Group();
        const sack = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), this.material(0x7b583e, 0.98));
        sack.scale.y = 0.82;
        sack.position.y = 0.27;
        const tie = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 5, 10), this.material(0xc6a56c, 0.6));
        tie.rotation.x = Math.PI * 0.5;
        tie.position.y = 0.52;
        root.add(sack, tie);
        setShadow(root);
        return { root, body: sack, lastSeen: 0 };
      });
      this.updateActorTransform(visual, bag.x, bag.y, 0, this.frameClock, false, 1);
    });

    pickups.forEach((pickup, index) => {
      const key = `pickup:${pickup.weapon}:${index}`;
      const visual = this.ensureActor(key, () => {
        const root = new THREE.Group();
        const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.95), this.material(new THREE.Color(WEAPONS[pickup.weapon].color).getHex(), 0.25));
        weapon.position.y = 0.25;
        weapon.rotation.x = Math.PI * 0.5;
        root.add(weapon);
        weapon.castShadow = true;
        return { root, body: weapon, lastSeen: 0 };
      });
      this.updateActorTransform(visual, pickup.x, pickup.y, this.frameClock * 0.7, this.frameClock, false, 1);
      visual.root.position.y += 0.18 + Math.sin(this.frameClock * 2.5 + index) * 0.08;
      visual.root.rotation.y = this.frameClock * 0.8;
    });

    for (const [key, visual] of this.actors) {
      if (visual.lastSeen === this.actorFrame) continue;
      visual.root.visible = false;
      if (visual.label) visual.label.style.display = 'none';
      if (this.actorFrame - visual.lastSeen > 240) {
        visual.root.removeFromParent();
        visual.label?.remove();
        this.actors.delete(key);
      }
    }
  }

  private updateActorLabel(visual: ActorVisual, text: string, x: number, y: number, height: number): void {
    if (!visual.label) {
      const label = document.createElement('div');
      label.className = 'undral-3d-nameplate';
      this.labelLayer.appendChild(label);
      visual.label = label;
    }
    visual.label.textContent = text;
    visual.label.style.display = '';
    this.positionOverlay(visual.label, x * WORLD_UNIT, height, y * WORLD_UNIT);
  }

  private updateArchitecturalArt(player: Player, dt: number): void {
    const px = player.x * WORLD_UNIT;
    const pz = player.y * WORLD_UNIT;
    const smokeCandidates: Array<{ house: HouseModel; distanceSq: number }> = [];
    for (const house of this.houseVisuals) {
      const inside = px >= house.bounds.x0 && px < house.bounds.x1 && pz >= house.bounds.y0 && pz < house.bounds.y1;
      const dx = house.root.position.x - px;
      const dz = house.root.position.z - pz;
      const distanceSq = dx * dx + dz * dz;
      house.roof.visible = !inside;
      const interiorRadius = this.currentQuality === 'high' ? 12 : this.currentQuality === 'medium' ? 7 : 0;
      house.interior.visible = inside || (interiorRadius > 0 && distanceSq <= interiorRadius * interiorRadius);
      const outlineRadius = this.currentQuality === 'high' ? 24 : this.currentQuality === 'medium' ? 14 : 0;
      const outlinesVisible = outlineRadius > 0 && distanceSq <= outlineRadius * outlineRadius;
      if (house.root.userData.outlinesVisible !== outlinesVisible) {
        house.root.userData.outlinesVisible = outlinesVisible;
        for (const outline of house.outlines) outline.visible = outlinesVisible;
      }
      const shadowRadius = this.currentQuality === 'high' ? 17 : this.currentQuality === 'medium' ? 9 : 0;
      const castsShadow = shadowRadius > 0 && distanceSq <= shadowRadius * shadowRadius;
      if (house.root.userData.castsShadow !== castsShadow) {
        house.root.userData.castsShadow = castsShadow;
        house.root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = castsShadow;
            child.receiveShadow = true;
          }
        });
      }
      if (house.smokeEnabled && distanceSq <= 34 * 34) smokeCandidates.push({ house, distanceSq });
    }

    // Dense blocks previously let every chimney emit at once. That filled the
    // shared particle pool with smoke and starved weather, footsteps and combat
    // feedback. Only the nearest few active chimneys now receive a quality-
    // scaled slot.
    smokeCandidates.sort((a, b) => a.distanceSq - b.distanceSq);
    const smokeSlots = this.currentQuality === 'low' ? 0 : this.currentQuality === 'medium' ? 2 : 4;
    const smokeRate = this.currentQuality === 'high' ? 0.48 : 0.28;
    for (let index = 0; index < Math.min(smokeSlots, smokeCandidates.length); index += 1) {
      const house = smokeCandidates[index].house;
      if (this.particles.length >= this.particleLimit() || Math.random() >= dt * smokeRate) continue;
      this.pushParticle({
        x: house.root.position.x + house.smokeLocal.x + (Math.random() - 0.5) * 0.08,
        y: house.root.position.y + house.smokeLocal.y,
        z: house.root.position.z + house.smokeLocal.z + (Math.random() - 0.5) * 0.08,
        vx: 0.13 + Math.random() * 0.13,
        vy: 0.3 + Math.random() * 0.16,
        vz: (Math.random() - 0.5) * 0.07,
        gravity: -0.025,
        life: 2.35 + Math.random() * 0.85,
        maxLife: 3.2,
        size: 0.32 + Math.random() * 0.12,
        opacity: 0.54,
        color: new THREE.Color(0x9ba0a4).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08),
      });
    }

    const rankedLights = this.flickerLights.map((light) => {
      const worldPosition = new THREE.Vector3();
      light.getWorldPosition(worldPosition);
      return { light, distanceSq: worldPosition.distanceToSquared(this.target) };
    }).sort((a, b) => a.distanceSq - b.distanceSq);
    rankedLights.forEach(({ light }, index) => {
      light.visible = index < (this.currentQuality === 'low' ? 2 : this.currentQuality === 'medium' ? 5 : 8);
      const phase = Number(light.userData.flickerPhase ?? 0);
      const base = light.userData.baseIntensity ?? light.intensity;
      light.userData.baseIntensity = base;
      light.intensity = Number(base) * (0.92 + Math.sin(this.frameClock * 8.3 + phase) * 0.055 + Math.sin(this.frameClock * 17.1 + phase * 1.7) * 0.025);
    });
  }

  private updateFoliageWind(): void {
    const qualityScale = this.currentQuality === 'low' ? 0.52 : this.currentQuality === 'medium' ? 0.82 : 1;
    for (const visual of this.foliageVisuals) {
      const primary = windSway(this.frameClock, visual.worldX, visual.worldZ);
      const cross = windSway(this.frameClock * 0.83 + 1.7, visual.worldZ + 47, visual.worldX - 31);
      visual.node.rotation.z = visual.baseRotationZ + primary * visual.amplitude * qualityScale;
      visual.node.rotation.x = visual.baseRotationX + cross * visual.amplitude * 0.42 * qualityScale;
    }
  }

  private updateNatureAmbience(world: World, player: Player, dt: number): void {
    if (this.currentQuality === 'low' || document.hidden || this.natureEmitters.length === 0) return;
    const px = player.x * WORLD_UNIT;
    const pz = player.y * WORLD_UNIT;
    const nearby = this.natureEmitters.filter((emitter) => {
      const dx = emitter.x - px;
      const dz = emitter.z - pz;
      return dx * dx + dz * dz <= 18 * 18;
    });
    if (nearby.length === 0) return;
    this.natureAccumulator += dt * (this.currentQuality === 'high' ? 2.4 : 1.15);
    const palette = this.paletteFor(world);
    while (this.natureAccumulator >= 1 && this.particles.length < this.particleLimit()) {
      this.natureAccumulator -= 1;
      const emitter = nearby[Math.floor(Math.random() * nearby.length)];
      const seedPhase = (emitter.seed % 997) / 997;
      if (emitter.kind === 'tree') {
        const life = 1.8 + Math.random() * 1.6;
        this.pushParticle({
          x: emitter.x + (Math.random() - 0.5) * 2.4,
          y: emitter.y + 1.6 + Math.random() * 2.4,
          z: emitter.z + (Math.random() - 0.5) * 2.4,
          vx: 0.18 + seedPhase * 0.14,
          vy: -0.08 - Math.random() * 0.15,
          vz: (Math.random() - 0.5) * 0.22,
          gravity: 0.025,
          life,
          maxLife: life,
          size: 0.09 + Math.random() * 0.05,
          opacity: 0.78,
          color: new THREE.Color(Math.random() < 0.7 ? palette.floor : palette.floorAlt).offsetHSL(0, 0.05, 0.08),
        });
      } else if (emitter.kind === 'flower') {
        const life = 1.2 + Math.random() * 1.1;
        this.pushParticle({
          x: emitter.x + (Math.random() - 0.5) * 1.3,
          y: emitter.y + 0.24 + Math.random() * 0.55,
          z: emitter.z + (Math.random() - 0.5) * 1.0,
          vx: (Math.random() - 0.5) * 0.12,
          vy: 0.045 + Math.random() * 0.07,
          vz: (Math.random() - 0.5) * 0.12,
          gravity: -0.008,
          life,
          maxLife: life,
          size: 0.065 + Math.random() * 0.04,
          opacity: 0.88,
          color: new THREE.Color(Math.random() < 0.58 ? palette.accent : 0xffd27a),
        });
      } else {
        const life = 1.4 + Math.random() * 1.2;
        this.pushParticle({
          x: emitter.x + (Math.random() - 0.5) * 1.2,
          y: emitter.y + 0.18 + Math.random() * 0.48,
          z: emitter.z + (Math.random() - 0.5) * 0.8,
          vx: 0.05 + Math.random() * 0.1,
          vy: 0.025 + Math.random() * 0.045,
          vz: (Math.random() - 0.5) * 0.08,
          gravity: -0.004,
          life,
          maxLife: life,
          size: 0.12 + Math.random() * 0.07,
          opacity: 0.34,
          color: new THREE.Color(0xb9e1de),
        });
      }
    }
  }

  private updateCamera(player: Player, dt: number): void {
    const px = player.x * WORLD_UNIT;
    const pz = player.y * WORLD_UNIT;
    this.target.set(px, 0.62, pz);
    if (this.actorFrame === 0) this.smoothTarget.copy(this.target);
    const follow = 1 - Math.exp(-dt * 8.5);
    this.smoothTarget.lerp(this.target, follow);

    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const shake = this.shakeTime > 0 ? this.shakeMagnitude * (this.shakeTime / 0.24) : 0;
    const shakeX = (Math.random() - 0.5) * shake * 0.08;
    const shakeZ = (Math.random() - 0.5) * shake * 0.08;
    const horizontal = Math.cos(this.cameraPitch) * this.cameraDistance;
    const height = Math.sin(this.cameraPitch) * this.cameraDistance;
    this.camera.position.set(
      this.smoothTarget.x + Math.sin(this.cameraYaw) * horizontal + shakeX,
      this.smoothTarget.y + height,
      this.smoothTarget.z + Math.cos(this.cameraYaw) * horizontal + shakeZ,
    );
    this.camera.lookAt(this.smoothTarget);

    this.sun.position.set(this.smoothTarget.x - 14, 25, this.smoothTarget.z - 10);
    this.coolFill.position.set(this.smoothTarget.x + 11, 12, this.smoothTarget.z + 8);
    this.warmRim.position.set(this.smoothTarget.x - 7, 8, this.smoothTarget.z + 12);
    this.sunTarget.position.copy(this.smoothTarget);
    this.playerLight.position.set(px, 1.4, pz);
    this.heroRimLight.position.set(px - 1.25, 2.15, pz + 1.45);
    this.camX = player.x - window.innerWidth * 0.5;
    this.camY = player.y - window.innerHeight * 0.5;
  }

  private pushParticle(particle: Particle3D): void {
    if (this.particles.length < this.particleLimit()) this.particles.push(particle);
  }

  private updateAmbientWeather(world: World, player: Player, dt: number): number {
    const profile = ambientWeatherForLand(world.profile?.landId, this.currentQuality);
    if (!profile || document.hidden) return 0;
    this.weatherAccumulator += dt * profile.particlesPerSecond;
    const px = player.x * WORLD_UNIT;
    const pz = player.y * WORLD_UNIT;
    while (this.weatherAccumulator >= 1 && this.particles.length < this.particleLimit()) {
      this.weatherAccumulator -= 1;
      const angle = Math.random() * Math.PI * 2;
      const radius = 2 + Math.random() * 13;
      const life = 2.2 + Math.random() * 2.2;
      const horizontal = profile.drift * (0.45 + Math.random() * 0.55);
      this.pushParticle({
        x: px + Math.cos(angle) * radius,
        y: 2.8 + Math.random() * 6,
        z: pz + Math.sin(angle) * radius,
        vx: horizontal,
        vy: -profile.fallSpeed,
        vz: horizontal * 0.35,
        gravity: profile.kind === 'rain' ? 0.4 : profile.kind === 'mist' ? -0.01 : 0.03,
        life,
        maxLife: life,
        size: profile.kind === 'rain' ? 0.055 : profile.kind === 'mist' ? 0.22 : profile.kind === 'snow' ? 0.13 : 0.09,
        opacity: profile.kind === 'mist' ? 0.28 : profile.kind === 'rain' ? 0.72 : 0.82,
        color: new THREE.Color(profile.color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08),
      });
    }
    return profile.wetness;
  }

  private updateFootstepDust(world: World, player: Player): void {
    const px = player.x * WORLD_UNIT;
    const pz = player.y * WORLD_UNIT;
    if (!Number.isFinite(this.lastFootX)) {
      this.lastFootX = px;
      this.lastFootZ = pz;
      return;
    }
    this.footstepDistance += Math.hypot(px - this.lastFootX, pz - this.lastFootZ);
    this.lastFootX = px;
    this.lastFootZ = pz;
    const spacing = this.currentQuality === 'low' ? 1.15 : 0.72;
    if (this.footstepDistance < spacing || this.particles.length >= this.particleLimit()) return;
    this.footstepDistance %= spacing;
    const tx = Math.floor(px);
    const ty = Math.floor(pz);
    if (tileAt(world, tx, ty) === Tile.Water) return;
    const palette = this.paletteFor(world);
    const color = terrainBaseColorHex(world, tx, ty, tileAt(world, tx, ty), palette);
    const count = this.currentQuality === 'high' ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const life = 0.45 + Math.random() * 0.25;
      this.pushParticle({
        x: px + (Math.random() - 0.5) * 0.3,
        y: 0.12,
        z: pz + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.28,
        vy: 0.18 + Math.random() * 0.16,
        vz: (Math.random() - 0.5) * 0.28,
        gravity: 0.32,
        life,
        maxLife: life,
        size: 0.13 + Math.random() * 0.05,
        opacity: 0.62,
        color: new THREE.Color(color).offsetHSL(0, -0.08, 0.08),
      });
    }
  }

  private particleLimit(): number {
    return this.currentQuality === 'low' ? 64 : this.currentQuality === 'medium' ? 120 : MAX_PARTICLES;
  }

  private updateEffects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        const last = this.particles.pop();
        if (last && i < this.particles.length) this.particles[i] = last;
        continue;
      }
      particle.vy -= (particle.gravity ?? 4.2) * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
    }

    const count = Math.min(this.particleLimit(), this.particles.length);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const offset = i * 3;
      if (i < count) {
        const particle = this.particles[i];
        this.particlePositions[offset] = particle.x;
        this.particlePositions[offset + 1] = particle.y;
        this.particlePositions[offset + 2] = particle.z;
        this.particleColors[offset] = particle.color.r;
        this.particleColors[offset + 1] = particle.color.g;
        this.particleColors[offset + 2] = particle.color.b;
        const age = Math.max(0, particle.maxLife - particle.life);
        const fadeIn = Math.min(1, age * 5.5);
        const fadeOut = Math.min(1, particle.life * 2.2);
        this.particleSizes[i] = particle.size ?? 0.16;
        this.particleAlphas[i] = (particle.opacity ?? 0.92) * fadeIn * fadeOut;
      } else {
        this.particlePositions[offset] = 0;
        this.particlePositions[offset + 1] = -999;
        this.particlePositions[offset + 2] = 0;
        this.particleSizes[i] = 0;
        this.particleAlphas[i] = 0;
      }
    }
    (this.particleGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeometry.getAttribute('particleSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeometry.getAttribute('particleAlpha') as THREE.BufferAttribute).needsUpdate = true;
    this.particleGeometry.setDrawRange(0, count);

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const float = this.floats[i];
      float.life -= dt;
      if (float.life <= 0) {
        float.node.remove();
        this.floats.splice(i, 1);
        continue;
      }
      float.height += dt * 0.7;
      const progress = 1 - float.life / float.maxLife;
      float.node.style.opacity = String(Math.min(1, float.life * 2.5));
      float.node.style.transform = `translate(-50%, -50%) scale(${1 + progress * 0.08})`;
      this.positionOverlay(float.node, float.x, float.height, float.z, false);
    }
  }

  private positionOverlay(node: HTMLElement, x: number, y: number, z: number, setTransform = true): void {
    this.projectionScratch.set(x, y, z).project(this.camera);
    const visible = this.projectionScratch.z > -1 && this.projectionScratch.z < 1;
    if (!visible) {
      node.style.display = 'none';
      return;
    }
    node.style.display = '';
    const sx = (this.projectionScratch.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this.projectionScratch.y * 0.5 + 0.5) * window.innerHeight;
    node.style.left = `${sx}px`;
    node.style.top = `${sy}px`;
    if (setTransform) node.style.transform = 'translate(-50%, -100%)';
  }

  private drawMinimap(world: World, player: Player): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const width = this.minimap.width;
    const height = this.minimap.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#080b0e';
    ctx.fillRect(0, 0, width, height);
    const radius = 24;
    const centerTx = Math.floor(player.x * WORLD_UNIT);
    const centerTy = Math.floor(player.y * WORLD_UNIT);
    const cell = Math.max(2, Math.min(width, height) / (radius * 2 + 1));
    const palette = this.paletteFor(world);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = centerTx + dx;
        const ty = centerTy + dy;
        const tile = tileAt(world, tx, ty);
        let color = palette.floor;
        if (tile === Tile.Water) color = palette.water;
        else if (tile === Tile.Rock) color = palette.rock;
        else if (tile === Tile.Brick) color = palette.brick;
        else if (tile === Tile.Farmland) color = palette.farm;
        else if (tile === Tile.Exit || tile === Tile.Entrance) color = palette.accent;
        ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.fillRect(width * 0.5 + dx * cell, height * 0.5 + dy * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    ctx.rotate(player.facing + Math.PI * 0.5);
    ctx.fillStyle = '#f7e7b0';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawWeaponIcon(player: Player): void {
    const ctx = this.weaponIcon.getContext('2d');
    if (!ctx) return;
    const weapon = currentWeapon(player);
    ctx.clearRect(0, 0, this.weaponIcon.width, this.weaponIcon.height);
    ctx.save();
    ctx.translate(this.weaponIcon.width * 0.5, this.weaponIcon.height * 0.5);
    ctx.rotate(Math.PI * 0.22);
    ctx.fillStyle = weapon.color;
    ctx.shadowColor = weapon.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(-3, -15, 6, 23);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#d8b56b';
    ctx.fillRect(-9, 6, 18, 4);
    ctx.fillStyle = '#63452f';
    ctx.fillRect(-2.5, 9, 5, 9);
    ctx.restore();
  }

  private buildInventoryIcons(): void {
    const iconColors: Record<string, string> = {
      wood: '#9a6740',
      ironOre: '#a7adb4',
      meat: '#b95c55',
      hide: '#8a684b',
      feathers: '#e9dfa8',
      chestClosed: '#c0924f',
      'tool.axe': '#c0c6cb',
      'tool.pickaxe': '#9ba5ac',
      'armor.leather': '#8a684b',
      'armor.iron': '#aeb5bb',
      'armor.hide_vest': '#76543d',
    };
    for (const [key, color] of Object.entries(iconColors)) this.icons.set(key, this.makeIcon(color, key));
    for (const [id, weapon] of Object.entries(WEAPONS)) this.icons.set(weapon.sprite, this.makeIcon(weapon.color, id));
  }

  private makeIcon(color: string, key: string): HTMLCanvasElement {
    const source = this.assets.get(key);
    if (source instanceof HTMLCanvasElement) return source;
    if (source instanceof HTMLImageElement) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, source.width);
      canvas.height = Math.max(1, source.height);
      canvas.getContext('2d')?.drawImage(source, 0, 0);
      return canvas;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.clearRect(0, 0, 32, 32);
    ctx.translate(16, 16);
    ctx.rotate(key.includes('weapon') || key.includes('club') || key.includes('blade') ? Math.PI * 0.2 : 0);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 7;
    if (key.includes('weapon') || key.includes('bone') || key.includes('chitin') || key.includes('crystal') || key.includes('club') || key.includes('falchion') || key.includes('javelin') || key.includes('halberd')) {
      ctx.fillRect(-3, -13, 6, 20);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#d3ad65';
      ctx.fillRect(-8, 5, 16, 4);
      ctx.fillStyle = '#5a3d2d';
      ctx.fillRect(-2, 8, 4, 7);
    } else if (key.includes('axe') || key.includes('pickaxe')) {
      ctx.fillRect(-2, -12, 4, 24);
      ctx.fillRect(-9, -11, 18, 6);
    } else {
      ctx.beginPath();
      ctx.roundRect(-10, -10, 20, 20, 5);
      ctx.fill();
    }
    return canvas;
  }

  getSprite(key: string): Drawable | undefined {
    return this.icons.get(key) ?? this.assets.get(key);
  }

  addFloat(x: number, y: number, text: string, color = '#e8e0d0'): void {
    const node = document.createElement('div');
    node.className = 'undral-3d-float';
    node.textContent = text;
    node.style.color = color;
    this.floatLayer.appendChild(node);
    this.floats.push({ node, x: x * WORLD_UNIT, z: y * WORLD_UNIT, height: 2.15, life: FLOAT_LIFE, maxLife: FLOAT_LIFE });
  }

  addSparks(x: number, y: number, n: number, color = '#ffd88a'): void {
    const baseColor = new THREE.Color(color);
    for (let i = 0; i < n && this.particles.length < this.particleLimit(); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.2;
      this.particles.push({
        x: x * WORLD_UNIT,
        y: 0.65 + Math.random() * 0.4,
        z: y * WORLD_UNIT,
        vx: Math.cos(angle) * speed,
        vy: 1.6 + Math.random() * 2.4,
        vz: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        color: baseColor.clone().offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.14),
      });
    }
  }

  shake(magnitude: number): void {
    this.shakeTime = 0.24;
    this.shakeMagnitude = magnitude;
  }

  render(
    world: World,
    player: Player,
    enemies: Enemy[],
    npcs: Npc[],
    animals: Animal[],
    pet: Pet | null,
    bags: LootBag[],
    pickups: WeaponPickup[],
    flashRed: number,
    dt: number,
    otherPlayers: { player: Player; username: string }[] = [],
  ): void {
    if (this.disposed) return;
    if (this.autoQuality) {
      const scale = this.resolutionGovernor.sample(dt * 1000);
      if (scale !== null && scale !== this.resolutionScale) {
        this.resolutionScale = scale;
        this.applyGraphicsQuality();
      }
    }
    this.frameClock += dt;
    const centerTx = Math.floor(player.x * WORLD_UNIT);
    const centerTy = Math.floor(player.y * WORLD_UNIT);
    const now = performance.now();
    const movedChunk = !Number.isFinite(this.chunkTx) || Math.abs(centerTx - this.chunkTx) >= CHUNK_STEP || Math.abs(centerTy - this.chunkTy) >= CHUNK_STEP;
    if (this.currentWorld !== world || movedChunk) {
      this.rebuildWorld(world, centerTx, centerTy);
      this.nextWorldRefresh = now + 900;
    } else if (now >= this.nextWorldRefresh) {
      const revision = worldVisualRevision(world);
      if (revision !== this.worldVisualRevision) this.rebuildWorld(world, centerTx, centerTy);
      else this.applyPalette(world);
      this.nextWorldRefresh = now + 900;
    } else {
      this.applyPalette(world);
    }

    this.updateCamera(player, dt);
    this.updateActors(player, enemies, npcs, animals, pet, bags, pickups, otherPlayers);
    this.updateArchitecturalArt(player, dt);
    this.updateFootstepDust(world, player);
    const weatherWetness = this.updateAmbientWeather(world, player, dt);
    this.updateNatureAmbience(world, player, dt);
    this.updateFoliageWind();
    this.updateEffects(dt);
    this.terrainSurface.update(dt, weatherWetness);
    this.terrainDetails.update(this.frameClock);
    this.waterMesh.position.y = Math.sin(this.frameClock * 1.35) * 0.018;
    this.waterNormalTexture.offset.set(this.frameClock * 0.018, this.frameClock * -0.012);
    this.waterMaterial.opacity = 0.75 + Math.sin(this.frameClock * 0.8) * 0.035;
    this.playerLight.intensity = world.region ? 0.35 + player.light / 100 * 0.55 : 0.9 + player.light / 100 * 1.9;
    this.playerLight.color.setHex(world.region ? 0xffe0ad : 0x8ee6c8);
    this.heroRimLight.color.setHex(world.region ? 0x72a8ff : 0x8ad7ff);
    this.heroRimLight.intensity = world.region ? 0.42 : 0.68;
    this.renderer.toneMappingExposure = 1.08 - Math.min(0.16, flashRed * 0.18);
    this.canvas.style.filter = '';

    for (const visual of this.actors.values()) {
      if (visual.hpBack?.visible) visual.hpBack.quaternion.copy(this.camera.quaternion);
      if (visual.hpFill?.visible) visual.hpFill.quaternion.copy(this.camera.quaternion);
    }

    this.cinematicPipeline.render(dt, flashRed);
    this.minimapAccumulator += dt;
    if (this.minimapAccumulator >= 0.15) {
      this.minimapAccumulator = 0;
      this.drawMinimap(world, player);
      this.drawWeaponIcon(player);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('undral:graphics-quality', this.onGraphicsQuality);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.floatLayer.remove();
    this.labelLayer.remove();
    for (const visual of this.actors.values()) visual.label?.remove();
    this.actors.clear();
    this.floorGeometry.dispose();
    this.wallGeometry.dispose();
    this.waterGeometry.dispose();
    this.resourceGeometry.dispose();
    this.wallMaterial.dispose();
    this.waterMaterial.dispose();
    this.waterNormalTexture.dispose();
    this.resourceMaterial.dispose();
    this.environmentMap.dispose();
    this.particleGeometry.dispose();
    if (this.particlePoints.material instanceof THREE.Material) this.particlePoints.material.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.terrainDetails.dispose();
    this.terrainSurface.dispose();
    this.cinematicPipeline.dispose();
    this.assetFactory.dispose();
    this.modelKit.dispose();
    this.artMaterials.dispose();
    this.renderer.dispose();
  }
}
