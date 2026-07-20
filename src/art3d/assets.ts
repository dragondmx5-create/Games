import * as THREE from 'three';
import type { SettlementHouseDefinition } from '../../server/src/world/settlementLayout';
import { buildHouseComposition, houseArchetypeFor, type HouseArchetype, type HouseComposition, type HouseWallSide } from './houseComposition';
import type { ModelingToolkit, MaterialSpec } from './modeling';

export interface ArtPalette {
  floor: number;
  floorAlt: number;
  path: number;
  rock: number;
  brick: number;
  water: number;
  accent: number;
}

export interface CharacterModel {
  root: THREE.Group;
  body: THREE.Group;
  weaponPivot?: THREE.Group;
}

export interface HouseModel {
  root: THREE.Group;
  roof: THREE.Group;
  interior: THREE.Group;
  outlines: THREE.LineSegments[];
  warmLights: THREE.PointLight[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
  smokeLocal: THREE.Vector3;
  smokeEnabled: boolean;
}

const WOOD: MaterialSpec = { kind: 'wood', color: 0x71472d };
const DARK_WOOD: MaterialSpec = { kind: 'wood', color: 0x3a281f };
const PLASTER: MaterialSpec = { kind: 'plaster', color: 0xd8c7a3 };
const STONE: MaterialSpec = { kind: 'stone', color: 0x66645f };
const ROOF: MaterialSpec = { kind: 'roof', color: 0x263e5f };
const IRON: MaterialSpec = { kind: 'metal', color: 0x8f969d, metalness: 0.68, roughness: 0.34 };
const GOLD: MaterialSpec = { kind: 'metal', color: 0xb98a42, metalness: 0.58, roughness: 0.38 };
const LEATHER: MaterialSpec = { kind: 'leather', color: 0x5b3825 };
const SKIN: MaterialSpec = { kind: 'skin', color: 0xc88f68 };
const HAIR: MaterialSpec = { kind: 'hair', color: 0x2a1d18, roughness: 0.58 };
const INK: MaterialSpec = { kind: 'plain', color: 0x171311, roughness: 0.98 };

function hash01(a: number, b: number): number {
  let value = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) ^ 0xc2b2ae35, 0x27d4eb2d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  return (value >>> 0) / 0xffffffff;
}

function colorOffset(color: number, lightness: number): number {
  return new THREE.Color(color).offsetHSL(0, 0, lightness).getHex();
}

export class StylizedAssetFactory {
  private readonly shadowTexture: THREE.CanvasTexture;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly shadowGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly housePrototypeCache = new Map<string, THREE.Group>();

