import * as THREE from 'three';

class MockGradient { addColorStop(): void {} }
class MockContext {
  fillStyle: string | MockGradient = '';
  createImageData(width: number, height: number): ImageData {
    return { width, height, colorSpace: 'srgb', data: new Uint8ClampedArray(width * height * 4) } as ImageData;
  }
  putImageData(): void {}
  createRadialGradient(): CanvasGradient { return new MockGradient() as unknown as CanvasGradient; }
  fillRect(): void {}
}
class MockCanvas {
  width = 128;
  height = 128;
  private readonly context = new MockContext();
  getContext(): CanvasRenderingContext2D { return this.context as unknown as CanvasRenderingContext2D; }
}
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => {
    if (tag !== 'canvas') throw new Error(`Unsupported element ${tag}`);
    return new MockCanvas();
  },
};

async function main(): Promise<void> {
  const { StylizedMaterialLibrary, surfaceUvTransform } = await import('../src/art3d/materials.ts');
  const { ModelingToolkit } = await import('../src/art3d/modeling.ts');
  const { StylizedAssetFactory } = await import('../src/art3d/assets.ts');
  const renderer = { capabilities: { getMaxAnisotropy: () => 4 } } as unknown as THREE.WebGLRenderer;
  const materials = new StylizedMaterialLibrary(renderer);
  const kit = new ModelingToolkit(materials);
  const factory = new StylizedAssetFactory(kit);
  const variants = new Set<string>();
  for (let seed = 0; seed < 64; seed++) {
    const transform = surfaceUvTransform(seed);
    const [a, b, c, d] = transform.matrix.elements;
    const determinant = a * d - b * c;
    if (Math.abs(Math.abs(determinant) - 1) > 1e-6) throw new Error(`surface UV transform ${seed} is not orthogonal`);
    variants.add(`${a},${b},${c},${d}:${transform.offset.x.toFixed(3)},${transform.offset.y.toFixed(3)}`);
  }
  if (variants.size < 24) throw new Error(`surface UV anti-repetition produced too few variants: ${variants.size}`);
  const palette = { floor: 0x557c45, floorAlt: 0x416b3a, path: 0x8a704f, rock: 0x555b58, brick: 0x796652, water: 0x355f70, accent: 0x8ee6c8 };
  const houseCottage = factory.makeHouse({ id: 'test-cottage', ordinal: 2, x0: 0, y0: 0, x1: 7, y1: 6, doorTx: 7, doorTy: 3, doorSide: 'e', role: 'residential-small', style: 'garden', storeys: 1 }, palette);
  const houseTownhouse = factory.makeHouse({ id: 'test-townhouse', ordinal: 3, x0: 0, y0: 0, x1: 9, y1: 7, doorTx: 4, doorTy: 7, doorSide: 's', role: 'residential-medium', style: 'plaster', storeys: 3 }, palette);
  const houseManor = factory.makeHouse({ id: 'test-manor', ordinal: 4, x0: 0, y0: 0, x1: 13, y1: 10, doorTx: 6, doorTy: 10, doorSide: 's', role: 'residential-luxury', style: 'stone', storeys: 3 }, palette);
  const houseQuest = factory.makeHouse({ id: 'test-quest', ordinal: 5, x0: 0, y0: 0, x1: 10, y1: 8, doorTx: 0, doorTy: 4, doorSide: 'w', role: 'quest-house', style: 'timber', storeys: 2, enterable: true, questId: 'city-story:test' }, palette);
  const houseMarket = factory.makeHouse({ id: 'test-market', ordinal: 6, x0: 0, y0: 0, x1: 14, y1: 9, doorTx: 14, doorTy: 4, doorSide: 'e', role: 'market-hall', style: 'mercantile', storeys: 2 }, palette);
  const houseOffice = factory.makeHouse({ id: 'test-office', ordinal: 7, x0: 0, y0: 0, x1: 11, y1: 8, doorTx: 5, doorTy: 0, doorSide: 'n', role: 'office', style: 'stone', storeys: 4 }, palette);
  const houseWorkshop = factory.makeHouse({ id: 'test-workshop', ordinal: 8, x0: 0, y0: 0, x1: 9, y1: 8, doorTx: 9, doorTy: 4, doorSide: 'e', role: 'workshop', style: 'brick', storeys: 2 }, palette);
  const leftDoor = factory.makeHouse({ id: 'test-left-door', ordinal: 12, x0: 0, y0: 0, x1: 8, y1: 7, doorTx: 2, doorTy: 7, doorSide: 's', role: 'residential-medium', style: 'plaster', storeys: 2 }, palette);
  const rightDoor = factory.makeHouse({ id: 'test-right-door', ordinal: 12, x0: 0, y0: 0, x1: 8, y1: 7, doorTx: 6, doorTy: 7, doorSide: 's', role: 'residential-medium', style: 'plaster', storeys: 2 }, palette);
  if (leftDoor.root.userData.doorIndex !== 2) throw new Error('left-offset house doorway was not preserved by the prototype cache');
  if (rightDoor.root.userData.doorIndex !== 6) throw new Error('right-offset house doorway was not preserved by the prototype cache');
  if (houseQuest.root.userData.doorAjar !== true) throw new Error('enterable quest house is not marked as having a visibly open doorway');
  if (typeof houseWorkshop.smokeEnabled !== 'boolean') throw new Error('house smoke eligibility was not projected to the instance');
  const hero = factory.makeHero();
  const pet = factory.makeAnimal('pet', true);
  const portal = factory.makePortal(0x7ad4e8, 'arcane');
  const mine = factory.makePortal(0xff856d, 'mine');
  const tree = factory.makeTree(17, palette);
  const ancientTree = factory.makeAncientTree(19, palette);
  const pineTree = factory.makePineTree(21, palette);
  const rocks = factory.makeRockCluster(23, 0x555b58);
  const boulder = factory.makeBoulder(29, palette);
  const cliffOutcrop = factory.makeCliffOutcrop(31, palette);
  const flowerPatch = factory.makeFlowerPatch(37, palette);
  const reedCluster = factory.makeReedCluster(39, palette);
  const fence = factory.makeFenceSegment(2.4);
  const wall = factory.makeWallSection(4.2, palette);
  const wallTower = factory.makeWallTower(palette);
  const gatehouse = factory.makeGatehouse(palette, 5.4);
  const keep = factory.makeKeep(palette, 41);
  const bridge = factory.makeBridge(5.2, palette);
  const dock = factory.makeDock(6.4, palette);
  const roadMarker = factory.makeRoadMarker(palette, 43);
  const monument = factory.makeMonument(palette, 47);
  const ruinedTower = factory.makeRuinedTower(palette, 53);
  const cityFountain = factory.makeCityFountain(palette, 59);
  const clockTower = factory.makeClockTower(palette, 61);
  const parkGazebo = factory.makeParkGazebo(palette, 67);
  const lighthouse = factory.makeLighthouse(palette, 71);
  const cafeTerrace = factory.makeCafeTerrace(palette, 73);
  const dungeonEntrance = factory.makeDungeonEntrance(palette, 79);
  const dungeonPillar = factory.makeDungeonPillar(palette, 83);
  const dungeonBrazier = factory.makeDungeonBrazier(palette, 89);
  const dungeonRubble = factory.makeDungeonRubble(palette, 97);
  let totalPbrMeshes = 0;
  let totalUv1Meshes = 0;
  for (const [name, object] of Object.entries({
    houseCottage: houseCottage.root,
    houseTownhouse: houseTownhouse.root,
    houseManor: houseManor.root,
    houseQuest: houseQuest.root,
    houseMarket: houseMarket.root,
    houseOffice: houseOffice.root,
    houseWorkshop: houseWorkshop.root,
    hero: hero.root,
    pet: pet.root,
    portal,
    mine,
    tree,
    ancientTree,
    pineTree,
    rocks,
    boulder,
    cliffOutcrop,
    flowerPatch,
    reedCluster,
    fence,
    wall,
    wallTower,
    gatehouse,
    keep,
    bridge,
    dock,
    roadMarker,
    monument,
    ruinedTower,
    cityFountain,
    clockTower,
    parkGazebo,
    lighthouse,
    cafeTerrace,
    dungeonEntrance,
    dungeonPillar,
    dungeonBrazier,
    dungeonRubble,
  })) {
    let meshes = 0;
    let lines = 0;
    let lights = 0;
    let triangles = 0;
    let pbrMeshes = 0;
    let uv1Meshes = 0;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes++;
        const index = child.geometry.index;
        const position = child.geometry.getAttribute('position');
        if (!position) throw new Error(`${name}/${child.name || 'mesh'} is missing positions`);
        triangles += index ? index.count / 3 : position.count / 3;
        const uv = child.geometry.getAttribute('uv');
        if (!uv) throw new Error(`${name}/${child.name || 'mesh'} is missing UV0`);
        const uv1 = child.geometry.getAttribute('uv1');
        if (uv1) uv1Meshes++;

        const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of meshMaterials) {
          if (!(material instanceof THREE.MeshStandardMaterial) || !material.name.startsWith('undral-pbr:')) continue;
          const kind = material.name.split(':')[1];
          if (kind === 'plain') continue;
          pbrMeshes++;
          if (!material.map || !material.normalMap || !material.aoMap || !material.roughnessMap || !material.metalnessMap) {
            throw new Error(`${name}/${child.name || 'mesh'} uses incomplete PBR maps for ${material.name}`);
          }
          if (!uv1) throw new Error(`${name}/${child.name || 'mesh'} uses AO but has no UV1`);
          if (material.map.colorSpace !== THREE.SRGBColorSpace) {
            throw new Error(`${material.name} base color must be sRGB`);
          }
          for (const [label, texture] of [['normal', material.normalMap], ['ao', material.aoMap], ['roughness', material.roughnessMap], ['metalness', material.metalnessMap]] as const) {
            if (texture.colorSpace !== THREE.NoColorSpace) throw new Error(`${material.name} ${label} map must be linear data`);
            if (texture.wrapS !== THREE.RepeatWrapping || texture.wrapT !== THREE.RepeatWrapping) {
              throw new Error(`${material.name} ${label} map must repeat`);
            }
          }
        }
      }
      if (child instanceof THREE.LineSegments) lines++;
      if (child instanceof THREE.Light) lights++;
    });
    totalPbrMeshes += pbrMeshes;
    totalUv1Meshes += uv1Meshes;
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    if (![size.x, size.y, size.z].every(Number.isFinite)) throw new Error(`${name} has invalid bounds`);
    if (['hero', 'pet', 'portal', 'mine', 'tree', 'ancientTree', 'pineTree', 'rocks', 'boulder', 'cliffOutcrop', 'flowerPatch', 'reedCluster', 'fence', 'wall', 'wallTower', 'gatehouse', 'keep', 'bridge', 'dock', 'monument', 'ruinedTower', 'cityFountain', 'clockTower', 'parkGazebo', 'lighthouse', 'cafeTerrace', 'dungeonEntrance', 'dungeonPillar', 'dungeonBrazier', 'dungeonRubble'].includes(name) && !object.getObjectByName('contact-shadow')) {
      throw new Error(`${name} is missing its contact-shadow mesh`);
    }
    console.log(JSON.stringify({ name, meshes, pbrMeshes, uv1Meshes, lines, lights, triangles: Math.round(triangles), size: size.toArray().map((value) => Number(value.toFixed(2))) }));
  }
  if (totalPbrMeshes < 20) throw new Error(`Expected a substantial PBR material population, got ${totalPbrMeshes}`);
  if (totalUv1Meshes < totalPbrMeshes) throw new Error(`UV1 coverage is incomplete: ${totalUv1Meshes}/${totalPbrMeshes}`);
  factory.dispose();
  kit.dispose();
  materials.dispose();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