  constructor(private readonly kit: ModelingToolkit) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is required for character contact shadows.');
    const gradient = context.createRadialGradient(32, 32, 3, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(0,0,0,0.42)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.20)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.shadowTexture = new THREE.CanvasTexture(canvas);
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, opacity: 0.72 });
  }

  private addBlobShadow(parent: THREE.Object3D, radiusX: number, radiusZ: number): void {
    const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    shadow.name = 'contact-shadow';
    shadow.rotation.x = -Math.PI * 0.5;
    shadow.position.y = 0.012;
    shadow.scale.set(radiusX, radiusZ, 1);
    shadow.renderOrder = 1;
    shadow.castShadow = false;
    shadow.receiveShadow = false;
    parent.add(shadow);
  }

  makeHouse(house: SettlementHouseDefinition, palette: ArtPalette): HouseModel {
    const width = house.x1 - house.x0 + 1;
    const depth = house.y1 - house.y0 + 1;
    const archetype = houseArchetypeFor(house);
    const storeys = Math.max(1, Math.min(4, house.storeys ?? 1));
    // Every palette input used by the prototype belongs in the cache key.
    // Omitting rock/accent previously allowed a house cloned in a later land
    // to inherit stone trim or role decorations from the previous palette.
    const paletteKey = [palette.floor, palette.floorAlt, palette.path, palette.rock, palette.brick, palette.water, palette.accent].join(':');
    const doorIndex = house.doorSide === 'n' || house.doorSide === 's'
      ? house.doorTx - house.x0
      : house.doorTy - house.y0 - 1;
    const prototypeKey = `${archetype}:${house.style ?? 'legacy'}:${house.architecture ?? 'legacy'}:${house.districtVariant ?? 0}:${storeys}:${width}:${depth}:${house.doorSide}:${doorIndex}:${house.ordinal}:${paletteKey}`;
    const cached = this.housePrototypeCache.get(prototypeKey);
    if (cached) return this.instantiateHouse(cached, house);

    const root = this.kit.group(`house-prototype:${archetype}`);
    const shell = this.kit.group('house-shell');
    const interior = this.kit.group('house-interior');
    const roof = this.kit.group('house-roof');
    root.add(shell, interior, roof);

    const centerX = (house.x0 + house.x1 + 1) * 0.5;
    const centerZ = (house.y0 + house.y1 + 1) * 0.5;
    const doorX = house.doorTx + 0.5 - centerX;
    const doorZ = house.doorTy + 0.5 - centerZ;
    const plasterBase: Record<HouseArchetype, number> = {
      cottage: 0xd8c7a3, townhouse: 0xd1b990, manor: 0xe2dbc9, questHouse: 0xbca8c5,
      shop: 0xe1c99b, marketHall: 0xd8b777, cafe: 0xe7d0ad, office: 0xd7d4cb,
      guildHall: 0xc9c0ad, civic: 0xdad8cf, workshop: 0xbfa783, lodge: 0xd0c4a7,
    };
    const roofBase: Record<HouseArchetype, number> = {
      cottage: 0x294567, townhouse: 0x3e5263, manor: 0x334f58, questHouse: 0x4e355d,
      shop: 0x6a3440, marketHall: 0x7b4a2b, cafe: 0x7a3945, office: 0x384754,
      guildHall: colorOffset(palette.brick, -0.18), civic: colorOffset(palette.rock, -0.16), workshop: 0x58412e, lodge: 0x294936,
    };
    const timberBase: Record<HouseArchetype, number> = {
      cottage: 0x71472d, townhouse: 0x5d3a28, manor: 0x4b3528, questHouse: 0x493149,
      shop: 0x6d3e28, marketHall: 0x603923, cafe: 0x70402d, office: 0x3f3934,
      guildHall: 0x423127, civic: 0x3d3833, workshop: 0x5a3926, lodge: 0x4b3528,
    };
    const architectureWall: Partial<Record<NonNullable<SettlementHouseDefinition['architecture']>, number>> = {
      'witch-crooked': colorOffset(palette.brick, 0.09),
      'green-homestead': 0xd7caa6,
      'rainforest-stilt': 0xb9c6a2,
      'frost-steep': colorOffset(palette.rock, 0.24),
      'desert-courtyard': colorOffset(palette.brick, 0.2),
      'cinder-industrial': colorOffset(palette.brick, 0.07),
    };
    const architectureRoof: Partial<Record<NonNullable<SettlementHouseDefinition['architecture']>, number>> = {
      'witch-crooked': 0x3d2d4f,
      'green-homestead': 0x315b3b,
      'rainforest-stilt': 0x286a58,
      'frost-steep': 0x496c83,
      'desert-courtyard': 0xa7673f,
      'cinder-industrial': 0x493235,
    };
    const architectureTimber: Partial<Record<NonNullable<SettlementHouseDefinition['architecture']>, number>> = {
      'witch-crooked': 0x3f2d35,
      'green-homestead': 0x65452b,
      'rainforest-stilt': 0x4d3927,
      'frost-steep': 0x343a3e,
      'desert-courtyard': 0x765034,
      'cinder-industrial': 0x3a302c,
    };
    const districtShift = ((house.districtVariant ?? 0) - 2) * 0.018;
    const styleWall = house.style === 'brick' ? colorOffset(palette.brick, 0.13)
      : house.style === 'stone' ? colorOffset(palette.rock, 0.2)
      : house.style === 'timber' ? 0xb99b72
      : house.style === 'canal' ? 0xc8d0c0
      : house.style === 'garden' ? 0xd8cfac
      : house.style === 'mercantile' ? 0xdfc08e
      : architectureWall[house.architecture ?? 'green-homestead'] ?? plasterBase[archetype];
    const plaster: MaterialSpec = { ...PLASTER, color: colorOffset(styleWall, districtShift + (hash01(house.ordinal, 4) - 0.5) * 0.055) };
    const stone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.brick, districtShift + (archetype === 'guildHall' ? -0.02 : 0.02)) };
    const timber: MaterialSpec = { ...WOOD, color: colorOffset(architectureTimber[house.architecture ?? 'green-homestead'] ?? timberBase[archetype], districtShift + (hash01(house.ordinal, 9) - 0.5) * 0.045) };
    const roofMat: MaterialSpec = { ...ROOF, color: colorOffset(architectureRoof[house.architecture ?? 'green-homestead'] ?? roofBase[archetype], districtShift + (hash01(house.ordinal, 14) - 0.5) * 0.035) };
    const composition = buildHouseComposition(house);

    this.kit.box(shell, [width - 0.45, 0.18, depth - 0.45], [0, 0.09, 0], { kind: 'wood', color: 0x5a402b }, { outline: true }, 0.04);
    this.kit.box(interior, [width - 1.7, 0.08, depth - 1.7], [0, 0.2, 0], { kind: 'wood', color: 0x765336 }, { receiveShadow: true }, 0.02);
    this.addFloorPlanks(interior, width - 1.8, depth - 1.8);

    for (let tx = house.x0; tx <= house.x1; tx++) {
      const index = tx - house.x0;
      const localX = tx + 0.5 - centerX;
      this.addWallPanel(shell, localX, -depth * 0.5 + 0.5, 0, house.doorSide === 'n' && tx === house.doorTx, 'n', index, composition.windows.n[index], plaster, stone, timber);
      this.addWallPanel(shell, localX, depth * 0.5 - 0.5, Math.PI, house.doorSide === 's' && tx === house.doorTx, 's', index, composition.windows.s[index], plaster, stone, timber);
    }
    for (let ty = house.y0 + 1; ty < house.y1; ty++) {
      const index = ty - house.y0 - 1;
      const localZ = ty + 0.5 - centerZ;
      this.addWallPanel(shell, -width * 0.5 + 0.5, localZ, -Math.PI * 0.5, house.doorSide === 'w' && ty === house.doorTy, 'w', index, composition.windows.w[index], plaster, stone, timber);
      this.addWallPanel(shell, width * 0.5 - 0.5, localZ, Math.PI * 0.5, house.doorSide === 'e' && ty === house.doorTy, 'e', index, composition.windows.e[index], plaster, stone, timber);
    }

    // The door leaf is intentionally baked ajar. Preserve that semantic on
    // the prototype because static batching removes individual mesh names.
    root.userData.doorAjar = true;

    const storeyOffset = (storeys - 1) * 1.72;
    for (let level = 1; level < storeys; level += 1) {
      this.addUpperStorey(shell, width, depth, level, house.ordinal, plaster, stone, timber);
    }
    roof.position.y = storeyOffset;
    this.addRoof(roof, width, depth, roofMat, timber, plaster, house.ordinal);
    const chimneyX = -width * 0.24 + hash01(house.ordinal, 91) * width * 0.48;
    const chimneyZ = -depth * 0.12;
    this.addChimney(roof, chimneyX, chimneyZ, stone);
    root.userData.smokeLocal = [chimneyX, 3.96 + storeyOffset, chimneyZ];
    const smokeChance: Record<HouseArchetype, number> = {
      cottage: 0.34, townhouse: 0.3, manor: 0.24, questHouse: 0.62,
      shop: 0.28, marketHall: 0.5, cafe: 0.78, office: 0.08,
      guildHall: 0.42, civic: 0.12, workshop: 0.88, lodge: 0.48,
    };
    root.userData.smokeEnabled = hash01(house.ordinal ^ width, depth + 173) < smokeChance[archetype];
    root.userData.doorIndex = doorIndex;
    if (width >= 10 || house.ordinal % 2 === 0) this.addDormer(roof, width * 0.18, depth * 0.22, roofMat, timber, plaster);

    this.addDoorAndPorch(shell, house.doorSide, doorX, doorZ, width, depth, timber, stone);
    this.addInterior(interior, width, depth, house.ordinal, composition);
    this.addExteriorStory(shell, house.doorSide, doorX, doorZ, width, depth, house.ordinal, timber);
    this.addHouseArchetypeDetails(shell, roof, archetype, house.doorSide, doorX, doorZ, width, depth, palette, timber, stone);
    this.addArchitectureDetails(shell, roof, house, width, depth, palette, timber, stone, roofMat);

    const usesLocalLight = (archetype === 'questHouse' || archetype === 'cafe' || archetype === 'guildHall' || archetype === 'civic') && house.ordinal % 3 === 0;
    if (usesLocalLight) {
      const hearth = new THREE.PointLight(0xff9b4a, 1.1, 5.8, 1.8);
      hearth.position.set(composition.furniture.fireplace.x, 0.9, composition.furniture.fireplace.z + 0.34);
      hearth.castShadow = false;
      hearth.userData.flickerPhase = house.ordinal * 1.91;
      interior.add(hearth);
    }

    this.kit.bakeStaticGroup(shell);
    this.kit.bakeStaticGroup(interior);
    this.kit.bakeStaticGroup(roof);
    this.housePrototypeCache.set(prototypeKey, root);
    return this.instantiateHouse(root, house);
  }

  private instantiateHouse(prototype: THREE.Group, house: SettlementHouseDefinition): HouseModel {
    const root = prototype.clone(true);
    root.name = `house:${house.id}`;
    const roof = root.getObjectByName('house-roof');
    const interior = root.getObjectByName('house-interior');
    if (!(roof instanceof THREE.Group)) throw new Error('House prototype is missing its roof group.');
    if (!(interior instanceof THREE.Group)) throw new Error('House prototype is missing its interior group.');
    const centerX = (house.x0 + house.x1 + 1) * 0.5;
    const centerZ = (house.y0 + house.y1 + 1) * 0.5;
    root.position.set(centerX, 0, centerZ);
    const warmLights: THREE.PointLight[] = [];
    const outlines: THREE.LineSegments[] = [];
    root.traverse((child) => {
      if (child instanceof THREE.PointLight) warmLights.push(child);
      else if (child instanceof THREE.LineSegments) outlines.push(child);
    });
    const smokeData = root.userData.smokeLocal as [number, number, number] | undefined;
    const smokeLocal = smokeData ? new THREE.Vector3(...smokeData) : new THREE.Vector3(0, 3.9, 0);
    const smokeEnabled = root.userData.smokeEnabled === true;
    return { root, roof, interior, outlines, warmLights, smokeLocal, smokeEnabled, bounds: { x0: house.x0, y0: house.y0, x1: house.x1 + 1, y1: house.y1 + 1 } };
  }

  private addFloorPlanks(parent: THREE.Object3D, width: number, depth: number): void {
    const plankCount = Math.max(4, Math.floor(depth / 0.45));
    for (let i = 0; i < plankCount; i++) {
      const z = -depth * 0.5 + (i + 0.5) * depth / plankCount;
      const shade = i % 3 === 0 ? 0x6c4a30 : i % 3 === 1 ? 0x795438 : 0x64442e;
      this.kit.box(parent, [width, 0.025, depth / plankCount - 0.025], [0, 0.255, z], { kind: 'wood', color: shade }, { receiveShadow: true }, 0.008);
    }
  }

  private addWallPanel(
    parent: THREE.Object3D,
    x: number,
    z: number,
    rotationY: number,
    isDoor: boolean,
    side: HouseWallSide,
    index: number,
    hasWindow: boolean,
    plaster: MaterialSpec,
    stone: MaterialSpec,
    timber: MaterialSpec,
  ): void {
    const panel = this.kit.group(`wall-panel:${side}:${index}:${isDoor ? 'door' : hasWindow ? 'window' : 'solid'}`);
    panel.position.set(x, 0, z);
    panel.rotation.y = rotationY;
    parent.add(panel);
    if (isDoor) {
      // The authoritative doorway is two walkable tiles wide. The previous
      // art placed a closed slab and a full-height stone plinth across that
      // opening, so players appeared to walk through a sealed door. Keep a
      // real visual opening and hang the leaf slightly ajar from a hinge.
      for (const sideSign of [-1, 1]) {
        this.kit.box(panel, [0.13, 0.42, 0.18], [sideSign * 0.405, 0.33, 0], stone, { outline: true }, 0.025);
        this.kit.box(panel, [0.13, 1.34, 0.18], [sideSign * 0.405, 1.18, 0], plaster, { outline: true }, 0.022);
        this.kit.box(panel, [0.1, 1.7, 0.23], [sideSign * 0.44, 1.12, 0], timber, { outline: true }, 0.018);
      }
      this.kit.box(panel, [0.92, 0.12, 0.24], [0, 1.78, 0], timber, { outline: true }, 0.025);
      this.kit.box(panel, [0.68, 0.07, 0.32], [0, 0.145, 0.08], stone, { outline: true }, 0.018);
      const hinge = this.kit.group('door-hinge');
      hinge.position.set(-0.34, 0, 0.035);
      hinge.rotation.y = -0.48;
      panel.add(hinge);
      const leaf = this.kit.box(hinge, [0.68, 1.28, 0.12], [0.34, 1.09, 0], { kind: 'wood', color: 0x4e3021 }, { outline: true }, 0.075);
      leaf.name = 'door-leaf';
      this.kit.torus(hinge, 0.055, 0.012, 6, 12, [0.55, 1.08, 0.075], GOLD, { rotation: [Math.PI * 0.5, 0, 0] });
      return;
    }
    this.kit.box(panel, [0.94, 0.42, 0.18], [0, 0.33, 0], stone, { outline: true }, 0.025);
    this.kit.box(panel, [0.94, 1.28, 0.15], [0, 1.17, 0], plaster, { outline: true }, 0.025);
    this.kit.box(panel, [0.09, 1.68, 0.23], [-0.43, 1.12, 0], timber, { outline: true }, 0.018);
    this.kit.box(panel, [0.09, 1.68, 0.23], [0.43, 1.12, 0], timber, { outline: true }, 0.018);
    this.kit.box(panel, [0.96, 0.09, 0.23], [0, 1.8, 0], timber, { outline: true }, 0.018);
    if (hasWindow) {
      this.kit.box(panel, [0.43, 0.5, 0.08], [0, 1.18, 0.105], { kind: 'plain', color: 0xffbd62, emissive: 0xff7a26, emissiveIntensity: 1.15 }, { outline: true }, 0.035);
      this.kit.box(panel, [0.055, 0.56, 0.12], [0, 1.18, 0.15], timber, {}, 0.012);
      this.kit.box(panel, [0.49, 0.055, 0.12], [0, 1.18, 0.15], timber, {}, 0.012);
      this.kit.box(panel, [0.56, 0.08, 0.19], [0, 0.87, 0.12], timber, { outline: true }, 0.018);
    } else {
      this.kit.beamBetween(panel, new THREE.Vector3(-0.34, 0.56, 0.1), new THREE.Vector3(0.34, 1.68, 0.1), 0.075, 0.2, timber, true);
    }
  }

  private addUpperStorey(
    parent: THREE.Object3D,
    width: number,
    depth: number,
    level: number,
    seed: number,
    plaster: MaterialSpec,
    stone: MaterialSpec,
    timber: MaterialSpec,
  ): void {
    const baseY = 1.82 + (level - 1) * 1.72;
    this.kit.box(parent, [width - 0.58, 1.58, depth - 0.58], [0, baseY + 0.79, 0], plaster, { outline: true }, 0.035);
    this.kit.box(parent, [width - 0.42, 0.18, depth - 0.42], [0, baseY + 0.08, 0], stone, { outline: true }, 0.025);
    this.kit.box(parent, [width - 0.38, 0.13, depth - 0.38], [0, baseY + 1.57, 0], timber, { outline: true }, 0.022);
    const addWindow = (x: number, y: number, z: number, rotationY = 0): void => {
      this.kit.box(parent, [0.48, 0.58, 0.08], [x, y, z], { kind: 'plain', color: 0xffc16c, emissive: 0xff7627, emissiveIntensity: 0.92 }, { rotation: [0, rotationY, 0], outline: true }, 0.035);
      this.kit.box(parent, [0.055, 0.65, 0.12], [x, y, z], timber, { rotation: [0, rotationY, 0] }, 0.012);
      this.kit.box(parent, [0.54, 0.055, 0.12], [x, y, z], timber, { rotation: [0, rotationY, 0] }, 0.012);
    };
    const xStep = Math.max(2.2, width / Math.max(2, Math.floor(width / 2.5)));
    for (let x = -width * 0.5 + xStep; x < width * 0.5 - 0.6; x += xStep) {
      if (hash01(seed + level * 19, Math.round(x * 10)) > 0.16) {
        addWindow(x, baseY + 0.86, -depth * 0.5 + 0.27);
        addWindow(x, baseY + 0.86, depth * 0.5 - 0.27, Math.PI);
      }
    }
    const zStep = Math.max(2.4, depth / Math.max(2, Math.floor(depth / 2.6)));
    for (let z = -depth * 0.5 + zStep; z < depth * 0.5 - 0.6; z += zStep) {
      if (hash01(seed + level * 31, Math.round(z * 10)) > 0.3) {
        addWindow(-width * 0.5 + 0.27, baseY + 0.86, z, -Math.PI * 0.5);
        addWindow(width * 0.5 - 0.27, baseY + 0.86, z, Math.PI * 0.5);
      }
    }
  }

  private addRoof(parent: THREE.Object3D, width: number, depth: number, roofMat: MaterialSpec, timber: MaterialSpec, plaster: MaterialSpec, seed: number): void {
    const rise = 1.65;
    const halfSpan = depth * 0.5 + 0.42;
    const slope = Math.atan2(rise, halfSpan);
    const slopeLength = Math.hypot(halfSpan, rise);
    const rows = 7;
    for (const side of [-1, 1]) {
      for (let row = 0; row < rows; row++) {
        const t = (row + 0.5) / rows;
        const z = side * (halfSpan * t);
        const y = 1.83 + rise * (1 - t);
        const shade = colorOffset(roofMat.color, (hash01(seed + row, side) - 0.5) * 0.055);
        this.kit.box(
          parent,
          [width + 0.72, 0.09, slopeLength / rows + 0.035],
          [0, y, z],
          { ...roofMat, color: shade },
          { rotation: [side * slope, 0, 0], outline: row === 0 || row === rows - 1 },
          0.025,
        );
      }
    }
    this.kit.cylinder(parent, 0.13, 0.13, width + 0.76, 8, [0, 3.48, 0], timber, { rotation: [0, 0, Math.PI * 0.5], outline: true });
    this.kit.box(parent, [width + 0.9, 0.14, 0.14], [0, 1.75, -halfSpan - 0.02], timber, { outline: true }, 0.035);
    this.kit.box(parent, [width + 0.9, 0.14, 0.14], [0, 1.75, halfSpan + 0.02], timber, { outline: true }, 0.035);

    const shape = new THREE.Shape();
    shape.moveTo(-depth * 0.5, 0);
    shape.lineTo(depth * 0.5, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    // Match the facade instead of forcing every brick, stone and canal house
    // to end in the same beige gable.
    const gableMaterial: MaterialSpec = { ...plaster, color: colorOffset(plaster.color, -0.025) };
    const left = this.kit.extrudedShape(parent, shape, `gable:${depth}`, 0.16, [-width * 0.5 + 0.48, 2.64, 0], gableMaterial, { rotation: [0, Math.PI * 0.5, 0], outline: true });
    const right = this.kit.extrudedShape(parent, shape, `gable:${depth}`, 0.16, [width * 0.5 - 0.48, 2.64, 0], gableMaterial, { rotation: [0, Math.PI * 0.5, 0], outline: true });
    left.renderOrder = 1;
    right.renderOrder = 1;
  }

  private addChimney(parent: THREE.Object3D, x: number, z: number, stone: MaterialSpec): void {
    this.kit.box(parent, [0.58, 1.55, 0.58], [x, 2.92, z], stone, { outline: true }, 0.06);
    this.kit.box(parent, [0.72, 0.18, 0.72], [x, 3.7, z], { kind: 'stone', color: colorOffset(stone.color, 0.08) }, { outline: true }, 0.045);
    const cap = this.kit.box(parent, [0.44, 0.12, 0.44], [x, 3.84, z], { kind: 'plain', color: 0x302c29 }, { outline: true }, 0.03);
    cap.castShadow = true;
  }

  private addDormer(parent: THREE.Object3D, x: number, z: number, roofMat: MaterialSpec, timber: MaterialSpec, plaster: MaterialSpec): void {
    const dormer = this.kit.group('dormer');
    dormer.position.set(x, 2.55, z);
    parent.add(dormer);
    this.kit.box(dormer, [1.15, 0.86, 0.68], [0, 0.15, 0], plaster, { outline: true }, 0.035);
    this.kit.box(dormer, [0.62, 0.48, 0.06], [0, 0.15, 0.37], { kind: 'plain', color: 0xffc36f, emissive: 0xff7a26, emissiveIntensity: 1.1 }, { outline: true }, 0.04);
    this.kit.box(dormer, [0.08, 0.9, 0.75], [-0.52, 0.18, 0], timber, { outline: true }, 0.02);
    this.kit.box(dormer, [0.08, 0.9, 0.75], [0.52, 0.18, 0], timber, { outline: true }, 0.02);
    this.kit.box(dormer, [1.42, 0.09, 0.78], [-0.32, 0.72, 0], roofMat, { rotation: [0, 0, -0.54], outline: true }, 0.025);
    this.kit.box(dormer, [1.42, 0.09, 0.78], [0.32, 0.72, 0], roofMat, { rotation: [0, 0, 0.54], outline: true }, 0.025);
  }

  private addDoorAndPorch(
    parent: THREE.Object3D,
    side: SettlementHouseDefinition['doorSide'],
    doorX: number,
    doorZ: number,
    width: number,
    depth: number,
    timber: MaterialSpec,
    stone: MaterialSpec,
  ): void {
    const porch = this.kit.group('porch');
    parent.add(porch);
    const outward = side === 'n' ? new THREE.Vector3(0, 0, -1) : side === 's' ? new THREE.Vector3(0, 0, 1) : side === 'w' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(1, 0, 0);
    const door = new THREE.Vector3(doorX, 0, doorZ);
    const platform = door.clone().addScaledVector(outward, 0.72);
    const rotate = side === 'e' || side === 'w' ? Math.PI * 0.5 : 0;
    this.kit.box(porch, [1.65, 0.18, 1.15], [platform.x, 0.28, platform.z], timber, { rotation: [0, rotate, 0], outline: true }, 0.035);
    for (let i = 0; i < 3; i++) {
      const step = door.clone().addScaledVector(outward, 1.15 + i * 0.35);
      this.kit.box(porch, [1.45 - i * 0.12, 0.14 + i * 0.02, 0.38], [step.x, 0.08 + i * 0.08, step.z], stone, { rotation: [0, rotate, 0], outline: true }, 0.025);
    }
    const left = new THREE.Vector3(-outward.z, 0, outward.x);
    for (const sideSign of [-1, 1]) {
      const post = platform.clone().addScaledVector(left, sideSign * 0.72);
      this.kit.box(porch, [0.12, 1.05, 0.12], [post.x, 0.8, post.z], timber, { outline: true }, 0.025);
      const railStart = post.clone(); railStart.y = 0.78;
      const railEnd = door.clone().addScaledVector(left, sideSign * 0.72); railEnd.y = 0.78;
      this.kit.beamBetween(porch, railStart, railEnd, 0.09, 0.09, timber, true);
    }
    const mat = door.clone().addScaledVector(outward, 1.02);
    this.kit.box(porch, [0.9, 0.025, 0.55], [mat.x, 0.195, mat.z], { kind: 'cloth', color: 0x6b2f2d }, { rotation: [0, rotate, 0], outline: true }, 0.012);
    void width;
    void depth;
  }

  private addExteriorStory(
    parent: THREE.Object3D,
    side: SettlementHouseDefinition['doorSide'],
    doorX: number,
    doorZ: number,
    width: number,
    depth: number,
    seed: number,
    timber: MaterialSpec,
  ): void {
    const outward = side === 'n' ? new THREE.Vector3(0, 0, -1) : side === 's' ? new THREE.Vector3(0, 0, 1) : side === 'w' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3(-outward.z, 0, outward.x);
    const anchor = new THREE.Vector3(doorX, 0, doorZ).addScaledVector(outward, 0.72);
    const crate = this.kit.group('porch-crate');
    crate.position.copy(anchor).addScaledVector(tangent, 1.12);
    parent.add(crate);
    this.kit.box(crate, [0.62, 0.58, 0.62], [0, 0.38, 0], { kind: 'wood', color: 0x624029 }, { outline: true }, 0.045);
    this.kit.beamBetween(crate, new THREE.Vector3(-0.27, 0.13, 0.33), new THREE.Vector3(0.27, 0.65, 0.33), 0.065, 0.06, timber, true);
    this.kit.beamBetween(crate, new THREE.Vector3(0.27, 0.13, 0.34), new THREE.Vector3(-0.27, 0.65, 0.34), 0.065, 0.06, timber, true);

    const planter = this.kit.group('window-planter');
    planter.position.copy(anchor).addScaledVector(tangent, -1.1);
    parent.add(planter);
    this.kit.box(planter, [0.82, 0.28, 0.38], [0, 0.36, 0], { kind: 'wood', color: 0x65402a }, { outline: true }, 0.04);
    for (let i = 0; i < 5; i++) {
      const x = -0.3 + i * 0.15;
      this.kit.beamBetween(planter, new THREE.Vector3(x, 0.48, 0), new THREE.Vector3(x + (hash01(seed, i) - 0.5) * 0.08, 0.78 + (i % 2) * 0.09, 0), 0.028, 0.022, { kind: 'foliage', color: 0x3e6b3b }, false);
      this.kit.sphere(planter, 0.075, 7, [x, 0.78 + (i % 2) * 0.09, 0], { kind: 'foliage', color: i % 2 ? 0xd2a348 : 0x884b6d }, { scale: [1, 0.7, 1], outline: true });
    }

    const lantern = this.kit.group('porch-lantern');
    lantern.position.copy(anchor).addScaledVector(tangent, -0.52);
    lantern.position.y = 1.5;
    parent.add(lantern);
    this.kit.box(lantern, [0.28, 0.42, 0.28], [0, 0, 0], { kind: 'metal', color: 0x303238, metalness: 0.55 }, { outline: true }, 0.035);
    this.kit.box(lantern, [0.17, 0.29, 0.17], [0, 0, 0], { kind: 'plain', color: 0xffbd5f, emissive: 0xff6a22, emissiveIntensity: 1.8, transparent: true, opacity: 0.86 }, {}, 0.025);
    const light = new THREE.PointLight(0xff9c4d, 0.52, 4.2, 2);
    light.userData.flickerPhase = seed * 0.83 + 4;
    lantern.add(light);

    if (seed % 2 === 0) {
      const awning = this.kit.group('side-awning');
      awning.position.set(-outward.x * (width * 0.5 - 0.15), 1.35, -outward.z * (depth * 0.5 - 0.15));
      parent.add(awning);
      this.kit.box(awning, [1.8, 0.08, 1.05], [0, 0, 0], { kind: 'cloth', color: 0x31506f }, { rotation: [0.12, 0, 0], outline: true }, 0.025);
    }
  }

  private addArchitectureDetails(
    shell: THREE.Object3D,
    roof: THREE.Object3D,
    house: SettlementHouseDefinition,
    width: number,
    depth: number,
    palette: ArtPalette,
    timber: MaterialSpec,
    stone: MaterialSpec,
    roofMat: MaterialSpec,
  ): void {
    const variant = house.districtVariant ?? 0;
    switch (house.architecture) {
      case 'witch-crooked': {
        roof.rotation.z = (variant - 2) * 0.012;
        for (const side of [-1, 1]) {
          const charm = this.kit.group('witch-ward-charm');
          charm.position.set(side * Math.min(width * 0.34, 2.4), 2.15 + (side > 0 ? 0.18 : 0), depth * 0.5 + 0.16);
          shell.add(charm);
          this.kit.beamBetween(charm, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 0), 0.025, 0.02, { kind: 'cloth', color: 0x3a293f }, false);
          this.kit.torus(charm, 0.16, 0.025, 5, 9, [0, -0.1, 0], { kind: 'metal', color: palette.accent, metalness: 0.36 }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
        }
        break;
      }
      case 'green-homestead': {
        for (const side of [-1, 1]) {
          const hedge = this.kit.group('homestead-hedge');
          hedge.position.set(side * Math.min(width * 0.38, 2.9), 0, depth * 0.5 + 0.82);
          shell.add(hedge);
          for (let i = -1; i <= 1; i++) this.kit.sphere(hedge, 0.28, 8, [i * 0.35, 0.37 + (i % 2) * 0.04, 0], { kind: 'foliage', color: colorOffset(palette.floor, 0.04 + variant * 0.008) }, { scale: [1.1, 0.82, 0.9], outline: i === 0 });
        }
        break;
      }
      case 'rainforest-stilt': {
        for (const x of [-width * 0.38, width * 0.38]) for (const z of [-depth * 0.38, depth * 0.38]) {
          this.kit.cylinder(shell, 0.12, 0.16, 0.72, 7, [x, 0.18, z], timber, { outline: true });
        }
        for (const side of [-1, 1]) this.kit.beamBetween(roof, new THREE.Vector3(side * width * 0.42, 2.1, -depth * 0.45), new THREE.Vector3(side * width * 0.42, 2.1, depth * 0.45), 0.035, 0.035, { kind: 'cloth', color: 0x8d6c42 }, true);
        break;
      }
      case 'frost-steep': {
        const snow: MaterialSpec = { kind: 'plain', color: 0xdce8ed, roughness: 0.92 };
        for (const side of [-1, 1]) this.kit.box(roof, [width * 0.88, 0.08, 0.34], [0, 3.18, side * depth * 0.18], snow, { rotation: [side * 0.42, 0, 0], outline: true }, 0.05);
        this.kit.box(shell, [width * 0.42, 0.12, 0.18], [0, 1.45, depth * 0.5 + 0.18], { kind: 'crystal', color: 0x8fd5e8, emissive: 0x315f7a, emissiveIntensity: 0.25 }, { outline: true }, 0.04);
        break;
      }
      case 'desert-courtyard': {
        for (const side of [-1, 1]) this.kit.box(roof, [width * 0.34, 0.42, 0.32], [side * width * 0.32, 2.0, 0], stone, { outline: true }, 0.055);
        const canopy = this.kit.group('desert-canopy');
        canopy.position.set(0, 1.55, depth * 0.5 + 1.0);
        shell.add(canopy);
        this.kit.box(canopy, [Math.min(3.2, width * 0.55), 0.08, 1.35], [0, 0, 0], { kind: 'cloth', color: variant % 2 === 0 ? 0xb84f3b : 0xd2a84f }, { rotation: [0.12, 0, 0], outline: true }, 0.03);
        break;
      }
      case 'cinder-industrial': {
        const metal: MaterialSpec = { kind: 'metal', color: 0x50535a, metalness: 0.62, roughness: 0.46 };
        const pipeX = width * 0.5 + 0.18;
        this.kit.cylinder(shell, 0.09, 0.11, 2.2, 8, [pipeX, 1.2, -depth * 0.18], metal, { outline: true });
        this.kit.torus(shell, 0.18, 0.045, 6, 10, [pipeX, 2.24, -depth * 0.18], metal, { rotation: [0, 0, Math.PI * 0.5], outline: true });
        this.kit.box(roof, [1.4, 0.1, 0.68], [-width * 0.24, 2.2, 0], { ...roofMat, color: colorOffset(roofMat.color, -0.06) }, { rotation: [0, 0, -0.08], outline: true }, 0.03);
        break;
      }
      default:
        break;
    }
  }

  private addHouseArchetypeDetails(
    shell: THREE.Object3D,
    roof: THREE.Object3D,
    archetype: HouseArchetype,
    side: HouseWallSide,
    doorX: number,
    doorZ: number,
    width: number,
    depth: number,
    palette: ArtPalette,
    timber: MaterialSpec,
    stone: MaterialSpec,
  ): void {
    const outward = side === 'n' ? new THREE.Vector3(0, 0, -1) : side === 's' ? new THREE.Vector3(0, 0, 1) : side === 'w' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3(-outward.z, 0, outward.x);
    const front = new THREE.Vector3(doorX, 0, doorZ).addScaledVector(outward, 0.88);

    if (archetype === 'shop' || archetype === 'cafe') {
      const awning = this.kit.group('shop-awning');
      awning.position.copy(front).setY(1.72);
      awning.rotation.y = Math.atan2(outward.x, outward.z);
      shell.add(awning);
      for (let stripe = -2; stripe <= 2; stripe++) this.kit.box(awning, [0.48, 0.08, 1.25], [stripe * 0.46, 0, 0], { kind: 'cloth', color: stripe % 2 === 0 ? 0xb64f3d : 0xe8d19a }, { rotation: [0.13, 0, 0], outline: true }, 0.025);
      const sign = this.kit.group('shop-sign');
      sign.position.copy(front).addScaledVector(tangent, 1.55).setY(1.9);
      shell.add(sign);
      this.kit.box(sign, [0.9, 0.58, 0.12], [0, 0, 0], { kind: 'wood', color: 0x69432b }, { outline: true }, 0.05);
      this.kit.sphere(sign, 0.15, 8, [0, 0, 0.09], { kind: 'metal', color: palette.accent, metalness: 0.45 }, { scale: [1.4, 0.75, 0.25], outline: true });
      return;
    }

    if (archetype === 'guildHall' || archetype === 'marketHall' || archetype === 'office' || archetype === 'civic') {
      this.kit.box(roof, [2.7, 1.25, 2.25], [0, 3.55, 0], stone, { outline: true }, 0.1);
      this.kit.cone(roof, 1.85, 1.25, 4, [0, 4.8, 0], { kind: 'roof', color: colorOffset(palette.brick, -0.2) }, { rotation: [0, Math.PI * 0.25, 0], outline: true });
      for (const direction of [-1, 1]) {
        const banner = this.kit.group('guild-banner');
        banner.position.copy(front).addScaledVector(tangent, direction * 1.45).setY(1.55);
        shell.add(banner);
        this.kit.box(banner, [0.52, 1.28, 0.055], [0, 0, 0], { kind: 'cloth', color: direction > 0 ? palette.accent : colorOffset(palette.accent, -0.12) }, { outline: true }, 0.035);
        this.kit.box(banner, [0.7, 0.08, 0.1], [0, 0.72, 0], GOLD, { outline: true }, 0.02);
      }
      return;
    }

    if (archetype === 'workshop') {
      const leanTo = this.kit.group('workshop-lean-to');
      leanTo.position.set(width * 0.5 + 0.75, 1.25, 0);
      shell.add(leanTo);
      this.kit.box(leanTo, [1.8, 0.1, depth * 0.7], [0, 0, 0], { kind: 'roof', color: 0x4f3b2b }, { rotation: [0, 0, -0.16], outline: true }, 0.035);
      for (const z of [-depth * 0.25, depth * 0.25]) this.kit.box(leanTo, [0.13, 1.6, 0.13], [0.65, -0.75, z], timber, { outline: true }, 0.025);
      this.kit.box(leanTo, [0.75, 0.18, 0.5], [0.55, -0.35, 0], IRON, { outline: true }, 0.04);
      return;
    }

    if (archetype === 'lodge' || archetype === 'questHouse' || archetype === 'manor') {
      for (const x of [-width * 0.5 + 0.35, width * 0.5 - 0.35]) for (const z of [-depth * 0.5 + 0.35, depth * 0.5 - 0.35]) {
        this.kit.cylinder(shell, 0.28, 0.34, 2.1, 8, [x, 1.05, z], stone, { outline: true });
      }
      const crest = this.kit.group('lodge-crest');
      crest.position.copy(front).setY(2.05);
      shell.add(crest);
      this.kit.cylinder(crest, 0.34, 0.34, 0.12, 10, [0, 0, 0], { kind: 'metal', color: 0x7d6a48, metalness: 0.55 }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
      this.kit.beamBetween(crest, new THREE.Vector3(-0.24, -0.2, 0.08), new THREE.Vector3(0.24, 0.2, 0.08), 0.055, 0.05, GOLD, true);
      return;
    }

    // Cottages get a low, asymmetrical herb garden instead of commercial trim.
    const garden = this.kit.group('cottage-garden');
    garden.position.copy(front).addScaledVector(tangent, -1.5);
    shell.add(garden);
    this.kit.box(garden, [1.2, 0.22, 0.65], [0, 0.24, 0], { kind: 'wood', color: 0x67432b }, { outline: true }, 0.04);
    for (let i = -2; i <= 2; i++) this.kit.sphere(garden, 0.13, 7, [i * 0.2, 0.5 + (i % 2) * 0.04, 0], { kind: 'foliage', color: i % 2 === 0 ? 0x527a3c : 0x8b5a78 }, { outline: true });
  }

  private addInterior(parent: THREE.Object3D, width: number, depth: number, seed: number, composition: HouseComposition): void {
    const innerW = width - 2.15;
    const innerD = depth - 2.15;
    const { fireplace, bookshelf, bed, workbench, barrels } = composition.furniture;
    this.addFireplace(parent, fireplace.x, fireplace.z, fireplace.rotationY);
    this.addBookshelf(parent, bookshelf.x, bookshelf.z, seed, bookshelf.rotationY);
    this.addBed(parent, bed.x, bed.z, seed, bed.rotationY);
    this.addDiningSet(parent, 0, 0.1, seed);
    this.addWorkbench(parent, workbench.x, workbench.z, seed, workbench.rotationY);
    this.addBarrels(parent, barrels.x, barrels.z, seed);
    this.addRug(parent, 0, 0.12, Math.min(3.4, innerW * 0.55), Math.min(2.25, innerD * 0.5), seed);
  }

  private addFireplace(parent: THREE.Object3D, x: number, z: number, rotationY: number): void {
    const group = this.kit.group('fireplace');
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    parent.add(group);
    this.kit.box(group, [1.25, 0.25, 0.72], [0, 0.37, 0], STONE, { outline: true }, 0.05);
    this.kit.box(group, [0.9, 1.15, 0.56], [0, 0.95, 0], STONE, { outline: true }, 0.06);
    this.kit.box(group, [0.58, 0.6, 0.1], [0, 0.77, 0.34], { kind: 'plain', color: 0x1c1511 }, { outline: true }, 0.06);
    this.kit.cone(group, 0.24, 0.62, 7, [0, 0.68, 0.39], { kind: 'plain', color: 0xffa13d, emissive: 0xff4f1c, emissiveIntensity: 2.4 }, { outline: true });
    this.kit.box(group, [1.42, 0.16, 0.78], [0, 1.56, 0], { kind: 'stone', color: 0x74716a }, { outline: true }, 0.04);
  }

  private addBookshelf(parent: THREE.Object3D, x: number, z: number, seed: number, rotationY: number): void {
    const group = this.kit.group('bookshelf');
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    parent.add(group);
    this.kit.box(group, [1.25, 1.5, 0.28], [0, 1.03, 0], DARK_WOOD, { outline: true }, 0.04);
    this.kit.box(group, [1.08, 1.28, 0.08], [0, 1.03, 0.19], { kind: 'wood', color: 0x5a3b29 }, {}, 0.02);
    for (let shelf = 0; shelf < 4; shelf++) {
      this.kit.box(group, [1.18, 0.08, 0.36], [0, 0.46 + shelf * 0.36, 0.04], WOOD, { outline: shelf === 0 || shelf === 3 }, 0.018);
      for (let book = 0; book < 7; book++) {
        const height = 0.18 + hash01(seed + shelf, book) * 0.12;
        const color = [0x7d3c35, 0x31566f, 0x755b31, 0x4d6941, 0x5d3f70][(book + shelf + seed) % 5];
        this.kit.box(group, [0.09, height, 0.17], [-0.45 + book * 0.15, 0.55 + shelf * 0.36 + height * 0.5, 0.23], { kind: 'leather', color }, { rotation: [0, 0, (hash01(seed, book + shelf * 9) - 0.5) * 0.12], outline: false }, 0.012);
      }
    }
  }

  private addBed(parent: THREE.Object3D, x: number, z: number, seed: number, rotationY: number): void {
    const group = this.kit.group('bed');
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    parent.add(group);
    this.kit.box(group, [1.25, 0.24, 2.05], [0, 0.46, 0], WOOD, { outline: true }, 0.05);
    this.kit.box(group, [1.08, 0.22, 1.82], [0, 0.66, 0.05], { kind: 'cloth', color: 0xd2c7ad }, { outline: true }, 0.07);
    this.kit.box(group, [1.13, 0.12, 1.05], [0, 0.83, 0.42], { kind: 'cloth', color: seed % 3 === 0 ? 0x315880 : 0x5e3d48 }, { outline: true }, 0.035);
    this.kit.box(group, [0.88, 0.18, 0.42], [0, 0.85, -0.58], { kind: 'cloth', color: 0xe2d6bd }, { outline: true }, 0.08);
    for (const px of [-0.56, 0.56]) {
      this.kit.box(group, [0.12, 1.05, 0.12], [px, 0.72, -0.92], WOOD, { outline: true }, 0.025);
    }
  }

  private addDiningSet(parent: THREE.Object3D, x: number, z: number, seed: number): void {
    const group = this.kit.group('dining-set');
    group.position.set(x, 0, z);
    group.rotation.y = hash01(seed, 27) * 0.16 - 0.08;
    parent.add(group);
    this.kit.box(group, [1.8, 0.18, 1.05], [0, 0.92, 0], WOOD, { outline: true }, 0.055);
    for (const px of [-0.72, 0.72]) for (const pz of [-0.36, 0.36]) {
      this.kit.box(group, [0.13, 0.8, 0.13], [px, 0.48, pz], DARK_WOOD, { outline: true }, 0.025);
    }
    for (const side of [-1, 1]) this.addChair(group, side * 1.28, 0, side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
    this.kit.cylinder(group, 0.16, 0.18, 0.1, 12, [-0.3, 1.07, 0], { kind: 'plain', color: 0x966235 }, { outline: true });
    this.kit.sphere(group, 0.11, 8, [0.35, 1.11, 0.08], { kind: 'plain', color: 0xb24832 }, { outline: true });
  }

  private addChair(parent: THREE.Object3D, x: number, z: number, rotationY: number): void {
    const group = this.kit.group('chair');
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    parent.add(group);
    this.kit.box(group, [0.72, 0.12, 0.68], [0, 0.58, 0], WOOD, { outline: true }, 0.035);
    for (const px of [-0.27, 0.27]) for (const pz of [-0.24, 0.24]) this.kit.box(group, [0.1, 0.58, 0.1], [px, 0.29, pz], DARK_WOOD, { outline: true }, 0.018);
    this.kit.box(group, [0.72, 0.82, 0.12], [0, 0.98, -0.28], WOOD, { outline: true }, 0.035);
  }

  private addWorkbench(parent: THREE.Object3D, x: number, z: number, seed: number, rotationY: number): void {
    const group = this.kit.group('workbench');
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    parent.add(group);
    this.kit.box(group, [1.65, 0.17, 0.72], [0, 0.82, 0], { kind: 'wood', color: 0x5e3d29 }, { outline: true }, 0.045);
    for (const px of [-0.68, 0.68]) this.kit.box(group, [0.14, 0.78, 0.14], [px, 0.4, 0], DARK_WOOD, { outline: true }, 0.025);
    this.kit.box(group, [0.55, 0.09, 0.22], [-0.36, 0.97, 0], IRON, { rotation: [0, 0.25, 0], outline: true }, 0.018);
    this.kit.cylinder(group, 0.08, 0.1, 0.62, 7, [0.42, 1.05, 0], WOOD, { rotation: [0, 0, 0.8], outline: true });
    this.kit.box(group, [0.28, 0.08, 0.12], [0.62, 1.26, 0], GOLD, { rotation: [0, 0, hash01(seed, 8) * 0.4 - 0.2], outline: true }, 0.018);
  }

  private addBarrels(parent: THREE.Object3D, x: number, z: number, seed: number): void {
    for (let i = 0; i < 2; i++) {
      const group = this.kit.group('barrel');
      group.position.set(x + i * 0.58, 0, z + (i % 2) * 0.12);
      group.rotation.y = hash01(seed, i) * Math.PI;
      parent.add(group);
      this.kit.cylinder(group, 0.29, 0.29, 0.72, 12, [0, 0.48, 0], { kind: 'wood', color: 0x704629 }, { outline: true });
      for (const py of [0.25, 0.48, 0.71]) this.kit.torus(group, 0.292, 0.025, 5, 12, [0, py, 0], IRON, { rotation: [Math.PI * 0.5, 0, 0] });
    }
  }

  private addRug(parent: THREE.Object3D, x: number, z: number, width: number, depth: number, seed: number): void {
    const rug = this.kit.box(parent, [width, 0.028, depth], [x, 0.292, z], { kind: 'cloth', color: seed % 2 === 0 ? 0x713d34 : 0x394f72 }, { outline: true }, 0.08);
    rug.receiveShadow = true;
    for (const px of [-width * 0.38, width * 0.38]) this.kit.box(parent, [0.07, 0.035, depth * 0.82], [x + px, 0.31, z], { kind: 'cloth', color: 0xc49a52 }, {}, 0.018);
  }

  makeHero(baseColor = 0x3a4e64, accentColor = 0x315f8c): CharacterModel {
    const root = this.kit.group('hero');
    const body = this.kit.group('hero-body');
    root.add(body);
    this.addBlobShadow(root, 0.7, 0.52);

    const leftLeg = this.kit.group('left-leg');
    const rightLeg = this.kit.group('right-leg');
    leftLeg.position.x = -0.17;
    rightLeg.position.x = 0.17;
    body.add(leftLeg, rightLeg);
    for (const leg of [leftLeg, rightLeg]) {
      this.kit.box(leg, [0.22, 0.5, 0.24], [0, 0.42, 0], { kind: 'cloth', color: 0x25272d }, { outline: true }, 0.04);
      this.kit.box(leg, [0.28, 0.34, 0.34], [0, 0.2, 0.05], { kind: 'leather', color: 0x3d2b22 }, { outline: true }, 0.055);
      this.kit.box(leg, [0.3, 0.14, 0.48], [0, 0.08, 0.11], { kind: 'leather', color: 0x2e211c }, { outline: true }, 0.05);
    }

    this.kit.cylinder(body, 0.34, 0.42, 0.75, 10, [0, 0.92, 0], { kind: 'leather', color: baseColor }, { outline: true });
    this.kit.box(body, [0.72, 0.18, 0.36], [0, 1.16, 0], { kind: 'metal', color: 0x59616b, metalness: 0.46, roughness: 0.43 }, { outline: true }, 0.06);
    this.kit.box(body, [0.78, 0.12, 0.42], [0, 0.72, 0], LEATHER, { outline: true }, 0.035);
    for (let i = 0; i < 4; i++) this.kit.box(body, [0.12, 0.18, 0.12], [-0.24 + i * 0.16, 0.71, 0.25], GOLD, { outline: true }, 0.022);

    const leftArm = this.kit.group('left-arm');
    const rightArm = this.kit.group('right-arm');
    leftArm.position.set(-0.47, 1.0, 0);
    rightArm.position.set(0.47, 1.0, 0);
    body.add(leftArm, rightArm);
    root.userData.rig = { leftLeg, rightLeg, leftArm, rightArm };
    for (const [arm, sign] of [[leftArm, -1], [rightArm, 1]] as const) {
      this.kit.sphere(arm, 0.22, 9, [0, 0.13, 0], { kind: 'metal', color: sign < 0 ? 0x4a5360 : 0x596572, metalness: 0.52, roughness: 0.4 }, { scale: [1.2, 0.75, 1], outline: true });
      const forearm = this.kit.box(arm, [0.2, 0.52, 0.22], [sign * 0.06, -0.23, 0], LEATHER, { rotation: [0, 0, sign * 0.17], outline: true }, 0.045);
      forearm.castShadow = true;
      this.kit.box(arm, [0.24, 0.2, 0.28], [sign * 0.11, -0.5, 0.02], { kind: 'metal', color: 0x69727a, metalness: 0.52 }, { outline: true }, 0.04);
    }

    this.kit.sphere(body, 0.235, 14, [0, 1.52, 0.015], SKIN, { scale: [0.92, 1.08, 0.9], outline: true });
    this.kit.sphere(body, 0.245, 12, [0, 1.63, -0.045], HAIR, { scale: [1, 0.72, 1], outline: true });
    const beardShape = new THREE.Shape();
    beardShape.moveTo(-0.17, 0.12);
    beardShape.lineTo(0.17, 0.12);
    beardShape.lineTo(0.1, -0.23);
    beardShape.lineTo(0, -0.31);
    beardShape.lineTo(-0.1, -0.23);
    beardShape.closePath();
    this.kit.extrudedShape(body, beardShape, 'hero-beard', 0.08, [0, 1.45, 0.21], HAIR, { rotation: [0, 0, 0], outline: true });
    for (const eyeX of [-0.075, 0.075]) this.kit.sphere(body, 0.025, 7, [eyeX, 1.56, 0.213], INK, {});

    const capeShape = new THREE.Shape();
    capeShape.moveTo(-0.35, 0.38);
    capeShape.lineTo(0.35, 0.38);
    capeShape.lineTo(0.28, -0.55);
    capeShape.lineTo(0.05, -0.75);
    capeShape.lineTo(-0.3, -0.58);
    capeShape.closePath();
    this.kit.extrudedShape(body, capeShape, 'hero-cape', 0.08, [0, 1.02, -0.29], { kind: 'cloth', color: accentColor }, { rotation: [0, Math.PI, 0], outline: true });
    this.kit.torus(body, 0.36, 0.08, 7, 14, [0, 1.27, 0], { kind: 'cloth', color: accentColor }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });

    const weaponPivot = this.kit.group('weapon-pivot');
    weaponPivot.position.set(0.43, 1.02, 0.08);
    body.add(weaponPivot);
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.055, -0.45);
    bladeShape.lineTo(0.055, -0.45);
    bladeShape.lineTo(0.095, 0.32);
    bladeShape.lineTo(0, 0.52);
    bladeShape.lineTo(-0.095, 0.32);
    bladeShape.closePath();
    this.kit.extrudedShape(weaponPivot, bladeShape, 'hero-sword-blade', 0.055, [0, 0, 0.56], IRON, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
    this.kit.box(weaponPivot, [0.42, 0.08, 0.1], [0, 0, 0.07], GOLD, { outline: true }, 0.025);
    this.kit.cylinder(weaponPivot, 0.055, 0.065, 0.34, 8, [0, 0, -0.15], LEATHER, { rotation: [Math.PI * 0.5, 0, 0], outline: true });

    // Secondary forms make the hero readable as a production character rather
    // than a stack of primitives: layered cuirass, straps, pouches, scabbard,
    // hood, hair clumps and asymmetrical utility gear.
    this.kit.box(body, [0.54, 0.44, 0.11], [0, 1.0, 0.31], { kind: 'leather', color: 0x4f3022 }, { rotation: [0.03, 0, 0], outline: true }, 0.045);
    this.kit.box(body, [0.4, 0.31, 0.07], [0, 1.04, 0.385], { kind: 'metal', color: 0x606975, metalness: 0.72, roughness: 0.3 }, { outline: true }, 0.035);
    for (const side of [-1, 1]) {
      this.kit.box(body, [0.12, 0.7, 0.065], [side * 0.22, 1.0, 0.39], { kind: 'leather', color: 0x6c442c }, { rotation: [0, 0, side * 0.12], outline: true }, 0.025);
      this.kit.box(body, [0.24, 0.18, 0.16], [side * 0.28, 0.64, 0.19], { kind: 'leather', color: side < 0 ? 0x6b442b : 0x4e3325 }, { outline: true }, 0.04);
      this.kit.box(body, [0.24, 0.13, 0.3], [side * 0.18, 0.37, 0.08], { kind: 'metal', color: 0x515963, metalness: 0.62, roughness: 0.38 }, { rotation: [0, 0, side * 0.03], outline: true }, 0.035);
    }
    this.kit.torus(body, 0.15, 0.027, 6, 16, [0, 0.73, 0.31], GOLD, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
    this.kit.box(body, [0.1, 0.1, 0.08], [0, 0.73, 0.37], { kind: 'crystal', color: 0x5daee0, emissive: 0x245a85, emissiveIntensity: 0.35 }, { rotation: [0, 0, Math.PI * 0.25], outline: true }, 0.018);

    // Hood rim, nose, ears and layered hair break the spherical head silhouette.
    this.kit.torus(body, 0.255, 0.052, 7, 18, [0, 1.59, -0.02], { kind: 'cloth', color: accentColor }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
    this.kit.cone(body, 0.045, 0.13, 6, [0, 1.53, 0.235], SKIN, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
    for (const side of [-1, 1]) {
      this.kit.sphere(body, 0.052, 8, [side * 0.225, 1.55, 0.02], SKIN, { scale: [0.5, 1.0, 0.65], outline: true });
      this.kit.cone(body, 0.075, 0.25, 7, [side * 0.13, 1.72, -0.02], HAIR, { rotation: [0.28, side * 0.24, side * 0.2], outline: true });
    }
    for (let i = 0; i < 5; i++) {
      this.kit.cone(body, 0.07, 0.26 + (i % 2) * 0.07, 7, [-0.18 + i * 0.09, 1.73 + (i % 2) * 0.025, 0.015], HAIR, { rotation: [0.22, (i - 2) * 0.18, (i - 2) * 0.11], outline: i === 0 || i === 4 });
    }

    // Back gear: scabbard, bedroll, backpack and potion.
    this.kit.box(body, [0.25, 0.58, 0.22], [-0.32, 0.95, -0.34], { kind: 'leather', color: 0x493126 }, { rotation: [0.08, 0, -0.16], outline: true }, 0.06);
    this.kit.cylinder(body, 0.12, 0.12, 0.62, 10, [0.05, 1.27, -0.38], { kind: 'cloth', color: 0x6b5140 }, { rotation: [0, 0, Math.PI * 0.5], outline: true });
    this.kit.box(body, [0.12, 0.86, 0.1], [-0.34, 0.8, -0.22], { kind: 'leather', color: 0x30231d }, { rotation: [0.18, 0, -0.18], outline: true }, 0.025);
    this.kit.sphere(body, 0.085, 9, [0.34, 0.72, 0.25], { kind: 'crystal', color: 0x4b85c5, transparent: true, opacity: 0.78, emissive: 0x173d68, emissiveIntensity: 0.28 }, { scale: [0.72, 1.15, 0.72], outline: true });
    this.kit.torus(body, 0.075, 0.018, 5, 10, [0.34, 0.8, 0.25], GOLD, { rotation: [Math.PI * 0.5, 0, 0] });

    return { root, body, weaponPivot };
  }

  makeNpc(baseColor: number, accentColor: number): CharacterModel {
    const model = this.makeHero(baseColor, accentColor);
    model.root.name = 'npc';
    model.root.scale.setScalar(0.9);
    if (model.weaponPivot) model.weaponPivot.visible = false;
    return model;
  }

  makeEnemy(kind: string): CharacterModel {
    if (kind === 'wallworm') return this.makeWallWorm();
    const root = this.kit.group(`enemy:${kind}`);
    const body = this.kit.group('enemy-body');
    root.add(body);
    this.addBlobShadow(root, 0.66, 0.52);
    const shellColor = kind === 'spitter' ? 0x654b85 : kind === 'shellbug' ? 0x355f53 : 0x713f37;
    this.kit.sphere(body, kind === 'shellbug' ? 0.49 : 0.39, 10, [0, 0.48, 0], { kind: 'leather', color: shellColor }, { scale: [1.2, 0.72, 1.42], outline: true });
    this.kit.sphere(body, 0.28, 10, [0, 0.53, 0.46], { kind: 'plain', color: colorOffset(shellColor, 0.05) }, { scale: [1, 0.8, 1], outline: true });
    for (const side of [-1, 1]) {
      this.kit.sphere(body, 0.06, 8, [side * 0.13, 0.62, 0.68], { kind: 'plain', color: 0xffbf54, emissive: 0xff4d24, emissiveIntensity: 1.7 }, { outline: true });
    }
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = (Math.floor(i / 2) - 1) * 0.28;
      this.kit.beamBetween(body, new THREE.Vector3(side * 0.28, 0.38, z), new THREE.Vector3(side * 0.68, 0.08, z + 0.08), 0.075, 0.075, { kind: 'plain', color: 0x262429 }, true);
    }
    if (kind === 'shellbug') {
      for (let i = 0; i < 5; i++) this.kit.cone(body, 0.11, 0.42, 6, [(i - 2) * 0.18, 0.87, -0.04], { kind: 'stone', color: 0x6f8077 }, { rotation: [0.15, 0, (i - 2) * 0.08], outline: true });
    }
    return { root, body };
  }

  private makeWallWorm(): CharacterModel {
    const root = this.kit.group('enemy:wallworm');
    const body = this.kit.group('enemy-body');
    root.add(body);
    this.addBlobShadow(root, 0.62, 0.55);
    for (let i = 0; i < 6; i++) {
      this.kit.sphere(body, 0.31 - i * 0.018, 10, [0, 0.28 + i * 0.18, i * 0.11], { kind: 'leather', color: colorOffset(0x8d4e3d, -i * 0.012) }, { outline: true });
      if (i < 4) {
        for (const side of [-1, 1]) this.kit.cone(body, 0.075, 0.25, 6, [side * 0.26, 0.35 + i * 0.18, i * 0.11], { kind: 'stone', color: 0xd5b37d }, { rotation: [0, 0, -side * Math.PI * 0.5], outline: true });
      }
    }
    this.kit.cone(body, 0.28, 0.5, 7, [0, 0.52, 0.55], { kind: 'stone', color: 0xd3b27b }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
    return { root, body };
  }

  makeAnimal(kind: string, pet = false): CharacterModel {
    const root = this.kit.group(pet ? 'companion' : `animal:${kind}`);
    const body = this.kit.group('animal-body');
    root.add(body);
    this.addBlobShadow(root, pet ? 0.48 : 0.6, pet ? 0.36 : 0.48);
    const isChicken = kind === 'chicken';
    const baseColor = pet ? 0xc46f32 : isChicken ? 0xdfd4bb : kind.includes('deer') ? 0x8c5e3c : kind.includes('ox') ? 0x4d4139 : kind.includes('camel') ? 0xb27d4e : 0x795a43;
    if (isChicken) {
      this.kit.sphere(body, 0.28, 10, [0, 0.34, 0], { kind: 'foliage', color: baseColor }, { scale: [0.85, 1, 1], outline: true });
      this.kit.sphere(body, 0.15, 9, [0, 0.59, 0.22], { kind: 'plain', color: 0xd4a63f }, { outline: true });
      this.kit.cone(body, 0.08, 0.22, 5, [0, 0.58, 0.43], { kind: 'plain', color: 0xc2732c }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
      return { root, body };
    }
    this.kit.sphere(body, pet ? 0.36 : 0.45, 11, [0, 0.57, 0], { kind: 'fur', color: baseColor }, { scale: [1.32, 0.78, 1], outline: true });
    this.kit.sphere(body, pet ? 0.22 : 0.25, 10, [0, 0.82, 0.46], { kind: 'fur', color: colorOffset(baseColor, 0.03) }, { scale: [0.92, 0.95, 1.12], outline: true });
    this.kit.cone(body, pet ? 0.14 : 0.12, pet ? 0.38 : 0.32, 6, [0, 0.76, 0.72], { kind: 'fur', color: colorOffset(baseColor, 0.05) }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
    for (const x of [-0.28, 0.28]) for (const z of [-0.25, 0.25]) this.kit.cylinder(body, 0.055, 0.065, 0.5, 7, [x, 0.26, z], { kind: 'plain', color: 0x3c3028 }, { outline: true });
    for (const side of [-1, 1]) this.kit.cone(body, 0.1, 0.34, 5, [side * 0.13, 1.05, 0.38], { kind: 'fur', color: baseColor }, { rotation: [0.12, 0, side * 0.22], outline: true });
    if (pet) {
      this.kit.box(body, [0.62, 0.24, 0.62], [0, 0.88, -0.08], { kind: 'leather', color: 0x59432e }, { outline: true }, 0.06);
      this.kit.box(body, [0.48, 0.18, 0.46], [0, 1.02, -0.08], { kind: 'cloth', color: 0x31577a }, { outline: true }, 0.055);
      this.kit.torus(body, 0.22, 0.035, 6, 12, [0, 0.78, 0.31], GOLD, { rotation: [Math.PI * 0.5, 0, 0] });
      this.kit.sphere(body, 0.055, 7, [-0.075, 0.87, 0.68], INK, {});
      this.kit.sphere(body, 0.055, 7, [0.075, 0.87, 0.68], INK, {});
      this.kit.sphere(body, 0.05, 7, [0, 0.78, 0.82], { kind: 'plain', color: 0x1b1614 }, {});
      this.kit.cone(body, 0.22, 0.75, 7, [0, 0.7, -0.7], { kind: 'fur', color: baseColor }, { rotation: [-Math.PI * 0.42, 0, 0], outline: true });
      for (const side of [-1, 1]) {
        this.kit.box(body, [0.23, 0.3, 0.12], [side * 0.38, 0.75, -0.06], { kind: 'leather', color: 0x4d3427 }, { outline: true }, 0.04);
        this.kit.torus(body, 0.105, 0.018, 5, 10, [side * 0.38, 0.81, 0.01], GOLD, { rotation: [Math.PI * 0.5, 0, 0] });
      }
      this.kit.box(body, [0.18, 0.12, 0.08], [0, 0.79, 0.48], { kind: 'metal', color: 0x69727a, metalness: 0.62 }, { outline: true }, 0.025);
      this.kit.sphere(body, 0.075, 8, [0.42, 0.7, -0.08], { kind: 'crystal', color: 0xffa94f, emissive: 0xff7a24, emissiveIntensity: 0.65 }, { scale: [0.65, 1.0, 0.65], outline: true });
    }
    return { root, body };
  }

  makeTree(seed: number, palette: ArtPalette, landId = 'green-land'): THREE.Group {
    if (landId === 'sunscorched-desert') return this.makeDesertTree(seed, palette);
    if (landId === 'cinder-coast') return this.makeCharredTree(seed, palette);
    if (landId === 'witchlands') return this.makeTwistedTree(seed, palette);
    if (landId === 'frostlands' && (seed >>> 0) % 5 !== 0) return this.makePineTree(seed ^ 0x71f0432d, palette);
    const variant = (seed >>> 0) % 12;
    if (variant === 0) {
      const ancient = this.makeAncientTree(seed ^ 0x41c64e6d, palette);
      ancient.name = 'tree:ancient';
      ancient.scale.multiplyScalar(0.78);
      return ancient;
    }
    if (variant <= 3) {
      const pine = this.makePineTree(seed ^ 0x9e3779b9, palette);
      pine.name = 'tree:pine';
      return pine;
    }
    const group = this.kit.group('tree:broadleaf');
    group.userData.windAmplitude = 0.018;
    const trunkColor = colorOffset(0x5a3824, (hash01(seed, 3) - 0.5) * 0.08);
    this.addBlobShadow(group, 0.72, 0.62);
    this.kit.cylinder(group, 0.18, 0.34, 1.7, 8, [0, 0.85, 0], { kind: 'wood', color: trunkColor }, { outline: true });
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI * 0.5 + hash01(seed, 80 + i) * 0.28;
      this.kit.beamBetween(
        group,
        new THREE.Vector3(Math.cos(angle) * 0.07, 0.2, Math.sin(angle) * 0.07),
        new THREE.Vector3(Math.cos(angle) * (0.46 + hash01(seed, 90 + i) * 0.14), 0.055, Math.sin(angle) * (0.46 + hash01(seed, 90 + i) * 0.14)),
        0.11,
        0.075,
        { kind: 'wood', color: colorOffset(trunkColor, -0.025) },
        true,
      );
    }
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2 + hash01(seed, i) * 0.35;
      this.kit.beamBetween(group, new THREE.Vector3(0, 1.1 + i * 0.09, 0), new THREE.Vector3(Math.cos(angle) * 0.65, 1.45 + i * 0.16, Math.sin(angle) * 0.65), 0.095, 0.095, { kind: 'wood', color: trunkColor }, true);
    }
    const foliageBase = new THREE.Color(palette.floor).offsetHSL((hash01(seed, 22) - 0.5) * 0.07, 0.1, 0.04).getHex();
    for (let layer = 0; layer < 4; layer++) {
      const y = 1.45 + layer * 0.52;
      const radius = 1.08 - layer * 0.16;
      for (let i = 0; i < 3; i++) {
        const angle = i / 3 * Math.PI * 2 + layer * 0.7;
        this.kit.sphere(group, radius * 0.62, 9, [Math.cos(angle) * radius * 0.3, y, Math.sin(angle) * radius * 0.3], { kind: 'foliage', color: colorOffset(foliageBase, (i - 1) * 0.025) }, { scale: [1.1, 0.78, 1], outline: layer === 0 || i === 0 });
      }
    }
    group.scale.setScalar((0.92 + hash01(seed, 4) * 0.28) * (landId === 'rainforest' ? 1.18 : 1));
    return group;
  }

  private makeTwistedTree(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('tree:witch-twisted');
    group.userData.windAmplitude = 0.024;
    this.addBlobShadow(group, 0.86, 0.7);
    const trunk: MaterialSpec = { kind: 'wood', color: colorOffset(0x392a35, (hash01(seed, 1) - 0.5) * 0.08) };
    this.kit.cylinder(group, 0.17, 0.36, 2.25, 7, [0, 1.1, 0], trunk, { rotation: [0.06, 0, -0.16], outline: true });
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2 + hash01(seed, 20 + i) * 0.4;
      this.kit.beamBetween(group, new THREE.Vector3(-0.18, 1.1 + i * 0.12, 0), new THREE.Vector3(Math.cos(angle) * (0.65 + hash01(seed, 40 + i) * 0.35), 1.72 + (i % 3) * 0.32, Math.sin(angle) * 0.72), 0.09, 0.055, trunk, true);
    }
    const foliage = new THREE.Color(palette.floor).offsetHSL(0.08, 0.12, -0.02).getHex();
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * Math.PI * 2;
      this.kit.sphere(group, 0.5 + hash01(seed, 80 + i) * 0.18, 8, [Math.cos(angle) * 0.65, 1.85 + (i % 3) * 0.3, Math.sin(angle) * 0.55], { kind: 'foliage', color: colorOffset(foliage, (hash01(seed, 100 + i) - 0.5) * 0.09) }, { scale: [1.1, 0.72, 0.92], outline: i < 3 });
    }
    return group;
  }

  private makeDesertTree(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group((seed & 1) === 0 ? 'tree:desert-acacia' : 'tree:desert-palm');
    group.userData.windAmplitude = 0.016;
    this.addBlobShadow(group, 0.82, 0.62);
    const trunk: MaterialSpec = { kind: 'wood', color: colorOffset(0x765039, (hash01(seed, 2) - 0.5) * 0.08) };
    if ((seed & 1) === 0) {
      this.kit.cylinder(group, 0.16, 0.3, 2.05, 8, [0, 1.02, 0], trunk, { rotation: [0.02, 0, 0.1], outline: true });
      const foliage = new THREE.Color(palette.floor).offsetHSL(-0.04, 0.14, -0.08).getHex();
      for (let i = 0; i < 5; i++) {
        const angle = i / 5 * Math.PI * 2;
        this.kit.beamBetween(group, new THREE.Vector3(0.12, 1.65, 0), new THREE.Vector3(Math.cos(angle) * 0.82, 1.92 + (i % 2) * 0.14, Math.sin(angle) * 0.7), 0.08, 0.05, trunk, true);
        this.kit.sphere(group, 0.55, 8, [Math.cos(angle) * 0.72, 2.02, Math.sin(angle) * 0.6], { kind: 'foliage', color: colorOffset(foliage, (i - 2) * 0.018) }, { scale: [1.35, 0.42, 1], outline: i < 2 });
      }
    } else {
      this.kit.cylinder(group, 0.13, 0.25, 2.6, 9, [0, 1.3, 0], trunk, { rotation: [0.04, 0, -0.07], outline: true });
      const palm = new THREE.Color(palette.floor).offsetHSL(-0.05, 0.18, -0.02).getHex();
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2;
        const leaf = this.kit.group('palm-frond');
        leaf.position.set(0, 2.55, 0);
        leaf.rotation.y = angle;
        group.add(leaf);
        this.kit.box(leaf, [0.16, 0.055, 1.55], [0, -0.12, 0.65], { kind: 'foliage', color: colorOffset(palm, (i % 3 - 1) * 0.025) }, { rotation: [-0.25, 0, 0], outline: i < 2 }, 0.04);
      }
    }
    return group;
  }

  private makeCharredTree(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('tree:cinder-charred');
    group.userData.windAmplitude = 0.008;
    this.addBlobShadow(group, 0.68, 0.55);
    const trunk: MaterialSpec = { kind: 'wood', color: colorOffset(0x292326, hash01(seed, 3) * 0.05) };
    this.kit.cylinder(group, 0.16, 0.34, 2.25, 7, [0, 1.12, 0], trunk, { rotation: [0.02, 0, 0.08], outline: true });
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * Math.PI * 2 + hash01(seed, 20 + i) * 0.3;
      this.kit.beamBetween(group, new THREE.Vector3(0.08, 1.18 + (i % 4) * 0.25, 0), new THREE.Vector3(Math.cos(angle) * (0.55 + hash01(seed, 40 + i) * 0.38), 1.65 + (i % 3) * 0.34, Math.sin(angle) * 0.7), 0.075, 0.035, trunk, true);
    }
    const emberFoliage = new THREE.Color(palette.floor).offsetHSL(-0.04, -0.08, -0.12).getHex();
    for (let i = 0; i < 3; i++) this.kit.sphere(group, 0.34, 7, [(i - 1) * 0.48, 2.0 + i * 0.18, (i % 2) * 0.3], { kind: 'foliage', color: colorOffset(emberFoliage, i * 0.025) }, { scale: [1.1, 0.62, 0.9], outline: i === 0 });
    return group;
  }

  makeRockCluster(seed: number, color: number): THREE.Group {
    const group = this.kit.group('rock-cluster');
    this.addBlobShadow(group, 0.68, 0.58);
    const count = 3 + Math.floor(hash01(seed, 1) * 3);
    for (let i = 0; i < count; i++) {
      const radius = 0.22 + hash01(seed, i + 5) * 0.28;
      this.kit.sphere(group, radius, 7, [(hash01(seed, i + 20) - 0.5) * 0.9, radius * 0.65, (hash01(seed, i + 40) - 0.5) * 0.78], { kind: 'stone', color: colorOffset(color, (hash01(seed, i + 60) - 0.5) * 0.08) }, { scale: [1.15, 0.8, 1], outline: true });
    }
    return group;
  }


  makeAncientTree(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('ancient-tree');
    this.addBlobShadow(group, 1.45, 1.18);
    const trunkColor = colorOffset(0x4f321f, (hash01(seed, 3) - 0.5) * 0.08);
    const trunk: MaterialSpec = { kind: 'wood', color: trunkColor };
    this.kit.cylinder(group, 0.34, 0.62, 3.1, 9, [0, 1.55, 0], trunk, { rotation: [0.03, 0, -0.025], outline: true });
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2 + hash01(seed, 70 + i) * 0.25;
      const reach = 0.78 + hash01(seed, 90 + i) * 0.42;
      this.kit.beamBetween(
        group,
        new THREE.Vector3(Math.cos(angle) * 0.08, 0.26, Math.sin(angle) * 0.08),
        new THREE.Vector3(Math.cos(angle) * reach, 0.05, Math.sin(angle) * reach),
        0.18,
        0.08,
        { kind: 'wood', color: colorOffset(trunkColor, -0.025) },
        true,
      );
    }
    const crown = this.kit.group('foliage-wind');
    crown.position.y = 2.05;
    crown.userData.windAmplitude = 0.032;
    group.add(crown);
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2 + hash01(seed, i) * 0.34;
      const length = 1.08 + hash01(seed, 30 + i) * 0.46;
      this.kit.beamBetween(
        crown,
        new THREE.Vector3(0, 0.05 + (i % 3) * 0.18, 0),
        new THREE.Vector3(Math.cos(angle) * length, 0.58 + (i % 2) * 0.32, Math.sin(angle) * length),
        0.15,
        0.075,
        trunk,
        true,
      );
    }
    const foliageBase = new THREE.Color(palette.floor).offsetHSL((hash01(seed, 22) - 0.5) * 0.055, 0.12, 0.025).getHex();
    for (let i = 0; i < 15; i++) {
      const angle = i / 15 * Math.PI * 2 + hash01(seed, 130 + i) * 0.28;
      const ring = 0.45 + (i % 4) * 0.34;
      const y = 0.72 + (i % 5) * 0.32 + hash01(seed, 160 + i) * 0.22;
      this.kit.sphere(
        crown,
        0.66 + hash01(seed, 200 + i) * 0.22,
        9,
        [Math.cos(angle) * ring, y, Math.sin(angle) * ring],
        { kind: 'foliage', color: colorOffset(foliageBase, (hash01(seed, 230 + i) - 0.5) * 0.1) },
        { scale: [1.18, 0.72, 1], rotation: [0, angle, 0], outline: i % 4 === 0 },
      );
    }
    group.scale.setScalar(0.94 + hash01(seed, 5) * 0.16);
    return group;
  }

  makePineTree(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('pine-tree');
    this.addBlobShadow(group, 0.92, 0.76);
    const trunk: MaterialSpec = { kind: 'wood', color: colorOffset(0x503321, (hash01(seed, 7) - 0.5) * 0.06) };
    this.kit.cylinder(group, 0.16, 0.28, 2.8, 8, [0, 1.4, 0], trunk, { outline: true });
    const crown = this.kit.group('foliage-wind');
    crown.position.y = 0.75;
    crown.userData.windAmplitude = 0.022;
    group.add(crown);
    const foliage = new THREE.Color(palette.floor).offsetHSL(-0.02, 0.12, -0.055).getHex();
    for (let layer = 0; layer < 6; layer++) {
      const y = 0.45 + layer * 0.48;
      const radius = 1.12 - layer * 0.14;
      this.kit.cone(
        crown,
        radius,
        1.05,
        9,
        [0, y, 0],
        { kind: 'foliage', color: colorOffset(foliage, (layer % 2 === 0 ? 1 : -1) * 0.025) },
        { rotation: [0, hash01(seed, 20 + layer) * Math.PI, 0], outline: layer === 0 || layer === 5 },
      );
    }
    group.scale.setScalar(0.9 + hash01(seed, 31) * 0.22);
    return group;
  }

  makeBoulder(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('mossy-boulder');
    this.addBlobShadow(group, 1.05, 0.84);
    const count = 3 + Math.floor(hash01(seed, 2) * 2);
    for (let i = 0; i < count; i++) {
      const radius = 0.52 + hash01(seed, 10 + i) * 0.48;
      const x = (hash01(seed, 30 + i) - 0.5) * 1.2;
      const z = (hash01(seed, 50 + i) - 0.5) * 0.9;
      const stoneColor = colorOffset(palette.rock, (hash01(seed, 70 + i) - 0.5) * 0.11);
      this.kit.sphere(group, radius, 7, [x, radius * 0.62, z], { kind: 'stone', color: stoneColor }, {
        scale: [1.15 + hash01(seed, 90 + i) * 0.35, 0.72 + hash01(seed, 110 + i) * 0.24, 0.9 + hash01(seed, 130 + i) * 0.3],
        rotation: [(hash01(seed, 150 + i) - 0.5) * 0.22, hash01(seed, 170 + i) * Math.PI, (hash01(seed, 190 + i) - 0.5) * 0.18],
        outline: true,
      });
    }
    const mossColor = new THREE.Color(palette.floor).offsetHSL(0.02, 0.08, -0.02).getHex();
    for (let i = 0; i < 4; i++) {
      this.kit.sphere(group, 0.28 + hash01(seed, 220 + i) * 0.18, 8, [
        (hash01(seed, 240 + i) - 0.5) * 1.1,
        0.78 + hash01(seed, 260 + i) * 0.38,
        (hash01(seed, 280 + i) - 0.5) * 0.7,
      ], { kind: 'foliage', color: colorOffset(mossColor, (hash01(seed, 300 + i) - 0.5) * 0.08) }, { scale: [1.15, 0.18, 0.9], outline: i === 0 });
    }
    return group;
  }

  makeCliffOutcrop(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('cliff-outcrop');
    this.addBlobShadow(group, 1.55, 0.92);
    const ledges = 4;
    for (let i = 0; i < ledges; i++) {
      const width = 2.7 - i * 0.36 + hash01(seed, 20 + i) * 0.22;
      const depth = 1.3 - i * 0.12;
      const height = 0.66 + hash01(seed, 40 + i) * 0.28;
      this.kit.box(
        group,
        [width, height, depth],
        [(hash01(seed, 60 + i) - 0.5) * 0.32, height * 0.5 + i * 0.56, (hash01(seed, 80 + i) - 0.5) * 0.25],
        { kind: 'stone', color: colorOffset(palette.rock, (hash01(seed, 100 + i) - 0.5) * 0.1) },
        { rotation: [(hash01(seed, 120 + i) - 0.5) * 0.08, (hash01(seed, 140 + i) - 0.5) * 0.25, (hash01(seed, 160 + i) - 0.5) * 0.07], outline: true },
        0.12,
      );
    }
    const grassColor = new THREE.Color(palette.floor).offsetHSL(0, 0.05, 0.01).getHex();
    for (let i = 0; i < 5; i++) {
      this.kit.sphere(group, 0.22 + hash01(seed, 180 + i) * 0.16, 7, [
        (hash01(seed, 200 + i) - 0.5) * 1.8,
        0.68 + (i % 3) * 0.55,
        -0.28 + hash01(seed, 220 + i) * 0.35,
      ], { kind: 'foliage', color: colorOffset(grassColor, (hash01(seed, 240 + i) - 0.5) * 0.08) }, { scale: [1.1, 0.22, 0.78], outline: i === 0 });
    }
    return group;
  }

  makeFlowerPatch(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('flower-patch');
    this.addBlobShadow(group, 0.82, 0.56);
    const greens = [colorOffset(palette.floor, -0.04), colorOffset(palette.floorAlt, 0.02)];
    const flowers = [palette.accent, 0xe7b85c, 0xce7f9d, 0xa8cfe6];
    for (let i = 0; i < 16; i++) {
      const angle = hash01(seed, i * 17) * Math.PI * 2;
      const radius = Math.sqrt(hash01(seed, i * 19 + 1)) * 0.85;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.72;
      const height = 0.18 + hash01(seed, i * 23 + 2) * 0.36;
      this.kit.beamBetween(group, new THREE.Vector3(x, 0.03, z), new THREE.Vector3(x, height, z), 0.018, 0.012, { kind: 'foliage', color: greens[i % greens.length] }, false);
      if (i % 2 === 0) this.kit.sphere(group, 0.055 + hash01(seed, i + 90) * 0.025, 6, [x, height, z], { kind: 'foliage', color: flowers[(seed + i) % flowers.length] }, { scale: [1, 0.55, 1], outline: true });
    }
    return group;
  }

  makeReedCluster(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('reed-cluster');
    this.addBlobShadow(group, 0.66, 0.42);
    const stemColor = colorOffset(palette.floor, -0.075);
    const crown = this.kit.group('foliage-wind');
    crown.userData.windAmplitude = 0.045;
    group.add(crown);
    for (let i = 0; i < 12; i++) {
      const x = (hash01(seed, i * 13) - 0.5) * 0.9;
      const z = (hash01(seed, i * 17 + 2) - 0.5) * 0.55;
      const height = 0.75 + hash01(seed, i * 19 + 4) * 0.75;
      this.kit.beamBetween(crown, new THREE.Vector3(x, 0.02, z), new THREE.Vector3(x + (hash01(seed, i * 23 + 6) - 0.5) * 0.12, height, z), 0.018, 0.012, { kind: 'foliage', color: colorOffset(stemColor, (hash01(seed, i + 40) - 0.5) * 0.06) }, false);
      if (i % 3 === 0) this.kit.cylinder(crown, 0.035, 0.045, 0.22, 7, [x, height + 0.08, z], { kind: 'foliage', color: 0x6e4a2f }, { outline: true });
    }
    return group;
  }

  makeCrystalCluster(color: number, emissive: boolean): THREE.Group {
    const group = this.kit.group('crystal-cluster');
    this.addBlobShadow(group, 0.52, 0.44);
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * Math.PI * 2;
      const height = 0.52 + (i % 3) * 0.22;
      this.kit.cone(group, 0.13 + (i % 2) * 0.035, height, 6, [Math.cos(angle) * 0.28, height * 0.5, Math.sin(angle) * 0.24], { kind: 'crystal', color, emissive: emissive ? color : 0, emissiveIntensity: emissive ? 0.9 : 0 }, { rotation: [(i - 3) * 0.04, angle, (i % 2 ? 1 : -1) * 0.08], outline: true });
    }
    this.kit.sphere(group, 0.42, 7, [0, 0.16, 0], { kind: 'stone', color: 0x41464c }, { scale: [1.25, 0.5, 1], outline: true });
    return group;
  }

  makeChest(): THREE.Group {
    const group = this.kit.group('chest');
    this.addBlobShadow(group, 0.54, 0.43);
    this.kit.box(group, [0.86, 0.42, 0.62], [0, 0.25, 0], { kind: 'wood', color: 0x684025 }, { outline: true }, 0.06);
    this.kit.cylinder(group, 0.31, 0.31, 0.84, 12, [0, 0.48, 0], { kind: 'wood', color: 0x75492a }, { rotation: [0, 0, Math.PI * 0.5], outline: true });
    for (const x of [-0.3, 0, 0.3]) this.kit.torus(group, 0.315, 0.025, 5, 12, [x, 0.48, 0], GOLD, { rotation: [0, Math.PI * 0.5, 0] });
    this.kit.box(group, [0.17, 0.2, 0.08], [0, 0.34, 0.35], GOLD, { outline: true }, 0.025);
    return group;
  }

  makePortal(color: number, style: 'arcane' | 'mine' = 'arcane'): THREE.Group {
    if (style === 'mine') return this.makeMineEntrance(color);
    const group = this.kit.group('portal');
    this.addBlobShadow(group, 1.24, 0.54);
    for (let i = 0; i < 13; i++) {
      const angle = Math.PI * (i / 12);
      const x = Math.cos(angle) * 0.95;
      const y = Math.sin(angle) * 1.15;
      this.kit.box(group, [0.32, 0.32, 0.44], [x, 0.32 + y, 0], { kind: 'stone', color: colorOffset(0x5d6067, (i % 3 - 1) * 0.035) }, { rotation: [0, 0, angle - Math.PI * 0.5], outline: true }, 0.045);
    }
    this.kit.box(group, [2.5, 0.28, 0.85], [0, 0.14, 0], { kind: 'stone', color: 0x4e5056 }, { outline: true }, 0.055);
    this.kit.torus(group, 0.83, 0.075, 10, 32, [0, 1.18, 0.04], { kind: 'crystal', color, emissive: color, emissiveIntensity: 2.1 }, { outline: true });
    this.kit.sphere(group, 0.73, 24, [0, 1.18, 0.06], { kind: 'crystal', color, emissive: color, emissiveIntensity: 1.2, transparent: true, opacity: 0.38, side: THREE.DoubleSide }, { scale: [1, 1.15, 0.06] });
    const light = new THREE.PointLight(color, 1.4, 7, 1.8);
    light.position.set(0, 1.3, 0.5);
    light.userData.flickerPhase = color % 11;
    group.add(light);
    return group;
  }

  private makeMineEntrance(color: number): THREE.Group {
    const group = this.kit.group('mine-entrance');
    this.addBlobShadow(group, 1.38, 0.92);
    for (let i = 0; i < 7; i++) {
      const angle = Math.PI * (i / 6);
      this.kit.sphere(group, 0.34 + (i % 2) * 0.08, 7, [Math.cos(angle) * 1.05, 0.45 + Math.sin(angle) * 1.05, -0.08], { kind: 'stone', color: colorOffset(0x4a4d50, (i % 3 - 1) * 0.04) }, { scale: [1.2, 0.9, 0.8], outline: true });
    }
    this.kit.box(group, [2.5, 0.35, 1.35], [0, 0.18, 0], { kind: 'stone', color: 0x444649 }, { outline: true }, 0.055);
    this.kit.box(group, [1.72, 1.6, 0.18], [0, 0.9, 0.32], { kind: 'plain', color: 0x151517 }, { outline: true }, 0.08);
    for (const x of [-0.92, 0.92]) this.kit.box(group, [0.24, 2.15, 0.28], [x, 1.05, 0.42], { kind: 'wood', color: 0x594029 }, { outline: true }, 0.04);
    this.kit.box(group, [2.2, 0.25, 0.3], [0, 2.02, 0.42], { kind: 'wood', color: 0x594029 }, { outline: true }, 0.04);
    for (const x of [-0.42, 0.42]) this.kit.box(group, [0.09, 0.08, 2.8], [x, 0.14, 1.5], IRON, { outline: true }, 0.018);
    for (let z = 0.55; z < 2.85; z += 0.38) this.kit.box(group, [1.0, 0.08, 0.12], [0, 0.15, z], { kind: 'wood', color: 0x5f422b }, { outline: true }, 0.018);
    this.kit.sphere(group, 0.58, 20, [0, 1.02, 0.18], { kind: 'crystal', color, emissive: color, emissiveIntensity: 1.2, transparent: true, opacity: 0.22 }, { scale: [1.05, 1.25, 0.08] });
    const light = new THREE.PointLight(color, 1.25, 7, 1.8);
    light.position.set(0, 1.05, 0.72);
    light.userData.flickerPhase = 8.4;
    group.add(light);
    return group;
  }

  makeDungeonEntrance(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('dungeon-entrance');
    this.addBlobShadow(group, 2.1, 1.2);
    const stone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, -0.04) };
    const trim: MaterialSpec = { kind: 'stone', color: colorOffset(palette.brick, 0.02) };
    const runeColor = colorOffset(palette.accent, 0.08);
    this.kit.box(group, [3.4, 0.38, 1.65], [0, 0.19, 0.18], stone, { outline: true }, 0.08);
    for (const side of [-1, 1]) {
      this.kit.box(group, [0.72, 2.85, 0.92], [side * 1.35, 1.55, 0], stone, { outline: true }, 0.09);
      this.kit.box(group, [0.98, 0.3, 1.08], [side * 1.35, 3.03, 0], trim, { outline: true }, 0.05);
      const cap = this.kit.cone(group, 0.52, 0.9, 7, [side * 1.35, 3.62, 0], trim, { rotation: [0, side * 0.08, 0], outline: true });
      cap.rotation.y += (hash01(seed, side + 9) - 0.5) * 0.12;
    }
    for (let i = 0; i < 9; i++) {
      const angle = Math.PI * (i / 8);
      const x = Math.cos(angle) * 1.25;
      const y = 1.42 + Math.sin(angle) * 1.38;
      this.kit.box(group, [0.44, 0.42, 0.86], [x, y, 0], trim, { rotation: [0, 0, angle - Math.PI * 0.5], outline: true }, 0.055);
    }
    this.kit.box(group, [2.1, 2.0, 0.18], [0, 1.15, 0.46], { kind: 'plain', color: 0x101218, roughness: 0.82 }, { outline: true }, 0.04);
    this.kit.torus(group, 0.7, 0.055, 8, 24, [0, 1.45, 0.57], { kind: 'crystal', color: runeColor, emissive: runeColor, emissiveIntensity: 1.5 }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
    for (let i = 0; i < 3; i++) {
      const angle = seed * 0.0001 + i * Math.PI * 2 / 3;
      this.kit.cone(group, 0.12, 0.52, 6, [Math.cos(angle) * 0.63, 1.45, 0.64 + Math.sin(angle) * 0.06], { kind: 'crystal', color: runeColor, emissive: runeColor, emissiveIntensity: 1.8 }, { rotation: [0, 0, angle], outline: true });
    }
    const light = new THREE.PointLight(runeColor, 1.15, 7, 1.9);
    light.position.set(0, 1.5, 0.8);
    light.userData.flickerPhase = seed % 17;
    group.add(light);
    return group;
  }

  makeDungeonPillar(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('dungeon-pillar');
    this.addBlobShadow(group, 0.62, 0.62);
    const stone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, (hash01(seed, 2) - 0.5) * 0.08) };
    const trim: MaterialSpec = { kind: 'stone', color: colorOffset(palette.brick, -0.03) };
    this.kit.box(group, [0.92, 0.24, 0.92], [0, 0.12, 0], trim, { outline: true }, 0.05);
    this.kit.cylinder(group, 0.34, 0.42, 2.35, 8, [0, 1.38, 0], stone, { outline: true });
    this.kit.box(group, [0.82, 0.26, 0.82], [0, 2.62, 0], trim, { rotation: [0, hash01(seed, 8) * 0.18, 0], outline: true }, 0.04);
    this.kit.cone(group, 0.26, 0.74, 6, [0, 3.08, 0], { kind: 'crystal', color: palette.accent, emissive: palette.accent, emissiveIntensity: 0.85 }, { outline: true });
    return group;
  }

  makeDungeonBrazier(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('dungeon-brazier');
    this.addBlobShadow(group, 0.55, 0.55);
    const metal: MaterialSpec = { kind: 'metal', color: 0x43474c, metalness: 0.7, roughness: 0.42 };
    this.kit.cylinder(group, 0.12, 0.2, 0.92, 8, [0, 0.46, 0], metal, { outline: true });
    this.kit.cylinder(group, 0.48, 0.28, 0.26, 10, [0, 1.0, 0], metal, { outline: true });
    const flame = colorOffset(palette.accent, 0.12);
    this.kit.cone(group, 0.25, 0.72, 8, [0, 1.48, 0], { kind: 'plain', color: flame, emissive: flame, emissiveIntensity: 2.2 }, { rotation: [0, hash01(seed, 3) * Math.PI, 0], outline: true });
    const light = new THREE.PointLight(flame, 1.0, 5.5, 1.9);
    light.position.set(0, 1.45, 0);
    light.userData.flickerPhase = seed % 23;
    group.add(light);
    return group;
  }

  makeDungeonRubble(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('dungeon-rubble');
    this.addBlobShadow(group, 0.82, 0.54);
    for (let i = 0; i < 7; i++) {
      const angle = hash01(seed, i * 11) * Math.PI * 2;
      const distance = 0.16 + hash01(seed, i * 17 + 2) * 0.65;
      const scale = 0.16 + hash01(seed, i * 19 + 4) * 0.22;
      this.kit.box(group, [scale * 1.4, scale, scale], [Math.cos(angle) * distance, scale * 0.45, Math.sin(angle) * distance], { kind: 'stone', color: colorOffset(i % 2 ? palette.rock : palette.brick, -0.03) }, { rotation: [hash01(seed, i + 31) * 0.4, angle, hash01(seed, i + 41) * 0.3], outline: true }, 0.025);
    }
    return group;
  }

  makeCamp(): THREE.Group {
    const group = this.kit.group('camp');
    this.addBlobShadow(group, 1.58, 1.25);
    const tent = this.kit.group('tent');
    tent.rotation.y = Math.PI * 0.25;
    group.add(tent);
    this.kit.box(tent, [1.8, 0.08, 1.75], [-0.42, 0.78, 0], { kind: 'cloth', color: 0x6c4933 }, { rotation: [0, 0, -0.73], outline: true }, 0.025);
    this.kit.box(tent, [1.8, 0.08, 1.75], [0.42, 0.78, 0], { kind: 'cloth', color: 0x76503a }, { rotation: [0, 0, 0.73], outline: true }, 0.025);
    this.kit.cylinder(tent, 0.045, 0.055, 2.3, 7, [0, 0.85, 0], WOOD, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
    const fire = this.kit.group('campfire');
    fire.position.set(1.8, 0, 0);
    group.add(fire);
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      this.kit.sphere(fire, 0.13, 7, [Math.cos(angle) * 0.36, 0.12, Math.sin(angle) * 0.36], { kind: 'stone', color: 0x555351 }, { outline: true });
    }
    for (const rot of [-0.45, 0.45]) this.kit.cylinder(fire, 0.07, 0.08, 0.8, 7, [0, 0.2, 0], WOOD, { rotation: [Math.PI * 0.5, rot, 0], outline: true });
    this.kit.cone(fire, 0.22, 0.72, 8, [0, 0.47, 0], { kind: 'plain', color: 0xffaa42, emissive: 0xff4f1f, emissiveIntensity: 2.4 }, { outline: true });
    const light = new THREE.PointLight(0xff8738, 1.6, 8, 1.8);
    light.position.set(0, 1.0, 0);
    light.userData.flickerPhase = 4.2;
    fire.add(light);
    return group;
  }

  makeFenceSegment(length: number, rotationY = 0): THREE.Group {
    const group = this.kit.group('fence');
    group.rotation.y = rotationY;
    this.addBlobShadow(group, length * 0.55, 0.25);
    for (const x of [-length * 0.5, length * 0.5]) this.kit.box(group, [0.16, 1.05, 0.16], [x, 0.54, 0], WOOD, { outline: true }, 0.03);
    for (const y of [0.42, 0.78]) this.kit.box(group, [length + 0.18, 0.13, 0.12], [0, y, 0], { kind: 'wood', color: 0x604027 }, { rotation: [0, 0, (y > 0.5 ? 1 : -1) * 0.025], outline: true }, 0.025);
    this.kit.beamBetween(group, new THREE.Vector3(-length * 0.42, 0.22, 0.035), new THREE.Vector3(length * 0.42, 0.94, 0.035), 0.075, 0.09, { kind: 'wood', color: 0x543720 }, true);
    return group;
  }

  makeWallSection(length: number, palette: ArtPalette): THREE.Group {
    const safeLength = Math.max(1.5, length);
    const group = this.kit.group('fortress-wall-section');
    this.addBlobShadow(group, safeLength * 0.58, 0.72);
    const stone: MaterialSpec = { kind: 'stone', color: palette.brick };
    const darkStone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, -0.035) };
    this.kit.box(group, [safeLength, 3.05, 0.92], [0, 1.525, 0], stone, { outline: true }, 0.08);
    this.kit.box(group, [safeLength + 0.22, 0.28, 1.18], [0, 3.08, 0], darkStone, { outline: true }, 0.055);
    this.kit.box(group, [safeLength - 0.18, 0.16, 0.72], [0, 3.27, 0], { kind: 'stone', color: colorOffset(palette.brick, 0.055) }, { outline: true }, 0.035);

    const merlonCount = Math.max(2, Math.round(safeLength / 1.05));
    const merlonSpacing = safeLength / merlonCount;
    for (let i = 0; i <= merlonCount; i++) {
      const x = -safeLength * 0.5 + i * merlonSpacing;
      this.kit.box(group, [Math.min(0.58, merlonSpacing * 0.66), 0.78, 0.9], [x, 3.72, 0], stone, { outline: true }, 0.055);
    }

    const buttressCount = Math.max(1, Math.floor(safeLength / 4));
    for (let i = 0; i <= buttressCount; i++) {
      const x = -safeLength * 0.5 + i / buttressCount * safeLength;
      for (const z of [-0.58, 0.58]) {
        this.kit.box(group, [0.48, 2.15, 0.56], [x, 1.075, z], darkStone, { rotation: [0, 0, z > 0 ? -0.035 : 0.035], outline: true }, 0.06);
        this.kit.box(group, [0.68, 0.34, 0.76], [x, 0.17, z], stone, { outline: true }, 0.055);
      }
    }
    return group;
  }

  makeWallTower(palette: ArtPalette): THREE.Group {
    const group = this.kit.group('fortress-wall-tower');
    this.addBlobShadow(group, 2.35, 2.05);
    const stone: MaterialSpec = { kind: 'stone', color: palette.brick };
    const darkStone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, -0.04) };
    this.kit.cylinder(group, 1.72, 1.95, 4.85, 12, [0, 2.425, 0], stone, { outline: true });
    this.kit.cylinder(group, 1.98, 2.04, 0.38, 12, [0, 0.19, 0], darkStone, { outline: true });
    this.kit.cylinder(group, 1.92, 1.82, 0.34, 12, [0, 4.93, 0], darkStone, { outline: true });
    for (let i = 0; i < 10; i++) {
      if (i % 2 !== 0) continue;
      const angle = i / 10 * Math.PI * 2;
      this.kit.box(
        group,
        [0.76, 0.92, 0.68],
        [Math.cos(angle) * 1.62, 5.45, Math.sin(angle) * 1.62],
        stone,
        { rotation: [0, -angle, 0], outline: true },
        0.06,
      );
    }
    for (let level = 0; level < 2; level++) {
      for (let side = 0; side < 4; side++) {
        const angle = side * Math.PI * 0.5;
        this.kit.box(
          group,
          [0.28, 0.68, 0.1],
          [Math.sin(angle) * 1.73, 1.8 + level * 1.7, Math.cos(angle) * 1.73],
          { kind: 'plain', color: 0x171719, roughness: 0.9 },
          { rotation: [0, angle, 0], outline: true },
          0.025,
        );
      }
    }
    return group;
  }

  makeGatehouse(palette: ArtPalette, width: number): THREE.Group {
    const opening = Math.max(3.6, width);
    const group = this.kit.group('fortress-gatehouse');
    this.addBlobShadow(group, opening * 0.78 + 2.2, 2.15);
    const towerOffset = opening * 0.5 + 1.52;
    for (const side of [-1, 1]) {
      const tower = this.makeWallTower(palette);
      tower.scale.setScalar(0.84);
      tower.position.set(side * towerOffset, 0, 0);
      group.add(tower);
    }
    const stone: MaterialSpec = { kind: 'stone', color: palette.brick };
    const darkStone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, -0.04) };
    this.kit.box(group, [opening + 1.1, 1.35, 1.05], [0, 4.18, 0], stone, { outline: true }, 0.08);
    this.kit.box(group, [opening + 1.35, 0.24, 1.3], [0, 4.88, 0], darkStone, { outline: true }, 0.05);
    const merlons = Math.max(4, Math.round(opening / 1.05));
    for (let i = 0; i <= merlons; i += 2) {
      const x = -opening * 0.5 + i / merlons * opening;
      this.kit.box(group, [0.62, 0.76, 0.98], [x, 5.38, 0], stone, { outline: true }, 0.055);
    }
    for (const side of [-1, 1]) {
      this.kit.box(group, [0.7, 3.45, 1.02], [side * (opening * 0.5 + 0.35), 1.74, 0], darkStone, { outline: true }, 0.065);
    }
    const portcullis: MaterialSpec = { kind: 'metal', color: 0x34383d, metalness: 0.68, roughness: 0.42 };
    for (let x = -opening * 0.42; x <= opening * 0.42; x += 0.48) {
      this.kit.box(group, [0.07, 2.35, 0.08], [x, 3.55, 0.46], portcullis, { outline: true }, 0.015);
    }
    this.kit.box(group, [opening * 0.88, 0.08, 0.08], [0, 4.7, 0.46], portcullis, { outline: true }, 0.015);
    return group;
  }

  makeKeep(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('land-keep');
    this.addBlobShadow(group, 7.6, 6.9);
    const wallSpan = 10.5;
    for (const z of [-5.1, 5.1]) {
      if (z > 0) {
        const gate = this.makeGatehouse(palette, 3.9);
        gate.scale.setScalar(0.72);
        gate.position.set(0, 0, z);
        gate.rotation.y = Math.PI;
        group.add(gate);
        for (const x of [-4.4, 4.4]) {
          const wall = this.makeWallSection(4.0, palette);
          wall.scale.y = 0.82;
          wall.position.set(x, 0, z);
          group.add(wall);
        }
      } else {
        const wall = this.makeWallSection(wallSpan, palette);
        wall.scale.y = 0.82;
        wall.position.set(0, 0, z);
        group.add(wall);
      }
    }
    for (const x of [-5.1, 5.1]) {
      const wall = this.makeWallSection(wallSpan, palette);
      wall.scale.y = 0.82;
      wall.position.set(x, 0, 0);
      wall.rotation.y = Math.PI * 0.5;
      group.add(wall);
    }
    for (const x of [-5.1, 5.1]) for (const z of [-5.1, 5.1]) {
      const tower = this.makeWallTower(palette);
      tower.scale.setScalar(0.78);
      tower.position.set(x, 0, z);
      group.add(tower);
    }

    const centralStone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.brick, -0.015) };
    const trim: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, -0.055) };
    this.kit.box(group, [5.4, 7.4, 5.0], [0, 3.7, -0.25], centralStone, { outline: true }, 0.12);
    this.kit.box(group, [5.8, 0.42, 5.4], [0, 7.44, -0.25], trim, { outline: true }, 0.07);
    for (let side = 0; side < 4; side++) {
      const angle = side * Math.PI * 0.5;
      for (const offset of [-1.75, -0.58, 0.58, 1.75]) {
        const x = Math.sin(angle) * 2.64 + Math.cos(angle) * offset;
        const z = -0.25 + Math.cos(angle) * 2.44 - Math.sin(angle) * offset;
        this.kit.box(group, [0.72, 0.92, 0.72], [x, 8.02, z], centralStone, { rotation: [0, angle, 0], outline: true }, 0.055);
      }
    }
    this.kit.box(group, [1.18, 2.5, 0.16], [0, 1.4, 2.3], { kind: 'plain', color: 0x161517, roughness: 0.96 }, { outline: true }, 0.05);
    for (const y of [3.1, 5.1]) for (const x of [-1.55, 1.55]) {
      this.kit.box(group, [0.3, 0.82, 0.12], [x, y, 2.3], { kind: 'plain', color: 0x19191c }, { outline: true }, 0.025);
    }

    const chest = this.makeChest();
    chest.position.set(1.65, 0, 0.9);
    chest.rotation.y = -0.5;
    group.add(chest);
    const monument = this.makeMonument(palette, seed ^ 0x5a17);
    monument.scale.setScalar(0.62);
    monument.position.set(-2.1, 0, 1.15);
    group.add(monument);
    const bannerColor = seed % 2 === 0 ? palette.accent : colorOffset(palette.accent, -0.16);
    for (const x of [-1.9, 1.9]) {
      this.kit.box(group, [0.12, 2.55, 0.12], [x, 6.0, 2.48], DARK_WOOD, { outline: true }, 0.025);
      this.kit.box(group, [0.92, 1.35, 0.08], [x + 0.4, 6.35, 2.5], { kind: 'cloth', color: bannerColor }, { outline: true }, 0.025);
    }
    return group;
  }

  makeBridge(span: number, palette: ArtPalette): THREE.Group {
    const safeSpan = Math.max(2.5, span);
    const group = this.kit.group('path-bridge');
    this.addBlobShadow(group, safeSpan * 0.58, 1.25);
    const stoneBridge = palette.brick === 0x7f8992 || palette.brick === 0xa66f47;
    if (stoneBridge) {
      const stone: MaterialSpec = { kind: 'stone', color: palette.brick };
      this.kit.box(group, [safeSpan, 0.42, 2.45], [0, 0.72, 0], stone, { outline: true }, 0.08);
      for (const x of [-safeSpan * 0.38, 0, safeSpan * 0.38]) {
        this.kit.box(group, [0.58, 1.15, 2.22], [x, 0.3, 0], { kind: 'stone', color: colorOffset(palette.rock, -0.03) }, { outline: true }, 0.06);
      }
      for (const z of [-1.16, 1.16]) {
        this.kit.box(group, [safeSpan + 0.18, 0.42, 0.28], [0, 1.15, z], { kind: 'stone', color: colorOffset(palette.brick, 0.025) }, { outline: true }, 0.045);
      }
    } else {
      const plankCount = Math.max(5, Math.round(safeSpan / 0.46));
      const spacing = safeSpan / plankCount;
      for (let i = 0; i < plankCount; i++) {
        const x = -safeSpan * 0.5 + spacing * (i + 0.5);
        this.kit.box(
          group,
          [spacing * 0.94, 0.18, 2.35],
          [x, 0.58 + (i % 3 - 1) * 0.025, 0],
          { kind: 'wood', color: colorOffset(palette.path, (hash01(i, plankCount) - 0.5) * 0.09) },
          { rotation: [0, (i % 2 ? 1 : -1) * 0.012, 0], outline: true },
          0.025,
        );
      }
      for (const z of [-0.78, 0.78]) {
        this.kit.box(group, [safeSpan + 0.4, 0.18, 0.18], [0, 0.34, z], DARK_WOOD, { outline: true }, 0.03);
        for (let x = -safeSpan * 0.5; x <= safeSpan * 0.5 + 0.01; x += 1.7) {
          this.kit.box(group, [0.14, 1.28, 0.14], [x, 0.72, z], DARK_WOOD, { outline: true }, 0.028);
        }
        this.kit.box(group, [safeSpan + 0.2, 0.12, 0.12], [0, 1.23, z], { kind: 'wood', color: colorOffset(palette.path, -0.12) }, { outline: true }, 0.025);
      }
    }
    return group;
  }

  makeDock(length: number, palette: ArtPalette): THREE.Group {
    const safeLength = Math.max(4, length);
    const group = this.kit.group('coastal-dock');
    this.addBlobShadow(group, safeLength * 0.55, 1.45);
    const plankCount = Math.max(8, Math.round(safeLength / 0.45));
    const spacing = safeLength / plankCount;
    for (let i = 0; i < plankCount; i++) {
      const x = spacing * (i + 0.5);
      this.kit.box(group, [spacing * 0.92, 0.18, 2.45], [x, 0.72 + (i % 3 - 1) * 0.025, 0], { kind: 'wood', color: colorOffset(palette.path, -0.08 + (i % 4) * 0.018) }, { outline: true }, 0.025);
    }
    for (let x = 0.4; x <= safeLength + 0.1; x += 1.7) {
      for (const z of [-1.08, 1.08]) {
        this.kit.box(group, [0.18, 2.35, 0.18], [x, -0.15, z], DARK_WOOD, { outline: true }, 0.035);
        this.kit.box(group, [0.32, 0.2, 0.32], [x, 1.06, z], { kind: 'wood', color: colorOffset(palette.path, -0.13) }, { outline: true }, 0.035);
      }
    }
    this.kit.box(group, [2.5, 0.2, 0.18], [safeLength, 1.18, -1.08], DARK_WOOD, { outline: true }, 0.03);
    this.kit.torus(group, 0.34, 0.045, 6, 16, [safeLength - 0.7, 1.25, 1.15], { kind: 'plain', color: 0xb8966b, roughness: 0.92 }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
    return group;
  }

  makeRoadMarker(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('road-marker');
    const cairn = this.makeCairn(seed, palette.rock);
    cairn.scale.setScalar(0.92);
    cairn.position.set(-0.38, 0, 0);
    group.add(cairn);
    this.kit.box(group, [0.14, 1.7, 0.14], [0.38, 0.85, 0], DARK_WOOD, { outline: true }, 0.028);
    this.kit.box(group, [1.08, 0.32, 0.14], [0.76, 1.35, 0], { kind: 'wood', color: colorOffset(palette.path, -0.13) }, { rotation: [0, 0, 0.06], outline: true }, 0.04);
    this.kit.cone(group, 0.15, 0.3, 6, [1.34, 1.35, 0], { kind: 'wood', color: colorOffset(palette.path, -0.13) }, { rotation: [0, 0, -Math.PI * 0.5], outline: true });
    return group;
  }

  makeMonument(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('field-monument');
    this.addBlobShadow(group, 1.85, 1.55);
    const stone: MaterialSpec = { kind: 'stone', color: palette.brick };
    const trim: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, -0.04) };
    this.kit.box(group, [3.15, 0.42, 2.85], [0, 0.21, 0], trim, { rotation: [0, (hash01(seed, 1) - 0.5) * 0.08, 0], outline: true }, 0.08);
    this.kit.box(group, [2.35, 0.38, 2.05], [0, 0.6, 0], stone, { outline: true }, 0.065);
    this.kit.box(group, [1.18, 4.85, 1.08], [0, 3.05, 0], { kind: 'stone', color: colorOffset(palette.brick, 0.015) }, { rotation: [0, (hash01(seed, 2) - 0.5) * 0.13, (hash01(seed, 3) - 0.5) * 0.025], outline: true }, 0.08);
    this.kit.cone(group, 0.86, 1.35, 4, [0, 6.12, 0], stone, { rotation: [0, Math.PI * 0.25, 0], outline: true });
    this.kit.sphere(group, 0.3, 10, [0, 5.02, 0.56], { kind: 'crystal', color: palette.accent, emissive: palette.accent, emissiveIntensity: 1.0 }, { scale: [0.82, 1.2, 0.28], outline: true });
    for (let side = 0; side < 4; side++) {
      const angle = side * Math.PI * 0.5;
      this.kit.box(group, [0.34, 1.0, 0.22], [Math.sin(angle) * 0.62, 2.1, Math.cos(angle) * 0.62], trim, { rotation: [0, angle, 0], outline: true }, 0.035);
    }
    return group;
  }

  makeCityFountain(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('city-fountain');
    this.addBlobShadow(group, 2.5, 2.5);
    const basin: MaterialSpec = { kind: 'stone', color: colorOffset(palette.brick, 0.04) };
    const trim: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, -0.04) };
    this.kit.cylinder(group, 2.25, 2.5, 0.42, 16, [0, 0.22, 0], trim, { outline: true });
    this.kit.cylinder(group, 1.78, 1.96, 0.3, 16, [0, 0.52, 0], basin, { outline: true });
    this.kit.cylinder(group, 0.42, 0.58, 2.5, 12, [0, 1.62, 0], basin, { outline: true });
    this.kit.cylinder(group, 1.08, 1.28, 0.22, 16, [0, 2.45, 0], trim, { outline: true });
    this.kit.sphere(group, 0.38, 12, [0, 3.0, 0], { kind: 'metal', color: palette.accent, metalness: 0.42 }, { outline: true });
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI * 0.5 + hash01(seed, i) * 0.12;
      this.kit.cylinder(group, 0.035, 0.05, 1.25, 6, [Math.cos(angle) * 0.7, 2.2, Math.sin(angle) * 0.7], { kind: 'plain', color: 0x8fd6e8, transparent: true, opacity: 0.72 }, { rotation: [Math.PI * 0.35, -angle, 0] });
    }
    return group;
  }

  makeClockTower(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('city-clock-tower');
    this.addBlobShadow(group, 2.4, 2.2);
    const stone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.brick, 0.015) };
    const roof: MaterialSpec = { kind: 'roof', color: colorOffset(palette.rock, -0.14) };
    this.kit.box(group, [3.5, 0.48, 3.25], [0, 0.24, 0], stone, { outline: true }, 0.08);
    this.kit.box(group, [2.55, 6.2, 2.45], [0, 3.55, 0], stone, { rotation: [0, (hash01(seed, 3) - 0.5) * 0.03, 0], outline: true }, 0.08);
    this.kit.box(group, [3.05, 1.45, 2.95], [0, 6.55, 0], { kind: 'stone', color: colorOffset(palette.brick, 0.06) }, { outline: true }, 0.07);
    for (let side = 0; side < 4; side++) {
      const angle = side * Math.PI * 0.5;
      const clock = this.kit.group('clock-face');
      clock.position.set(Math.sin(angle) * 1.52, 6.72, Math.cos(angle) * 1.47);
      clock.rotation.y = angle;
      group.add(clock);
      this.kit.cylinder(clock, 0.58, 0.58, 0.1, 16, [0, 0, 0], { kind: 'plain', color: 0xe9d8ad }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
      this.kit.beamBetween(clock, new THREE.Vector3(0, 0, 0.08), new THREE.Vector3(0.34, 0.12, 0.1), 0.035, 0.03, { kind: 'metal', color: 0x342e29, metalness: 0.55 }, true);
      this.kit.beamBetween(clock, new THREE.Vector3(0, 0, 0.09), new THREE.Vector3(-0.08, 0.4, 0.11), 0.03, 0.025, { kind: 'metal', color: 0x342e29, metalness: 0.55 }, true);
    }
    this.kit.cone(group, 2.45, 2.5, 4, [0, 8.55, 0], roof, { rotation: [0, Math.PI * 0.25, 0], outline: true });
    this.kit.cylinder(group, 0.08, 0.08, 1.2, 8, [0, 10.35, 0], GOLD, { outline: true });
    return group;
  }

  makeParkGazebo(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('park-gazebo');
    this.addBlobShadow(group, 2.4, 2.4);
    const wood: MaterialSpec = { kind: 'wood', color: colorOffset(palette.path, -0.14) };
    const stone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.brick, 0.03) };
    this.kit.cylinder(group, 2.2, 2.35, 0.3, 12, [0, 0.15, 0], stone, { outline: true });
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      this.kit.cylinder(group, 0.11, 0.14, 2.65, 8, [Math.cos(angle) * 1.75, 1.48, Math.sin(angle) * 1.75], wood, { outline: true });
    }
    this.kit.cone(group, 2.65, 1.65, 8, [0, 3.35, 0], { kind: 'roof', color: colorOffset(palette.accent, -0.2) }, { rotation: [0, Math.PI * 0.125 + hash01(seed, 5) * 0.04, 0], outline: true });
    this.kit.cylinder(group, 0.12, 0.12, 0.75, 8, [0, 4.45, 0], GOLD, { outline: true });
    return group;
  }

  makeLighthouse(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('harbor-lighthouse');
    this.addBlobShadow(group, 2.4, 2.4);
    const stone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.brick, 0.05) };
    this.kit.cylinder(group, 1.7, 2.35, 7.2, 16, [0, 3.6, 0], stone, { outline: true });
    for (let band = 0; band < 3; band++) this.kit.cylinder(group, 1.78 - band * 0.08, 1.9 - band * 0.08, 0.3, 16, [0, 1.65 + band * 2.0, 0], { kind: 'stone', color: colorOffset(palette.rock, -0.06) }, { outline: true });
    this.kit.cylinder(group, 2.0, 2.0, 0.24, 16, [0, 7.3, 0], { kind: 'metal', color: 0x34383d, metalness: 0.58 }, { outline: true });
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      this.kit.box(group, [0.12, 1.35, 0.12], [Math.cos(angle) * 1.55, 7.95, Math.sin(angle) * 1.55], { kind: 'metal', color: 0x34383d, metalness: 0.58 }, { outline: true }, 0.025);
    }
    this.kit.cylinder(group, 1.45, 1.45, 1.2, 16, [0, 7.95, 0], { kind: 'plain', color: 0xffd27b, emissive: 0xff8a35, emissiveIntensity: 1.8, transparent: true, opacity: 0.8 }, { outline: true });
    this.kit.cone(group, 2.05, 1.3, 16, [0, 9.2, 0], { kind: 'roof', color: colorOffset(palette.rock, -0.16) }, { outline: true });
    const light = new THREE.PointLight(0xffc46b, 2.2, 18, 1.7);
    light.position.set(0, 8.05, 0);
    light.userData.flickerPhase = seed * 0.19;
    group.add(light);
    return group;
  }

  makeCafeTerrace(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('cafe-terrace');
    this.addBlobShadow(group, 1.8, 1.5);
    for (const x of [-0.85, 0.85]) {
      this.kit.cylinder(group, 0.48, 0.55, 0.12, 12, [x, 0.68, 0], { kind: 'wood', color: colorOffset(palette.path, -0.08) }, { outline: true });
      this.kit.cylinder(group, 0.09, 0.11, 0.68, 8, [x, 0.34, 0], DARK_WOOD, { outline: true });
      for (const z of [-0.62, 0.62]) this.kit.box(group, [0.72, 0.1, 0.28], [x, 0.38, z], DARK_WOOD, { outline: true }, 0.025);
    }
    this.kit.cylinder(group, 0.08, 0.09, 2.9, 8, [0, 1.48, 0], DARK_WOOD, { outline: true });
    this.kit.cone(group, 2.15, 0.72, 12, [0, 2.68, 0], { kind: 'cloth', color: hash01(seed, 2) > 0.5 ? palette.accent : 0xb64f3d }, { outline: true });
    return group;
  }

  makeRuinedTower(palette: ArtPalette, seed: number): THREE.Group {
    const group = this.kit.group('ruined-tower');
    this.addBlobShadow(group, 2.75, 2.45);
    const stone: MaterialSpec = { kind: 'stone', color: palette.brick };
    const darkStone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, -0.05) };
    this.kit.cylinder(group, 2.08, 2.32, 0.42, 12, [0, 0.21, 0], darkStone, { outline: true });
    const segments = 12;
    for (let ring = 0; ring < 6; ring++) {
      for (let i = 0; i < segments; i++) {
        const gap = (seed % segments + ring * 2) % segments;
        if (i === gap || (ring >= 4 && (i + ring) % 3 === 0)) continue;
        const angle = i / segments * Math.PI * 2;
        const radius = 1.82 + (ring % 2) * 0.05;
        const y = 0.55 + ring * 0.62 + (hash01(seed + ring, i) - 0.5) * 0.08;
        this.kit.box(
          group,
          [0.92, 0.58, 0.48],
          [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
          { ...stone, color: colorOffset(stone.color, (hash01(seed, ring * 17 + i) - 0.5) * 0.1) },
          { rotation: [(hash01(seed, i + 70) - 0.5) * 0.08, -angle, (hash01(seed, i + 90) - 0.5) * 0.08], outline: true },
          0.055,
        );
      }
    }
    for (let i = 0; i < 7; i++) {
      const angle = hash01(seed, i * 19) * Math.PI * 2;
      const radius = 2.0 + hash01(seed, i * 23 + 1) * 1.3;
      this.kit.box(group, [0.55, 0.32, 0.42], [Math.cos(angle) * radius, 0.18, Math.sin(angle) * radius], darkStone, { rotation: [hash01(seed, i + 2) * 0.4, angle, hash01(seed, i + 3) * 0.35], outline: true }, 0.055);
    }
    const beam = this.kit.box(group, [3.1, 0.24, 0.24], [0.45, 3.55, 0], DARK_WOOD, { rotation: [0.12, 0.42, 0.2], outline: true }, 0.04);
    beam.castShadow = true;
    return group;
  }

  private addLantern(parent: THREE.Object3D, seed: number, position: [number, number, number]): THREE.PointLight {
    const lantern = this.kit.group('lantern');
    lantern.position.set(...position);
    parent.add(lantern);
    this.kit.box(lantern, [0.28, 0.4, 0.28], [0, 0, 0], { kind: 'metal', color: 0x303238, metalness: 0.5 }, { outline: true }, 0.035);
    this.kit.box(lantern, [0.17, 0.27, 0.17], [0, 0, 0], { kind: 'plain', color: 0xffbc58, emissive: 0xff6a25, emissiveIntensity: 1.8, transparent: true, opacity: 0.82 }, {}, 0.025);
    const light = new THREE.PointLight(0xff9a48, 0.75, 4.5, 2);
    light.position.set(0, 0, 0.15);
    light.userData.flickerPhase = seed * 0.7;
    lantern.add(light);
    return light;
  }

  makeSignpost(labelSeed: number): THREE.Group {
    const group = this.kit.group('signpost');
    this.addBlobShadow(group, 0.42, 0.31);
    this.kit.box(group, [0.18, 2.1, 0.18], [0, 1.05, 0], DARK_WOOD, { outline: true }, 0.035);
    this.kit.box(group, [1.45, 0.38, 0.16], [0.36, 1.55, 0], { kind: 'wood', color: colorOffset(0x73502f, (hash01(labelSeed, 3) - 0.5) * 0.06) }, { rotation: [0, 0, 0.04], outline: true }, 0.055);
    this.kit.cone(group, 0.18, 0.38, 6, [1.18, 1.55, 0], { kind: 'wood', color: 0x73502f }, { rotation: [0, 0, -Math.PI * 0.5], outline: true });
    this.addLantern(group, labelSeed, [-0.34, 1.22, 0]);
    return group;
  }

  makeLanternPost(seed: number): THREE.Group {
    const group = this.kit.group('lantern-post');
    this.addBlobShadow(group, 0.36, 0.28);
    this.kit.box(group, [0.16, 1.82, 0.16], [0, 0.91, 0], DARK_WOOD, { outline: true }, 0.03);
    this.kit.beamBetween(group, new THREE.Vector3(0, 1.66, 0), new THREE.Vector3(0.34, 1.78, 0), 0.055, 0.06, DARK_WOOD, true);
    this.addLantern(group, seed, [0.38, 1.48, 0]);
    return group;
  }

  makeCairn(seed: number, color: number): THREE.Group {
    const group = this.kit.group('roadside-cairn');
    this.addBlobShadow(group, 0.48, 0.4);
    for (let i = 0; i < 4; i++) {
      const width = 0.72 - i * 0.12;
      const depth = 0.58 - i * 0.08;
      const height = 0.24 - i * 0.018;
      this.kit.box(
        group,
        [width, height, depth],
        [(hash01(seed, i * 7) - 0.5) * 0.09, 0.12 + i * 0.2, (hash01(seed, i * 11 + 2) - 0.5) * 0.08],
        { kind: 'stone', color: colorOffset(color, (hash01(seed, i + 19) - 0.5) * 0.12) },
        { rotation: [(hash01(seed, i + 31) - 0.5) * 0.12, (hash01(seed, i + 47) - 0.5) * 0.42, (hash01(seed, i + 59) - 0.5) * 0.12], outline: true },
        0.065,
      );
    }
    return group;
  }

  makeShrub(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('shrub');
    group.userData.windAmplitude = 0.028;
    this.addBlobShadow(group, 0.72, 0.58);
    const foliageColor = new THREE.Color(palette.floor).offsetHSL((hash01(seed, 2) - 0.5) * 0.04, 0.08, 0.02).getHex();
    for (let i = 0; i < 7; i++) {
      const angle = hash01(seed, i * 13) * Math.PI * 2;
      const radius = 0.12 + hash01(seed, i * 17 + 1) * 0.4;
      const height = 0.32 + hash01(seed, i * 23 + 3) * 0.38;
      this.kit.beamBetween(group, new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(Math.cos(angle) * radius, height * 0.72, Math.sin(angle) * radius), 0.035, 0.025, { kind: 'wood', color: 0x49301f }, false);
      this.kit.sphere(group, 0.3 + hash01(seed, i * 29 + 5) * 0.14, 8, [Math.cos(angle) * radius, height, Math.sin(angle) * radius], { kind: 'foliage', color: colorOffset(foliageColor, (hash01(seed, i * 31 + 7) - 0.5) * 0.12) }, { scale: [1.1, 0.72, 0.92], rotation: [0, angle, 0], outline: true });
    }
    return group;
  }

  makeTownWell(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('town-well');
    this.addBlobShadow(group, 1.05, 0.86);
    const stone: MaterialSpec = { kind: 'stone', color: colorOffset(palette.rock, -0.02) };
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const radius = 0.72;
      this.kit.box(
        group,
        [0.42, 0.32, 0.3],
        [Math.cos(angle) * radius, 0.22 + (i % 2) * 0.035, Math.sin(angle) * radius],
        { ...stone, color: colorOffset(stone.color, (hash01(seed, i) - 0.5) * 0.1) },
        { rotation: [0, -angle, (hash01(seed, i + 19) - 0.5) * 0.06], outline: true },
        0.055,
      );
    }
    this.kit.cylinder(group, 0.62, 0.62, 0.12, 18, [0, 0.12, 0], { kind: 'plain', color: 0x172331, roughness: 0.24 }, { outline: true });
    for (const x of [-0.88, 0.88]) this.kit.box(group, [0.16, 1.85, 0.16], [x, 1.05, 0], DARK_WOOD, { outline: true }, 0.035);
    this.kit.box(group, [2.0, 0.16, 0.18], [0, 1.88, 0], WOOD, { outline: true }, 0.035);
    this.kit.cylinder(group, 0.09, 0.09, 1.72, 9, [0, 1.6, 0.02], { kind: 'wood', color: 0x6a452c }, { rotation: [0, 0, Math.PI * 0.5], outline: true });
    this.kit.cylinder(group, 0.2, 0.16, 0.34, 10, [0.12, 0.57, 0], { kind: 'wood', color: 0x60402a }, { outline: true });
    this.kit.torus(group, 0.2, 0.025, 5, 10, [0.12, 0.73, 0], IRON, { rotation: [Math.PI * 0.5, 0, 0] });
    this.kit.cylinder(group, 0.018, 0.018, 0.82, 5, [0.12, 1.08, 0], { kind: 'plain', color: 0x4b3a2e }, { outline: false });
    return group;
  }

  makeMarketStall(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('market-stall');
    this.addBlobShadow(group, 1.45, 0.98);
    const awningColor = seed % 2 === 0 ? colorOffset(palette.accent, -0.08) : 0x7c3f35;
    for (const x of [-1.05, 1.05]) for (const z of [-0.58, 0.58]) {
      this.kit.box(group, [0.13, 1.72, 0.13], [x, 0.88, z], DARK_WOOD, { outline: true }, 0.028);
    }
    this.kit.box(group, [2.35, 0.18, 0.82], [0, 0.72, 0.12], { kind: 'wood', color: 0x6d482e }, { outline: true }, 0.045);
    this.kit.box(group, [2.55, 0.08, 1.55], [0, 1.76, 0], { kind: 'cloth', color: awningColor }, { rotation: [0.04, 0, 0], outline: true }, 0.028);
    for (let stripe = -2; stripe <= 2; stripe += 1) {
      if (stripe % 2 === 0) this.kit.box(group, [0.42, 0.025, 1.46], [stripe * 0.48, 1.805, 0], { kind: 'cloth', color: colorOffset(awningColor, 0.09) }, {}, 0.012);
    }
    for (let i = 0; i < 5; i++) {
      const x = -0.8 + i * 0.4;
      const color = i % 2 === 0 ? 0xc17b3f : 0x6b944d;
      this.kit.sphere(group, 0.13 + hash01(seed, i) * 0.035, 8, [x, 0.88, 0.18 + (i % 2) * 0.12], { kind: 'plain', color }, { scale: [1, 0.72, 1], outline: true });
    }
    this.kit.box(group, [0.72, 0.52, 0.62], [-0.72, 0.28, -0.42], { kind: 'wood', color: 0x5f3e28 }, { outline: true }, 0.045);
    this.kit.box(group, [0.62, 0.42, 0.54], [0.55, 0.23, -0.48], { kind: 'wood', color: 0x6b472d }, { rotation: [0, 0.08, 0], outline: true }, 0.04);
    return group;
  }

  makeHandCart(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('hand-cart');
    this.addBlobShadow(group, 1.25, 0.72);
    const timber: MaterialSpec = { kind: 'wood', color: colorOffset(0x70472d, (hash01(seed, 5) - 0.5) * 0.08) };
    const rim: MaterialSpec = { kind: 'metal', color: colorOffset(palette.rock, -0.16), metalness: 0.55, roughness: 0.52 };

    this.kit.box(group, [1.68, 0.18, 1.02], [0, 0.72, 0], timber, { rotation: [0, 0, -0.03], outline: true }, 0.04);
    this.kit.box(group, [1.58, 0.48, 0.14], [0, 0.96, -0.45], timber, { rotation: [-0.08, 0, 0], outline: true }, 0.035);
    for (const x of [-0.76, 0.76]) {
      this.kit.box(group, [0.14, 0.46, 0.94], [x, 0.94, 0], timber, { rotation: [0, 0, x < 0 ? -0.05 : 0.05], outline: true }, 0.035);
    }
    for (const z of [-0.57, 0.57]) {
      this.kit.cylinder(group, 0.43, 0.43, 0.13, 14, [0.42, 0.48, z], { kind: 'wood', color: 0x4d321f }, { rotation: [Math.PI * 0.5, 0, 0], outline: true });
      this.kit.torus(group, 0.43, 0.045, 6, 14, [0.42, 0.48, z], rim, { rotation: [Math.PI * 0.5, 0, 0] });
      for (let spoke = 0; spoke < 6; spoke++) {
        const angle = spoke / 6 * Math.PI * 2;
        this.kit.beamBetween(
          group,
          new THREE.Vector3(0.42, 0.48, z),
          new THREE.Vector3(0.42 + Math.cos(angle) * 0.34, 0.48 + Math.sin(angle) * 0.34, z),
          0.025,
          0.018,
          { kind: 'wood', color: 0x5f3c24 },
          false,
        );
      }
    }
    for (const z of [-0.31, 0.31]) {
      this.kit.beamBetween(group, new THREE.Vector3(-0.72, 0.68, z), new THREE.Vector3(-2.02, 0.34, z), 0.055, 0.04, timber, true);
    }
    this.kit.box(group, [0.66, 0.46, 0.54], [-0.28, 1.08, 0.02], { kind: 'wood', color: 0x5f3e28 }, { rotation: [0, 0.12, 0], outline: true }, 0.04);
    this.kit.sphere(group, 0.22, 8, [0.45, 1.08, 0.08], { kind: 'cloth', color: colorOffset(palette.accent, -0.08) }, { scale: [1.15, 0.82, 0.95], outline: true });
    return group;
  }

  makeTownBench(seed: number): THREE.Group {
    const group = this.kit.group('town-bench');
    this.addBlobShadow(group, 0.95, 0.38);
    const timber: MaterialSpec = { kind: 'wood', color: colorOffset(0x70482d, (hash01(seed, 3) - 0.5) * 0.08) };
    this.kit.box(group, [1.85, 0.16, 0.48], [0, 0.56, 0], timber, { outline: true }, 0.04);
    this.kit.box(group, [1.85, 0.58, 0.13], [0, 0.92, -0.2], timber, { rotation: [-0.08, 0, 0], outline: true }, 0.035);
    for (const x of [-0.68, 0.68]) {
      this.kit.box(group, [0.14, 0.58, 0.14], [x, 0.29, 0], DARK_WOOD, { outline: true }, 0.028);
      this.kit.box(group, [0.14, 0.82, 0.14], [x, 0.63, -0.22], DARK_WOOD, { rotation: [-0.08, 0, 0], outline: true }, 0.028);
    }
    return group;
  }

  makeFlowerPlanter(seed: number, palette: ArtPalette): THREE.Group {
    const group = this.kit.group('flower-planter');
    this.addBlobShadow(group, 0.62, 0.38);
    this.kit.box(group, [1.12, 0.38, 0.64], [0, 0.23, 0], { kind: 'wood', color: 0x68432b }, { outline: true }, 0.045);
    this.kit.box(group, [0.96, 0.12, 0.5], [0, 0.42, 0], { kind: 'dirt', color: 0x4d3828 }, { outline: false }, 0.025);
    const flowerColors = [palette.accent, 0xd5a94f, 0x9b5f86];
    for (let i = 0; i < 7; i++) {
      const x = -0.4 + i * 0.13;
      const z = (hash01(seed, i * 7) - 0.5) * 0.28;
      const height = 0.36 + hash01(seed, i * 11 + 1) * 0.24;
      this.kit.beamBetween(group, new THREE.Vector3(x, 0.44, z), new THREE.Vector3(x + (hash01(seed, i * 13 + 2) - 0.5) * 0.08, height, z), 0.024, 0.018, { kind: 'foliage', color: 0x3f6d3d }, false);
      this.kit.sphere(group, 0.07, 7, [x, height, z], { kind: 'foliage', color: flowerColors[(seed + i) % flowerColors.length] }, { scale: [1, 0.65, 1], outline: true });
    }
    return group;
  }

  makePlant(stage: number, color: number): THREE.Group {
    const group = this.kit.group('plant');
    const count = Math.min(7, 2 + stage);
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      const radius = 0.12 + (i % 2) * 0.09;
      const height = 0.26 + stage * 0.08 + (i % 3) * 0.04;
      this.kit.beamBetween(group, new THREE.Vector3(0, 0.06, 0), new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius), 0.035, 0.025, { kind: 'foliage', color: 0x426b3b }, false);
      this.kit.sphere(group, 0.08 + stage * 0.02, 7, [Math.cos(angle) * radius, height, Math.sin(angle) * radius], { kind: 'foliage', color, emissive: stage >= 3 ? color : 0, emissiveIntensity: stage >= 3 ? 0.45 : 0 }, { scale: [1, 0.75, 1], outline: true });
    }
    return group;
  }

  resetHousePrototypeCache(): void {
    for (const prototype of this.housePrototypeCache.values()) {
      prototype.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) child.geometry.dispose();
      });
    }
    this.housePrototypeCache.clear();
  }

  dispose(): void {
    this.resetHousePrototypeCache();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
    this.shadowTexture.dispose();
  }

}
