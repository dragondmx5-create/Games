import { MAP_W, MAP_H, TILE, FARMING, TOWN, TOWN_ANIMALS, LAND_TOWN_ANIMALS, AnimalKind, CropId, CROPS, ROAD, WORLD_RADIUS, REGION_SIZE } from './config';
import { getLand, regionProfileAt, regionsForLand } from './overworld/registry';
import type { LandId, RegionFeature } from './overworld/types';
import { generateRegionResourceNodes } from '../server/src/world/resourceLayout';
import type { DungeonTopology } from '../server/src/dungeon/topology';
import { dungeonOverworldEntrance } from '../server/src/dungeon/overworldEntrance';
import { canonicalOverworldGatePositions, generateCanonicalOverworldTopology } from '../server/src/world/overworldTopology';
import { PATH_FLOOR_VARIANT, isPathFloorVariant } from '../server/src/world/overworldTopology';
import { settlementAnimals, settlementFarmPlots, settlementHouses } from '../server/src/world/settlementLayout';

export * from './world/types';
import { Tile } from './world/types';
import type { EdgeDir, FarmPlot, WorldPortalKind, PropKind, WorldResourceNode, World } from './world/types';


/** Client presentation projection of the server-issued Dungeon topology.
 * The client never generates, repairs, or mutates authoritative Dungeon
 * collision; it only copies the signed-in user's current server snapshot. */
export function worldFromDungeonTopology(topology: DungeonTopology): World {
  if ((topology.version !== 1 && topology.version !== 2) || topology.tiles.length !== topology.w * topology.h || topology.floorVariant.length !== topology.w * topology.h) {
    throw new Error('invalid authoritative Dungeon topology');
  }
  return {
    layer: topology.floor,
    w: topology.w,
    h: topology.h,
    tiles: Uint8Array.from(topology.tiles),
    floorVariant: Uint8Array.from(topology.floorVariant),
    props: [],
    weaponSpots: [],
    chests: [],
    farmPlots: [],
    npcSpawns: [],
    animalSpawns: [],
    portals: [],
    resourceNodes: [],
    miningNodes: [],
    dungeonHazards: 'hazards' in topology ? topology.hazards : [],
    entrance: { ...topology.entrance },
    exit: { ...topology.exit },
  };
}

export function tileAt(world: World, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return Tile.Rock;
  return world.tiles[ty * world.w + tx] as Tile;
}

export function isSolid(t: Tile): boolean {
  return t === Tile.Rock || t === Tile.Brick;
}

export function farmPlotAt(world: World, tx: number, ty: number): FarmPlot | undefined {
  return world.farmPlots.find((p) => p.tx === tx && p.ty === ty);
}

export function inTown(world: World, tx: number, ty: number): boolean {
  const b = world.townBounds;
  return !!b && tx >= b.x0 && tx <= b.x1 && ty >= b.y0 && ty <= b.y1;
}

export function inFarmZone(world: World, tx: number, ty: number): boolean {
  const b = world.farmBounds;
  return !!b && tx >= b.x0 && tx <= b.x1 && ty >= b.y0 && ty <= b.y1;
}

/** the farm+town hub: grass ground, full daylight (see render.ts), no enemy spawns/ambushes */
export function inGreenZone(world: World, tx: number, ty: number): boolean {
  return inTown(world, tx, ty) || inFarmZone(world, tx, ty);
}

export function isWalkable(world: World, tx: number, ty: number): boolean {
  return !isSolid(tileAt(world, tx, ty));
}

// -------- generation: cellular automata caves --------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the shared cellular-automata cave base: fill, smooth, keep the largest
 * connected region, roll floor variants — used by both the dungeon
 * generator (generateWorld) and the surface region generator
 * (generateRegion). Consumes rand in a fixed order, so extracting this
 * changed nothing about existing seeds' output. */
function carveCaveBase(w: number, h: number, fillChance: number, rand: () => number) {
  let cells = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) cells[i] = rand() < fillChance ? 1 : 0;

  for (let pass = 0; pass < 5; pass++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) walls++;
            else walls += cells[ny * w + nx];
          }
        }
        next[y * w + x] = walls >= 5 ? 1 : 0;
      }
    }
    cells = next;
  }

  // keep the largest connected region; the rest becomes rock
  const region = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (cells[i] === 0 && region[i] === -1) {
      const id = sizes.length;
      let size = 0;
      const stack = [i];
      region[i] = id;
      while (stack.length) {
        const cur = stack.pop()!;
        size++;
        const cx = cur % w;
        const cy = (cur / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (cells[ni] === 0 && region[ni] === -1) {
            region[ni] = id;
            stack.push(ni);
          }
        }
      }
      sizes.push(size);
    }
  }
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;

  const tiles = new Uint8Array(w * h);
  const floorIdx: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (cells[i] === 0 && region[i] === best) {
      tiles[i] = Tile.Floor;
      floorIdx.push(i);
    } else {
      tiles[i] = Tile.Rock;
    }
  }

  const floorVariant = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rand();
    floorVariant[i] = r < 0.55 ? 0 : r < 0.72 ? 1 : r < 0.82 ? 2 : r < 0.9 ? 3 : r < 0.96 ? 4 : 5;
  }

  return { tiles, floorVariant, floorIdx };
}

export function generateWorld(layer: number, seed = Date.now()): World {
  const rand = mulberry32(seed + layer * 7919);
  const w = MAP_W;
  const h = MAP_H;

  // deeper layers = tighter caves
  const fillChance = 0.44 + layer * 0.008;
  const { tiles, floorVariant, floorIdx } = carveCaveBase(w, h, fillChance, rand);

  const pick = () => floorIdx[(rand() * floorIdx.length) | 0];
  const toXY = (i: number) => ({ x: i % w, y: (i / w) | 0 });

  // entrance & exit — as far apart as possible
  const entranceI = pick();
  let exitI = entranceI;
  let bestDist = -1;
  for (let tries = 0; tries < 60; tries++) {
    const c = pick();
    const a = toXY(entranceI);
    const b = toXY(c);
    const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    if (d > bestDist) {
      bestDist = d;
      exitI = c;
    }
  }
  tiles[entranceI] = Tile.Entrance;
  tiles[exitI] = Tile.Exit;

  const world: World = {
    layer,
    w,
    h,
    tiles,
    floorVariant,
    props: [],
    weaponSpots: [],
    chests: [],
    farmPlots: [],
    npcSpawns: [],
    animalSpawns: [],
    portals: [],
    resourceNodes: [],
    miningNodes: [],
    visualLayer: layer,
    dangerLevel: layer,
    entrance: toXY(entranceI),
    exit: toXY(exitI),
  };

  // Overworld settlements and farming never appear on dungeon floors.
  // Floors are reserved for combat, resources, rooms, and authored dungeon mechanics.
  carveRuins(world, rand);
  carveRoad(world, rand);

  // resources — deeper = fewer glowshrooms (light gets scarce)
  const shroomCount = Math.max(4, 14 - layer * 2);
  for (let i = 0; i < shroomCount; i++) {
    const c = pick();
    if (tiles[c] === Tile.Floor) tiles[c] = Tile.Glowshroom;
  }
  const crystalCount = 6 + layer * 3;
  for (let i = 0; i < crystalCount; i++) {
    const c = pick();
    if (tiles[c] === Tile.Floor) tiles[c] = Tile.Crystal;
  }
  const ironCount = 4 + layer * 2;
  for (let i = 0; i < ironCount; i++) {
    const c = pick();
    if (tiles[c] === Tile.Floor) tiles[c] = Tile.IronOre;
  }
  for (let i = 0; i < 10; i++) {
    // small ponds (blobs of 2-4 tiles) — more of them now that the whole
    // world is open ground instead of a tight cave, per the bigger map
    const c = pick();
    if (tiles[c] !== Tile.Floor) continue;
    const { x, y } = toXY(c);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      if (rand() < 0.75 && tileAt(world, x + dx, y + dy) === Tile.Floor) {
        tiles[(y + dy) * w + (x + dx)] = Tile.Water;
      }
    }
  }

  scatterProps(world, floorIdx, rand);
  return world;
}

/** Shared safe-settlement layout — walled, intact (no crumbled
 * gaps, unlike ruins), a statue/pillar square, a shopkeeper, and a few NPCs
 * wandering inside. See inTown() for the exclusion zone this creates. */
function carveTown(world: World, rand: () => number): void {
  const { w, h, tiles } = world;
  const TRIES = 100;
  for (let tries = 0; tries < TRIES; tries++) {
    const settlementKind = world.profile?.settlement?.kind;
    const sizeBonus = settlementKind === 'capital' ? 5 : settlementKind === 'town' ? 2 : settlementKind === 'outpost' ? -2 : 0;
    const minW = Math.max(12, TOWN.minW + sizeBonus);
    const maxW = Math.max(minW, TOWN.maxW + sizeBonus);
    const minH = Math.max(10, TOWN.minH + Math.round(sizeBonus * 0.75));
    const maxH = Math.max(minH, TOWN.maxH + Math.round(sizeBonus * 0.75));
    const tw = minW + ((rand() * (maxW - minW + 1)) | 0);
    const th = minH + ((rand() * (maxH - minH + 1)) | 0);
    const rx = 3 + ((rand() * (w - tw - 6)) | 0);
    const ry = 3 + ((rand() * (h - th - 6)) | 0);

    // stay near the entrance so it's actually findable on a big map — only
    // relax this in the last few tries, so a cramped entrance area doesn't
    // mean no town at all
    if (tries < TRIES - 15) {
      const d = Math.hypot(rx + tw / 2 - world.entrance.x, ry + th / 2 - world.entrance.y);
      if (d > TOWN.maxDistFromEntrance) continue;
    }

    let ok = true;
    for (let y = ry - 1; y <= ry + th && ok; y++) {
      for (let x = rx - 1; x <= rx + tw && ok; x++) {
        if (tiles[y * w + x] !== Tile.Floor) ok = false;
      }
    }
    if (!ok) continue;

    // two aligned doorways (north+south) so it reads as a through-route, not
    // a dead-end room — and no crumbled gaps, unlike carveRuins: this place
    // is maintained, not abandoned
    const doorX = rx + 2 + ((rand() * (tw - 4)) | 0);
    for (let y = ry; y < ry + th; y++) {
      for (let x = rx; x < rx + tw; x++) {
        const edge = x === rx || x === rx + tw - 1 || y === ry || y === ry + th - 1;
        if (!edge) continue;
        if ((y === ry || y === ry + th - 1) && x === doorX) continue;
        tiles[y * w + x] = Tile.Brick;
      }
    }

    world.townBounds = { x0: rx, y0: ry, x1: rx + tw - 1, y1: ry + th - 1 };

    const cx = (rx + tw / 2) * TILE;
    const cy = (ry + th / 2) * TILE;
    world.npcSpawns.push({ kind: 'shopkeeper', x: cx + TILE * 1.5, y: cy + TILE * 0.5, wanderRadius: 0 });
    const wandererCount = TOWN.wanderers + (settlementKind === 'capital' ? 3 : settlementKind === 'town' ? 1 : 0);
    for (let i = 0; i < wandererCount; i++) {
      const wx = (rx + 1.5 + rand() * (tw - 3)) * TILE;
      const wy = (ry + 1.5 + rand() * (th - 3)) * TILE;
      world.npcSpawns.push({ kind: 'wanderer', x: wx, y: wy, wanderRadius: TILE * 3 });
    }

    // livestock pen, tucked in a corner away from the shop/statue square.
    // The footprint is recorded on the world so the renderer can ring it
    // with cosmetic fence art when the manifest provides a 'fence' image
    // (purely visual — animals are held by their tight wander radius, and
    // the fence never blocks movement).
    const penX = rx + tw - 5;
    const penY = ry + th - 5;
    (world.pens ??= []).push({ x0: penX - 1, y0: penY - 1, x1: penX + 3, y1: penY + 3 });
    const animalPool = world.profile ? LAND_TOWN_ANIMALS[world.profile.landId] : TOWN_ANIMALS;
    for (const { kind, count } of animalPool) {
      for (let i = 0; i < count; i++) {
        const ax = (penX + rand() * 3) * TILE;
        const ay = (penY + rand() * 3) * TILE;
        world.animalSpawns.push({ kind, x: ax, y: ay, wanderRadius: TILE * 2.5 });
      }
    }
    return;
  }
  // too cramped to fit this run — rare, and non-fatal; the map just has no town
}

/** ruined brick structures — walls with height, a doorway, a statue or pillars inside */
function carveRuins(world: World, rand: () => number): void {
  const { w, tiles } = world;
  const ruinCount = 1 + (rand() < 0.5 ? 1 : 0);
  for (let n = 0; n < ruinCount; n++) {
    for (let tries = 0; tries < 80; tries++) {
      const rw = 7 + ((rand() * 4) | 0);
      const rh = 6 + ((rand() * 3) | 0);
      const rx = 2 + ((rand() * (world.w - rw - 4)) | 0);
      const ry = 2 + ((rand() * (world.h - rh - 4)) | 0);
      // needs open floor, and must not swallow entrance/exit
      let ok = true;
      for (let y = ry - 1; y <= ry + rh && ok; y++) {
        for (let x = rx - 1; x <= rx + rw && ok; x++) {
          const t = tileAt(world, x, y);
          if (t !== Tile.Floor) ok = false;
        }
      }
      if (!ok) continue;

      const doorX = rx + 2 + ((rand() * (rw - 4)) | 0);
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          const edge = x === rx || x === rx + rw - 1 || y === ry || y === ry + rh - 1;
          if (!edge) continue;
          if (y === ry + rh - 1 && x === doorX) continue; // doorway (south side)
          if (rand() < 0.12) continue; // crumbled gaps
          tiles[y * w + x] = Tile.Brick;
        }
      }
      // centerpiece
      const cx = (rx + rw / 2) * TILE;
      const cy = (ry + rh / 2) * TILE;
      if (rand() < 0.5) {
        world.props.push({ kind: 'statue', x: cx, y: cy, seed: (rand() * 1e9) | 0 });
        world.props.push({ kind: 'brokenPillar', x: rx * TILE + TILE * 1.5, y: (ry + rh - 1) * TILE - 4, seed: 1 });
      } else {
        world.props.push({ kind: 'pillar', x: rx * TILE + TILE * 1.5, y: ry * TILE + TILE * 2, seed: 1 });
        world.props.push({ kind: 'pillar', x: (rx + rw - 1.5) * TILE, y: ry * TILE + TILE * 2, seed: 2 });
        world.props.push({ kind: 'brokenPillar', x: (rx + rw - 1.5) * TILE, y: (ry + rh - 2) * TILE, seed: 3 });
      }
      world.props.push({ kind: 'bones', x: cx + TILE, y: cy + TILE * 1.5, seed: 3 });
      world.props.push({ kind: 'skull', x: cx - TILE * 1.5, y: cy + TILE, seed: 4 });
      world.props.push({ kind: 'rubble', x: cx + TILE * 2, y: cy - TILE * 0.5, seed: (rand() * 1e9) | 0 });
      // a blade left behind — better ones the deeper the ruin
      world.weaponSpots.push({
        x: cx - TILE,
        y: cy + TILE,
        weapon: world.layer <= 2 ? 'chitin' : 'crystal',
      });
      // a chest of salvaged supplies — see game.ts openChest / config.ts CHEST_LOOT
      world.chests.push({ x: cx + TILE * 1.5, y: cy + TILE * 1.5, opened: false });
      break;
    }
  }
}

/** layer-gated weighted crop pick for a newly carved plot — same idiom as
 * carveRuins' chitin-vs-crystal weaponSpots tiering above */
function pickCrop(layer: number, rand: () => number): CropId {
  if (layer >= CROPS.caveberry.minLayer && rand() < 0.35) return 'caveberry';
  return 'glowshroom';
}

/** a small cluster of tilled soil the player can plant crop seeds on */
function carveFarmPlots(world: World, floorIdx: number[], rand: () => number): void {
  const { w, h, tiles } = world;
  const toXY = (i: number) => ({ x: i % w, y: (i / w) | 0 });

  for (let tries = 0; tries < 40; tries++) {
    const anchor = floorIdx[(rand() * floorIdx.length) | 0];
    if (tiles[anchor] !== Tile.Floor) continue;
    const { x: ax, y: ay } = toXY(anchor);
    if ((ax - world.entrance.x) ** 2 + (ay - world.entrance.y) ** 2 < 12 * 12) continue;
    if (inTown(world, ax, ay)) continue; // tilled soil doesn't belong in the town square

    // flood outward from the anchor, claiming plain floor tiles as plots —
    // never stepping into the town: only the anchor was checked before, so
    // the fill could leak through a doorway and till the town square
    const claimed: number[] = [];
    const seen = new Set<number>([anchor]);
    const queue = [anchor];
    while (queue.length && claimed.length < FARMING.plotsPerLayer) {
      const cur = queue.shift()!;
      if (tiles[cur] === Tile.Floor) claimed.push(cur);
      const { x: cx, y: cy } = toXY(cur);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (inTown(world, nx, ny)) continue;
        const ni = ny * w + nx;
        if (seen.has(ni)) continue;
        seen.add(ni);
        if (tiles[ni] === Tile.Floor) queue.push(ni);
      }
    }
    if (claimed.length < Math.min(3, FARMING.plotsPerLayer)) continue; // too cramped, try elsewhere

    const xs = claimed.map((i) => toXY(i).x);
    const ys = claimed.map((i) => toXY(i).y);
    for (const i of claimed) {
      tiles[i] = Tile.Farmland;
      const { x, y } = toXY(i);
      world.farmPlots.push({ tx: x, ty: y, crop: pickCrop(world.layer, rand), stage: 0, timer: 0 });
    }
    // +1 tile padding so the grass/full-daylight treatment covers the walking
    // path right around the plots too, not just the tilled soil itself
    world.farmBounds = {
      x0: Math.max(0, Math.min(...xs) - 1),
      y0: Math.max(0, Math.min(...ys) - 1),
      x1: Math.min(w - 1, Math.max(...xs) + 1),
      y1: Math.min(h - 1, Math.max(...ys) + 1),
    };
    return;
  }
}

/** a big, distinct road connecting the entrance and exit (the map's two
 * farthest-apart points already), strewn with rubble — carved as a straight
 * corridor rather than following the cave's organic paths, so it reads as a
 * deliberate route through the wilderness. Leaves town/ruin walls and farm
 * plots untouched — it clears Rock to Floor but skips anything already
 * man-made or special. */
function carveRoad(world: World, rand: () => number): void {
  const { w, h, tiles, floorVariant } = world;
  const a = world.entrance;
  const b = world.exit;
  const steps = Math.max(1, Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2);
  const half = Math.floor(ROAD.width / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(a.x + (b.x - a.x) * t);
    const cy = Math.round(a.y + (b.y - a.y) * t);
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1) continue;
        const idx = ty * w + tx;
        const cur = tiles[idx];
        if (cur === Tile.Brick || cur === Tile.Farmland || cur === Tile.Entrance || cur === Tile.Exit) continue;
        tiles[idx] = Tile.Floor;
        floorVariant[idx] = 4; // "worn slab" variant — reads as a trodden path
      }
    }
    if (i % (ROAD.rubbleEvery * 2) === 0 && rand() < 0.6 && !inTown(world, cx, cy)) {
      world.props.push({
        kind: 'rubble',
        x: (cx + 0.3 + rand() * 0.4) * TILE,
        y: (cy + 0.5 + rand() * 0.4) * TILE,
        seed: (rand() * 1e9) | 0,
      });
    }
  }
}

function scatterProps(world: World, floorIdx: number[], rand: () => number, scale = 1, treeScale = 1): void {
  const toXY = (i: number) => ({ x: i % world.w, y: (i / world.w) | 0 });
  const add = (kind: PropKind, baseCount: number) => {
    const count = Math.max(1, Math.round(baseCount * scale));
    for (let i = 0; i < count; i++) {
      const c = floorIdx[(rand() * floorIdx.length) | 0];
      if (world.tiles[c] !== Tile.Floor) continue;
      const { x, y } = toXY(c);
      // avoid spawning on the player's doorstep
      if ((x - world.entrance.x) ** 2 + (y - world.entrance.y) ** 2 < 9) continue;
      if (inTown(world, x, y)) continue; // wilderness props don't belong in the town square
      world.props.push({
        kind,
        x: (x + 0.3 + rand() * 0.4) * TILE,
        y: (y + 0.5 + rand() * 0.4) * TILE,
        seed: (rand() * 1e9) | 0,
      });
    }
  };
  add('tree', Math.max(4, Math.round(90 * treeScale)));
  const landId = world.profile?.landId;
  if (landId === 'witchlands') { add('ancientTree', 6); add('flowerPatch', 3); }
  else if (landId === 'green-land') { add('ancientTree', 4); add('flowerPatch', 8); add('boulder', 4); }
  else if (landId === 'rainforest') { add('ancientTree', 9); add('reedCluster', 6); add('flowerPatch', 6); }
  else if (landId === 'frostlands') { add('pineTree', 18); add('boulder', 7); }
  else if (landId === 'sunscorched-desert') { add('boulder', 12); add('flowerPatch', 2); }
  else if (landId === 'cinder-coast') { add('pineTree', 5); add('boulder', 10); add('reedCluster', 5); }
  add('stalagmite', 14);
  add('rock', 16);
  add('rubble', 8);
  add('bones', 4);
  add('skull', 3);
  add('root', 10);
  add('shrooms', 8);
  add('bigCrystal', 2 + world.layer); // deeper = more crystal growth
  add('shrub', Math.max(8, Math.round(34 * treeScale)));
  if (world.region && rand() < 0.2) add('monument', 1);
  if (world.region && rand() < 0.24) add('ruinedTower', 1);
}

function scatterRoadsideDetails(world: World, worldSeed: number): void {
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let ty = 1; ty < world.h - 1; ty++) {
    for (let tx = 1; tx < world.w - 1; tx++) {
      const index = ty * world.w + tx;
      if (world.tiles[index] !== Tile.Floor || world.floorVariant[index] !== PATH_FLOOR_VARIANT) continue;
      if (inTown(world, tx, ty)) continue;
      const detailSeed = hashCoords(worldSeed ^ 0x4a6f7921, tx, ty) >>> 0;
      const kind: PropKind | null = detailSeed % 43 === 0 ? 'roadMarker' : detailSeed % 31 === 0 ? 'lanternPost' : detailSeed % 19 === 0 ? 'cairn' : null;
      if (!kind) continue;
      const start = detailSeed % directions.length;
      for (let offset = 0; offset < directions.length; offset++) {
        const [dx, dy] = directions[(start + offset) % directions.length];
        const px = tx + dx;
        const py = ty + dy;
        const adjacentIndex = py * world.w + px;
        if (world.tiles[adjacentIndex] !== Tile.Floor || world.floorVariant[adjacentIndex] === PATH_FLOOR_VARIANT) continue;
        if (world.portals.some((portal) => Math.hypot((px + 0.5) * TILE - portal.x, (py + 0.5) * TILE - portal.y) < TILE * 3)) break;
        world.props.push({
          kind,
          x: (px + 0.5) * TILE,
          y: (py + 0.5) * TILE,
          seed: detailSeed,
        });
        break;
      }
    }
  }
}

function pointSegmentDistance(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 1e-6) return Math.hypot(x - ax, y - ay);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

function townDecorationKinds(kind: string): PropKind[] {
  const modest: PropKind[] = ['townWell', 'townBench', 'lanternPost', 'lanternPost', 'flowerPlanter'];
  if (kind === 'hidden') return modest;
  const outpost = [...modest, 'townBench', 'flowerPlanter'] as PropKind[];
  if (kind === 'outpost') return outpost;
  const town = [...outpost, 'marketStall', 'marketStall', 'townBench', 'flowerPlanter'] as PropKind[];
  if (kind !== 'capital') return town;
  // Capital plazas stay deliberately compact: the four signature buildings
  // carry the skyline, while three early-priority stalls and one handcart
  // make the market readable without filling every walkable gap with props.
  return [
    'townWell',
    'marketStall', 'marketStall', 'marketStall',
    'handCart',
    'townBench', 'townBench',
    'lanternPost', 'lanternPost',
    'flowerPlanter', 'flowerPlanter',
  ];
}

/**
 * Composes settlement scenery around the canonical plaza after authoritative
 * topology has replaced the legacy random town rectangle. Large settlements
 * receive a larger prop budget, while house paths, NPC anchors, animal pens
 * and farm rows stay visually clear.
 */
function decorateTownPlaza(world: World, worldSeed: number, rx: number, ry: number): void {
  const bounds = world.townBounds;
  const settlement = world.profile?.settlement;
  if (!bounds || !settlement) return;

  const centerX = (bounds.x0 + bounds.x1 + 1) * 0.5;
  const centerY = (bounds.y0 + bounds.y1 + 1) * 0.5;
  const seed = hashCoords(worldSeed ^ 0x746f776e, rx, ry) >>> 0;
  const houses = world.houses ?? [];
  const paths = houses.map((house) => {
    const outward = house.doorSide === 'w' ? [-1, 0] : house.doorSide === 'e' ? [1, 0] : house.doorSide === 'n' ? [0, -1] : [0, 1];
    return {
      ax: house.doorTx + 0.5 + outward[0] * 1.2,
      ay: house.doorTy + 0.5 + outward[1] * 1.2,
      bx: centerX,
      by: centerY,
    };
  });
  const reservedPoints = [
    { x: centerX + 4, y: centerY + 1 },
    { x: centerX - 4, y: centerY + 1 },
    { x: centerX, y: centerY - 5 },
    ...settlementFarmPlots(rx, ry).map((plot) => ({ x: plot.tx + 0.5, y: plot.ty + 0.5 })),
    ...settlementAnimals(rx, ry).map((animal) => ({ x: animal.x / TILE, y: animal.y / TILE })),
  ];
  const sizes: Partial<Record<PropKind, number>> = {
    townWell: 1.25,
    marketStall: 1.65,
    townBench: 1.15,
    flowerPlanter: 0.8,
    lanternPost: 0.55,
  };
  const candidates: Array<{ x: number; y: number }> = [];
  const angleOffset = (seed % 360) * Math.PI / 180;
  for (const radius of [6.4, 8.4, 10.5, 12.5]) {
    for (let i = 0; i < 20; i++) {
      const angle = angleOffset + i / 20 * Math.PI * 2;
      candidates.push({ x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius });
    }
  }
  for (let y = bounds.y0 + 3.5; y <= bounds.y1 - 2.5; y += 2.25) {
    for (let x = bounds.x0 + 3.5; x <= bounds.x1 - 2.5; x += 2.25) {
      candidates.push({ x, y });
    }
  }

  const placed: Array<{ x: number; y: number; radius: number }> = [];
  const decorations = townDecorationKinds(settlement.kind);
  decorations.forEach((kind, ordinal) => {
    const radius = sizes[kind] ?? 0.75;
    const start = (seed + Math.imul(ordinal + 1, 17)) % candidates.length;
    for (let step = 0; step < candidates.length; step++) {
      const candidate = candidates[(start + step) % candidates.length];
      if (candidate.x < bounds.x0 + 2 || candidate.x > bounds.x1 - 1 || candidate.y < bounds.y0 + 2 || candidate.y > bounds.y1 - 1) continue;
      if (Math.abs(candidate.x - centerX) < 2.4 || Math.abs(candidate.y - centerY) < 2.4) continue;
      if (houses.some((house) => candidate.x > house.x0 - radius - 0.35 && candidate.x < house.x1 + radius + 1.35 && candidate.y > house.y0 - radius - 0.35 && candidate.y < house.y1 + radius + 1.35)) continue;
      if (paths.some((path) => pointSegmentDistance(candidate.x, candidate.y, path.ax, path.ay, path.bx, path.by) < radius * 0.45 + 0.65)) continue;
      if (reservedPoints.some((point) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < radius + 0.8)) continue;
      if ((world.pens ?? []).some((pen) => candidate.x > pen.x0 - radius && candidate.x < pen.x1 + radius + 1 && candidate.y > pen.y0 - radius && candidate.y < pen.y1 + radius + 1)) continue;
      if (placed.some((prop) => Math.hypot(candidate.x - prop.x, candidate.y - prop.y) < radius + prop.radius + 0.75)) continue;

      const faceCenter = Math.atan2(centerX - candidate.x, centerY - candidate.y);
      const propSeed = hashCoords(seed, ordinal, kind.length) >>> 0;
      world.props.push({
        kind,
        x: candidate.x * TILE,
        y: candidate.y * TILE,
        seed: propSeed,
        rotationY: kind === 'lanternPost' || kind === 'townWell' ? propSeed / 4294967296 * Math.PI * 2 : faceCenter,
      });
      placed.push({ ...candidate, radius });
      break;
    }
  });
}

interface PerimeterOpening {
  side: EdgeDir;
  center: number;
  width: number;
}

function capitalPerimeterOpenings(world: World): PerimeterOpening[] {
  const bounds = world.townBounds;
  if (!bounds) return [];
  const openings: PerimeterOpening[] = [];
  const collect = (side: EdgeDir, start: number, end: number, pathAt: (coordinate: number) => boolean): void => {
    let runStart = -1;
    for (let coordinate = start; coordinate <= end + 1; coordinate++) {
      const path = coordinate <= end && pathAt(coordinate);
      if (path && runStart < 0) runStart = coordinate;
      if (!path && runStart >= 0) {
        const runEnd = coordinate - 1;
        openings.push({ side, center: (runStart + runEnd + 1) * 0.5, width: runEnd - runStart + 1 });
        runStart = -1;
      }
    }
  };
  const isPath = (tx: number, ty: number): boolean => {
    const index = ty * world.w + tx;
    return isWalkable(world, tx, ty) && world.floorVariant[index] === PATH_FLOOR_VARIANT;
  };
  collect('n', bounds.x0, bounds.x1, (x) => isPath(x, bounds.y0));
  collect('s', bounds.x0, bounds.x1, (x) => isPath(x, bounds.y1));
  collect('w', bounds.y0, bounds.y1, (y) => isPath(bounds.x0, y));
  collect('e', bounds.y0, bounds.y1, (y) => isPath(bounds.x1, y));
  return openings;
}

function placeCapitalFortifications(world: World, worldSeed: number, rx: number, ry: number): void {
  const bounds = world.townBounds;
  const settlement = world.profile?.settlement;
  if (!bounds || settlement?.kind !== 'capital') return;
  const seed = hashCoords(worldSeed ^ 0x57414c4c, rx, ry) >>> 0;
  const openings = capitalPerimeterOpenings(world);
  const primary = openings.length > 0 ? openings[seed % openings.length] : {
    side: 's' as EdgeDir,
    center: (bounds.x0 + bounds.x1 + 1) * 0.5,
    width: 3,
  };
  const edgeMinX = bounds.x0 + 0.5;
  const edgeMaxX = bounds.x1 + 0.5;
  const edgeMinY = bounds.y0 + 0.5;
  const edgeMaxY = bounds.y1 + 0.5;
  const wallSeed = (ordinal: number): number => hashCoords(seed, ordinal, settlement.id.length) >>> 0;
  let ordinal = 0;

  for (const [x, y] of [[edgeMinX, edgeMinY], [edgeMaxX, edgeMinY], [edgeMinX, edgeMaxY], [edgeMaxX, edgeMaxY]] as const) {
    world.props.push({ kind: 'wallTower', x: x * TILE, y: y * TILE, seed: wallSeed(ordinal++) });
  }

  const addEdge = (side: EdgeDir, start: number, end: number, fixed: number, rotationY: number): void => {
    const sideOpenings = openings
      .filter((opening) => opening.side === side)
      .map((opening) => {
        const isPrimary = opening === primary;
        const gapWidth = isPrimary ? Math.max(5.4, opening.width + 2.2) : Math.max(3.0, opening.width + 0.8);
        return { start: opening.center - gapWidth * 0.5, end: opening.center + gapWidth * 0.5 };
      })
      .sort((a, b) => a.start - b.start);
    if (primary.side === side && !openings.includes(primary)) {
      sideOpenings.push({ start: primary.center - 2.7, end: primary.center + 2.7 });
    }
    const runs: Array<{ start: number; end: number }> = [];
    let cursor = start;
    for (const gap of sideOpenings) {
      const gapStart = Math.max(start, gap.start);
      const gapEnd = Math.min(end, gap.end);
      if (gapStart > cursor + 0.8) runs.push({ start: cursor, end: gapStart });
      cursor = Math.max(cursor, gapEnd);
    }
    if (cursor < end - 0.8) runs.push({ start: cursor, end });

    for (const run of runs) {
      let runCursor = run.start;
      while (run.end - runCursor > 0.9) {
        const remaining = run.end - runCursor;
        const length = remaining > 5.2 ? 4.2 : remaining;
        const center = runCursor + length * 0.5;
        const horizontal = side === 'n' || side === 's';
        world.props.push({
          kind: 'wallSection',
          x: (horizontal ? center : fixed) * TILE,
          y: (horizontal ? fixed : center) * TILE,
          seed: wallSeed(ordinal++),
          length,
          rotationY,
        });
        runCursor += length + 0.12;
      }
    }
  };

  const cornerClearance = 2.15;
  addEdge('n', edgeMinX + cornerClearance, edgeMaxX - cornerClearance, edgeMinY, 0);
  addEdge('s', edgeMinX + cornerClearance, edgeMaxX - cornerClearance, edgeMaxY, 0);
  addEdge('w', edgeMinY + cornerClearance, edgeMaxY - cornerClearance, edgeMinX, Math.PI * 0.5);
  addEdge('e', edgeMinY + cornerClearance, edgeMaxY - cornerClearance, edgeMaxX, Math.PI * 0.5);

  const horizontalGate = primary.side === 'n' || primary.side === 's';
  const gateX = horizontalGate ? primary.center : primary.side === 'w' ? edgeMinX : edgeMaxX;
  const gateY = horizontalGate ? primary.side === 'n' ? edgeMinY : edgeMaxY : primary.center;
  world.props.push({
    kind: 'gatehouse',
    x: gateX * TILE,
    y: gateY * TILE,
    seed: wallSeed(ordinal),
    length: Math.max(5.4, primary.width + 2.2),
    rotationY: horizontalGate ? 0 : Math.PI * 0.5,
  });
}

interface BridgeCandidate {
  tx: number;
  ty: number;
  span: number;
  rotationY: number;
}

function placePathBridges(world: World, worldSeed: number): void {
  const candidates: BridgeCandidate[] = [];
  const waterAt = (tx: number, ty: number): boolean => tileAt(world, tx, ty) === Tile.Water;
  const pathAt = (tx: number, ty: number): boolean => {
    if (tx < 1 || ty < 1 || tx >= world.w - 1 || ty >= world.h - 1) return false;
    const index = ty * world.w + tx;
    return world.tiles[index] === Tile.Floor && world.floorVariant[index] === PATH_FLOOR_VARIANT;
  };

  for (let ty = 3; ty < world.h - 3; ty++) {
    let runStart = -1;
    for (let tx = 3; tx <= world.w - 3; tx++) {
      const crossing = tx < world.w - 3 && pathAt(tx, ty) && waterAt(tx, ty - 2) && waterAt(tx, ty + 2);
      if (crossing && runStart < 0) runStart = tx;
      if (!crossing && runStart >= 0) {
        const runEnd = tx - 1;
        if (runEnd - runStart + 1 >= 2) candidates.push({ tx: (runStart + runEnd) * 0.5, ty, span: runEnd - runStart + 2.2, rotationY: 0 });
        runStart = -1;
      }
    }
  }
  for (let tx = 3; tx < world.w - 3; tx++) {
    let runStart = -1;
    for (let ty = 3; ty <= world.h - 3; ty++) {
      const crossing = ty < world.h - 3 && pathAt(tx, ty) && waterAt(tx - 2, ty) && waterAt(tx + 2, ty);
      if (crossing && runStart < 0) runStart = ty;
      if (!crossing && runStart >= 0) {
        const runEnd = ty - 1;
        if (runEnd - runStart + 1 >= 2) candidates.push({ tx, ty: (runStart + runEnd) * 0.5, span: runEnd - runStart + 2.2, rotationY: Math.PI * 0.5 });
        runStart = -1;
      }
    }
  }

  candidates.sort((a, b) => {
    const ah = hashCoords(worldSeed ^ 0x42524944, Math.floor(a.tx), Math.floor(a.ty)) >>> 0;
    const bh = hashCoords(worldSeed ^ 0x42524944, Math.floor(b.tx), Math.floor(b.ty)) >>> 0;
    return ah - bh;
  });
  const placed: BridgeCandidate[] = [];
  for (const candidate of candidates) {
    if (placed.length >= 2) break;
    if (inTown(world, Math.floor(candidate.tx), Math.floor(candidate.ty))) continue;
    if (world.portals.some((portal) => Math.hypot(candidate.tx * TILE - portal.x, candidate.ty * TILE - portal.y) < TILE * 7)) continue;
    if (placed.some((bridge) => Math.hypot(bridge.tx - candidate.tx, bridge.ty - candidate.ty) < 9)) continue;
    const seed = hashCoords(worldSeed ^ 0x62726964, Math.floor(candidate.tx), Math.floor(candidate.ty)) >>> 0;
    world.props.push({
      kind: 'bridge',
      x: (candidate.tx + 0.5) * TILE,
      y: (candidate.ty + 0.5) * TILE,
      seed,
      length: Math.min(10, candidate.span),
      rotationY: candidate.rotationY,
    });
    placed.push(candidate);
  }
}

function placeCinderDock(world: World, worldSeed: number): void {
  if (world.profile?.settlement?.id !== 'emberport' || world.profile.landId !== 'cinder-coast') return;
  const centerX = world.townBounds ? (world.townBounds.x0 + world.townBounds.x1 + 1) * 0.5 : world.w * 0.5;
  const centerY = world.townBounds ? (world.townBounds.y0 + world.townBounds.y1 + 1) * 0.5 : world.h * 0.5;
  const directions = [
    { dx: 1, dy: 0, rotationY: 0 },
    { dx: -1, dy: 0, rotationY: Math.PI },
    { dx: 0, dy: -1, rotationY: Math.PI * 0.5 },
    { dx: 0, dy: 1, rotationY: -Math.PI * 0.5 },
  ] as const;
  let best: { tx: number; ty: number; rotationY: number; score: number } | undefined;
  for (let ty = 5; ty < world.h - 5; ty++) {
    for (let tx = 5; tx < world.w - 5; tx++) {
      if (world.tiles[ty * world.w + tx] !== Tile.Floor) continue;
      if ((world.houses ?? []).some((house) => tx >= house.x0 - 1 && tx <= house.x1 + 1 && ty >= house.y0 - 1 && ty <= house.y1 + 1)) continue;
      for (const direction of directions) {
        let waterDepth = 0;
        for (let step = 1; step <= 6; step++) {
          if (tileAt(world, tx + direction.dx * step, ty + direction.dy * step) !== Tile.Water) break;
          waterDepth++;
        }
        if (waterDepth < 5) continue;
        const distance = Math.hypot(tx - centerX, ty - centerY);
        const jitter = (hashCoords(worldSeed ^ 0x444f434b, tx, ty) >>> 0) / 0xffffffff;
        const score = distance + jitter * 5;
        if (!best || score < best.score) best = { tx, ty, rotationY: direction.rotationY, score };
      }
    }
  }
  if (!best) return;
  world.props.push({
    kind: 'dock',
    x: (best.tx + 0.5) * TILE,
    y: (best.ty + 0.5) * TILE,
    seed: hashCoords(worldSeed ^ 0x70696572, best.tx, best.ty) >>> 0,
    length: 6.4,
    rotationY: best.rotationY,
  });
}

export function landmarkKeepRegion(landId: LandId, worldSeed: number): { rx: number; ry: number } {
  const land = getLand(landId);
  const allCandidates = regionsForLand(landId, WORLD_RADIUS)
    .filter((profile) => !profile.settlement && profile.features.length === 0)
    .sort((a, b) => a.ry - b.ry || a.rx - b.rx);
  const nearby = allCandidates.filter((profile) => {
    const distance = Math.max(Math.abs(profile.rx - land.capital.rx), Math.abs(profile.ry - land.capital.ry));
    return distance >= 1 && distance <= 2;
  });
  const candidates = nearby.length > 0 ? nearby : allCandidates;
  if (candidates.length === 0) return { ...land.anchor };
  const index = (hashCoords(worldSeed ^ 0x4b454550, land.anchor.rx, land.anchor.ry) >>> 0) % candidates.length;
  return { rx: candidates[index].rx, ry: candidates[index].ry };
}

function placeLandKeep(world: World, worldSeed: number, rx: number, ry: number): void {
  if (!world.profile) return;
  const target = landmarkKeepRegion(world.profile.landId, worldSeed);
  if (target.rx !== rx || target.ry !== ry) return;
  const margin = 13;
  const spanX = world.w - margin * 2;
  const spanY = world.h - margin * 2;
  const start = hashCoords(worldSeed ^ 0x4b504f49, rx, ry) >>> 0;
  let chosen: { tx: number; ty: number } | undefined;
  for (let attempt = 0; attempt < 6000; attempt++) {
    const tx = margin + (((start + Math.imul(attempt, 47)) >>> 0) % spanX);
    const ty = margin + ((((start >>> 8) + Math.imul(attempt, 71)) >>> 0) % spanY);
    if (Math.hypot(tx - world.entrance.x, ty - world.entrance.y) < 22) continue;
    if (world.portals.some((portal) => Math.hypot(tx - portal.x / TILE, ty - portal.y / TILE) < 15)) continue;
    if (world.resourceNodes.some((node) => Math.hypot(tx - node.tx, ty - node.ty) < 11)) continue;
    if (world.floorVariant[ty * world.w + tx] === PATH_FLOOR_VARIANT) continue;
    let floorCount = 0;
    let innerClear = true;
    for (let oy = -6; oy <= 6; oy++) {
      for (let ox = -6; ox <= 6; ox++) {
        const tile = tileAt(world, tx + ox, ty + oy);
        if (tile === Tile.Floor) floorCount++;
        if (Math.abs(ox) <= 4 && Math.abs(oy) <= 4 && tile !== Tile.Floor) innerClear = false;
      }
    }
    if (!innerClear || floorCount < 145) continue;
    chosen = { tx, ty };
    break;
  }
  if (!chosen) return;
  const x = (chosen.tx + 0.5) * TILE;
  const y = (chosen.ty + 0.5) * TILE;
  world.props = world.props.filter((prop) => prop.resourceNodeId || Math.hypot(prop.x - x, prop.y - y) > TILE * 9);
  if (world.campAnchor && Math.hypot(world.campAnchor.tx - chosen.tx, world.campAnchor.ty - chosen.ty) < 12) world.campAnchor = undefined;
  world.props.push({
    kind: 'keep',
    x,
    y,
    seed: hashCoords(worldSeed ^ 0x4b534545, rx, ry) >>> 0,
    rotationY: (start % 4) * Math.PI * 0.5,
  });
}

// -------- surface overworld regions (docs/REGION_WORLD_PLAN.md) --------

/** int32 mixing for (seed, a, b) — region seeds and edge-gate seeds both
 * derive from the ONE global world seed through this, so every player
 * (and, later, the server re-deriving a region to validate claims —
 * roadmap Phase 4) computes identical worlds */
function hashCoords(seed: number, a: number, b: number): number {
  let hsh = seed | 0;
  hsh = Math.imul(hsh ^ Math.imul(a | 0, 0x9e3779b1), 0x85ebca6b);
  hsh = Math.imul(hsh ^ Math.imul(b | 0, 0xc2b2ae35), 0x27d4eb2f);
  hsh ^= hsh >>> 15;
  return hsh | 0;
}


export function regionKey(rx: number, ry: number): string {
  return `${rx},${ry}`;
}

export function inWorldBounds(rx: number, ry: number): boolean {
  return Math.abs(rx) <= WORLD_RADIUS && Math.abs(ry) <= WORLD_RADIUS;
}

/** Gate positions along one edge of a region — the crux of edge travel.
 * Both regions sharing an edge MUST carve openings at identical positions
 * without generating each other, so the positions hash from a canonical id
 * of the shared edge (owned by its north/west region), never from either
 * region's own seed. Edges on the world border get no gates at all — the
 * world is bounded on purpose ("big, not endless"). */
export function gatePositions(worldSeed: number, rx: number, ry: number, dir: EdgeDir): number[] {
  return canonicalOverworldGatePositions(worldSeed, rx, ry, dir);
}

// how deep a gate corridor digs in from the border — deep enough that it
// reliably intersects the cave's main connected mass (verified by test
// across many regions, not assumed)
const GATE_DEPTH = Math.floor(REGION_SIZE * 0.22);

/** carves this region's half of every gate corridor it shares with a
 * neighbor: a 3-wide floor channel from the border row inward */
function carveGates(world: World, worldSeed: number, rx: number, ry: number): { x: number; y: number }[] {
  const { w, h, tiles, floorVariant } = world;
  const mouths: { x: number; y: number }[] = [];
  for (const dir of ['n', 's', 'e', 'w'] as EdgeDir[]) {
    for (const pos of gatePositions(worldSeed, rx, ry, dir)) {
      for (let depth = 0; depth < GATE_DEPTH; depth++) {
        for (let off = -1; off <= 1; off++) {
          let tx: number;
          let ty: number;
          if (dir === 'w') { tx = depth; ty = pos + off; }
          else if (dir === 'e') { tx = w - 1 - depth; ty = pos + off; }
          else if (dir === 'n') { tx = pos + off; ty = depth; }
          else { tx = pos + off; ty = h - 1 - depth; }
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
          const idx = ty * w + tx;
          // carved AFTER town/ruins on purpose: punching through a Brick
          // wall (reads as another doorway in a crumbling structure) beats
          // a structure sealing the only way into the neighboring region
          if (tiles[idx] === Tile.Rock || tiles[idx] === Tile.Brick) {
            tiles[idx] = Tile.Floor;
            floorVariant[idx] = 4; // worn-path look, same as roads
          }
        }
      }
      if (dir === 'w') mouths.push({ x: 0, y: pos });
      else if (dir === 'e') mouths.push({ x: w - 1, y: pos });
      else if (dir === 'n') mouths.push({ x: pos, y: 0 });
      else mouths.push({ x: pos, y: h - 1 });
    }
  }
  return mouths;
}

function rebuildCanonicalResourceVisuals(world: World): void {
  if (!world.region) return;
  world.props = world.props.filter((prop) => (prop.kind !== 'tree' && prop.kind !== 'stump') || !prop.resourceNodeId);
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i] === Tile.Glowshroom || world.tiles[i] === Tile.Crystal || world.tiles[i] === Tile.IronOre) {
      world.tiles[i] = Tile.Floor;
    }
  }
  for (const node of world.resourceNodes) {
    if (!node.available) {
      // a felled tree leaves its stump behind until the node regrows
      if (node.kind === 'tree') {
        world.props.push({ kind: 'stump', x: node.x, y: node.y, seed: node.ordinal * 2654435761, resourceNodeId: node.id });
      }
      continue;
    }
    const idx = node.ty * world.w + node.tx;
    // Canonical resource positions are intentionally carved into the visual
    // map so the browser and server agree on exact coordinates. A small floor
    // patch keeps nodes reachable even when procedural cave noise put rock or
    // water at the slot.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = node.tx + dx;
        const ty = node.ty + dy;
        if (tx <= 0 || ty <= 0 || tx >= world.w - 1 || ty >= world.h - 1) continue;
        const patch = ty * world.w + tx;
        if (world.tiles[patch] !== Tile.Entrance && world.tiles[patch] !== Tile.Exit && world.tiles[patch] !== Tile.Farmland) {
          world.tiles[patch] = Tile.Floor;
        }
      }
    }
    if (node.kind === 'tree') {
      world.props.push({ kind: 'tree', x: node.x, y: node.y, seed: node.ordinal * 2654435761, resourceNodeId: node.id });
    } else {
      world.tiles[idx] = node.kind === 'iron' ? Tile.IronOre : node.kind === 'crystal' ? Tile.Crystal : Tile.Glowshroom;
    }
  }
}


/** Carve a compact deterministic combat pocket around an authoritative enemy
 * home position. The backend deliberately leashes enemies to this pocket, so
 * procedural cave noise cannot trap a shared enemy inside solid tiles. */
export function prepareAuthoritativeEnemyArea(world: World, x: number, y: number): void {
  if (!world.region) return;
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (inGreenZone(world, tx, ty)) return;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const px = tx + dx;
      const py = ty + dy;
      if (px <= 0 || py <= 0 || px >= world.w - 1 || py >= world.h - 1) continue;
      const index = py * world.w + px;
      const tile = world.tiles[index];
      if (tile !== Tile.Entrance && tile !== Tile.Exit && tile !== Tile.Farmland) world.tiles[index] = Tile.Floor;
    }
  }
  world.props = world.props.filter((prop) => Math.hypot(prop.x - x, prop.y - y) > TILE * 2.5 || prop.resourceNodeId);
}

/** Carves a small deterministic interaction pocket for a server-owned chest.
 * This is visual/collision preparation only; availability and rewards remain
 * authoritative on the backend. */
export function prepareAuthoritativeChestArea(world: World, x: number, y: number): void {
  const cx = Math.floor(x / TILE);
  const cy = Math.floor(y / TILE);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const tx = cx + ox;
      const ty = cy + oy;
      if (tx <= 0 || ty <= 0 || tx >= world.w - 1 || ty >= world.h - 1) continue;
      world.tiles[ty * world.w + tx] = Tile.Floor;
    }
  }
  world.props = world.props.filter((prop) => Math.hypot(prop.x - x, prop.y - y) > TILE * 1.6);
}


export function setRegionResourceStatuses(
  world: World,
  statuses: readonly { id: string; available: boolean; availableAt: string | null }[],
): void {
  if (!world.region) return;
  const byId = new Map(statuses.map((status) => [status.id, status]));
  for (const node of world.resourceNodes) {
    const status = byId.get(node.id);
    if (!status) continue;
    node.available = status.available;
    node.availableAt = status.availableAt;
  }
  rebuildCanonicalResourceVisuals(world);
}

export function setRegionResourceUnavailable(world: World, nodeId: string, availableAt: string): void {
  const node = world.resourceNodes.find((candidate) => candidate.id === nodeId);
  if (!node) return;
  node.available = false;
  node.availableAt = availableAt;
  rebuildCanonicalResourceVisuals(world);
}

export function resourceNodeAtTile(world: World, tx: number, ty: number): WorldResourceNode | undefined {
  return world.resourceNodes.find((node) => node.available && node.tx === tx && node.ty === ty);
}

/** One surface overworld region, fully deterministic from the global world
 * seed + its grid coordinates — all players walk the same world. The home
 * region (0,0) carries the town, farm, dungeon entrance/exit and road,
 * same as the old single-map surface; every other region is wilderness
 * (ruins, resources, props) reached on foot through edge gates. */
export function generateRegion(rx: number, ry: number, worldSeed: number): World {
  if (!inWorldBounds(rx, ry)) throw new Error(`region (${rx},${ry}) is outside the world (radius ${WORLD_RADIUS})`);
  const profile = regionProfileAt(rx, ry);
  const rand = mulberry32(hashCoords(worldSeed, rx, ry));
  const w = REGION_SIZE;
  const h = REGION_SIZE;
  const carved = carveCaveBase(w, h, profile.generation.fillChance, rand);
  const { tiles, floorVariant } = carved;

  // seal the whole border: a region's edge is passable ONLY at its gates
  // (carved back open at the end), which is also what makes "player stepped
  // onto a walkable border tile" an unambiguous travel trigger in game.ts
  for (let x = 0; x < w; x++) {
    tiles[x] = Tile.Rock;
    tiles[(h - 1) * w + x] = Tile.Rock;
  }
  for (let y = 0; y < h; y++) {
    tiles[y * w] = Tile.Rock;
    tiles[y * w + (w - 1)] = Tile.Rock;
  }
  const floorIdx = carved.floorIdx.filter((i) => tiles[i] === Tile.Floor);

  const pick = () => floorIdx[(rand() * floorIdx.length) | 0];
  const toXY = (i: number) => ({ x: i % w, y: (i / w) | 0 });
  const settlementRegion = !!profile.settlement;

  const world: World = {
    layer: 1,
    visualLayer: profile.visualLayer,
    dangerLevel: 1 + (profile.riskTier === 'frontier' ? 1 : profile.riskTier === 'fracture' ? 2 : profile.riskTier === 'lost' ? 3 : 0),
    region: { rx, ry },
    profile,
    w,
    h,
    tiles,
    floorVariant,
    props: [],
    weaponSpots: [],
    chests: [],
    farmPlots: [],
    npcSpawns: [],
    animalSpawns: [],
    portals: [],
    resourceNodes: [],
    miningNodes: [],
    entrance: { x: 0, y: 0 }, // set for real below
    exit: { x: 0, y: 0 },
  };

  if (settlementRegion) {
    const entranceI = pick();
    tiles[entranceI] = Tile.Entrance;
    world.entrance = toXY(entranceI);
    world.exit = { ...world.entrance };

    carveTown(world, rand);
    carveRuins(world, rand);
    const settlement = profile.settlement!;
    const supportsFarming = settlement.kind === 'capital' || settlement.specialty.includes('farm') || settlement.id === 'millhaven';
    if (supportsFarming) carveFarmPlots(world, floorIdx, rand);
  } else {
    carveRuins(world, rand);
  }

  // resource scatter — same recipes as the dungeon's layer-1 pass, scaled
  // to the smaller region area
  const scale = (w * h) / (MAP_W * MAP_H);
  const riskResource = profile.rules.resourceMultiplier;
  const shroomCount = Math.max(2, Math.round(12 * scale * profile.generation.shroomScale * riskResource));
  for (let i = 0; i < shroomCount; i++) {
    const c = pick();
    if (tiles[c] === Tile.Floor) tiles[c] = Tile.Glowshroom;
  }
  const crystalCount = Math.max(2, Math.round(9 * scale * profile.generation.crystalScale * riskResource));
  for (let i = 0; i < crystalCount; i++) {
    const c = pick();
    if (tiles[c] === Tile.Floor) tiles[c] = Tile.Crystal;
  }
  const ironCount = Math.max(2, Math.round(6 * scale * profile.generation.ironScale * riskResource));
  for (let i = 0; i < ironCount; i++) {
    const c = pick();
    if (tiles[c] === Tile.Floor) tiles[c] = Tile.IronOre;
  }
  for (let i = 0; i < Math.max(2, Math.round(10 * scale * profile.generation.waterScale)); i++) {
    const c = pick();
    if (tiles[c] !== Tile.Floor) continue;
    const { x, y } = toXY(c);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      if (rand() < 0.75 && tileAt(world, x + dx, y + dy) === Tile.Floor) {
        tiles[(y + dy) * w + (x + dx)] = Tile.Water;
      }
    }
  }

  // gates last so nothing carved above can ever seal one (see carveGates)
  const gateMouths = carveGates(world, worldSeed, rx, ry);
  if (!settlementRegion) {
    // wilderness spawn anchor: just inside the first gate (normal arrival
    // comes through a gate anyway; this is the die-elsewhere fallback)
    const mouth = gateMouths[0] ?? toXY(pick());
    world.entrance = {
      x: Math.min(w - 3, Math.max(2, mouth.x + (mouth.x === 0 ? 2 : mouth.x === w - 1 ? -2 : 0))),
      y: Math.min(h - 3, Math.max(2, mouth.y + (mouth.y === 0 ? 2 : mouth.y === h - 1 ? -2 : 0))),
    };
    world.exit = { ...world.entrance }; // no dungeon hatch outside the home region
  }

  placeRegionFeatures(world, profile.features, floorIdx, rand, worldSeed);
  scatterProps(world, floorIdx, rand, scale, profile.generation.treeScale);
  world.props = world.props.filter((prop) => !world.portals.some((portal) => Math.hypot(prop.x - portal.x, prop.y - portal.y) < TILE * 3));

  // Replace the old per-player resource scatter with the canonical layout
  // shared with the backend. Decorative props remain procedural, while every
  // harvestable node now has a stable server-verifiable ID and coordinate.
  world.props = world.props.filter((prop) => prop.kind !== 'tree');
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i] === Tile.Glowshroom || world.tiles[i] === Tile.Crystal || world.tiles[i] === Tile.IronOre) world.tiles[i] = Tile.Floor;
  }
  world.resourceNodes = generateRegionResourceNodes(worldSeed, rx, ry, {
    landId: profile.landId,
    riskTier: profile.riskTier,
    treeScale: profile.generation.treeScale,
    ironScale: profile.generation.ironScale,
    crystalScale: profile.generation.crystalScale,
    shroomScale: profile.generation.shroomScale,
    resourceMultiplier: profile.rules.resourceMultiplier,
  }).map((node) => ({ ...node, available: true, availableAt: null }));
  rebuildCanonicalResourceVisuals(world);

  // Server-authorized respawns use the fixed center coordinate. Keep a small
  // deterministic safe patch walkable in every region so a capital return can
  // never land inside a wall after procedural generation changes.
  const safe = Math.floor(REGION_SIZE / 2);
  for (let sy = safe - 2; sy <= safe + 2; sy++) {
    for (let sx = safe - 2; sx <= safe + 2; sx++) world.tiles[sy * world.w + sx] = Tile.Floor;
  }
  world.props = world.props.filter((prop) => Math.max(Math.abs(prop.x / TILE - safe), Math.abs(prop.y / TILE - safe)) >= 4);

  // Final collision and portal placement are projected from the same pure
  // server-owned topology module used by movement validation. Everything
  // above this point is presentation/decor generation only; it may never
  // choose a solid tile or an admission-gate coordinate.
  const canonical = generateCanonicalOverworldTopology(worldSeed, rx, ry);
  world.tiles = Uint8Array.from(canonical.tiles);
  world.floorVariant = Uint8Array.from(canonical.floorVariant);
  world.entrance = { ...canonical.entrance };
  world.exit = { ...canonical.exit };
  world.townBounds = canonical.townBounds ? { ...canonical.townBounds } : undefined;
  world.farmBounds = canonical.farmBounds ? { ...canonical.farmBounds } : undefined;
  world.houses = settlementHouses(rx, ry, worldSeed);
  world.portals = canonical.portals.map((portal) => ({
    id: portal.id,
    kind: portal.kind,
    name: portal.name,
    description: portal.description,
    x: portal.x,
    y: portal.y,
    dungeonId: portal.dungeonId,
  }));
  // The legacy random town rectangle is discarded when canonical topology is
  // projected. Remove its presentation-only debris from the real village,
  // then compose size-scaled scenery against the canonical houses and paths.
  world.props = world.props.filter((prop) => prop.resourceNodeId || !inTown(world, Math.floor(prop.x / TILE), Math.floor(prop.y / TILE)));
  decorateTownPlaza(world, worldSeed, rx, ry);
  scatterRoadsideDetails(world, worldSeed);
  placeCapitalFortifications(world, worldSeed, rx, ry);
  placePathBridges(world, worldSeed);
  placeCinderDock(world, worldSeed);
  placeLandKeep(world, worldSeed, rx, ry);
  world.props = world.props.filter((prop) => {
    const tx = Math.floor(prop.x / TILE);
    const ty = Math.floor(prop.y / TILE);
    const natural = prop.kind === 'tree' || prop.kind === 'ancientTree' || prop.kind === 'pineTree'
      || prop.kind === 'boulder' || prop.kind === 'flowerPatch' || prop.kind === 'reedCluster'
      || prop.kind === 'rock' || prop.kind === 'shrub' || prop.kind === 'root' || prop.kind === 'shrooms';
    return isWalkable(world, tx, ty)
      && (!natural || !isPathFloorVariant(world.floorVariant[ty * world.w + tx] ?? 0))
      && !world.portals.some((portal) => Math.hypot(prop.x - portal.x, prop.y - portal.y) < TILE * 3);
  });
  decorateDungeonEntrances(world, worldSeed);
  world.npcSpawns = world.npcSpawns.filter((spawn) => isWalkable(world, Math.floor(spawn.x / TILE), Math.floor(spawn.y / TILE)));
  // shared house rects (roof/doormat art) and border-gate anchors (wayposts)
  // — same canonical modules the server carves collision from
  // ambient residents pottering around inside some of the cottages —
  // pure decor, same as the plaza wanderers (server NPCs are separate)
  world.houses.forEach((house, index) => {
    if (index % 2 !== 0) return;
    world.npcSpawns.push({
      kind: 'wanderer',
      x: ((house.x0 + house.x1) / 2 + 0.5) * TILE,
      y: ((house.y0 + house.y1) / 2 + 1) * TILE,
      wanderRadius: 2 * TILE, // stays pottering around its own room
    });
  });
  world.campAnchor = canonical.campAnchor ? { ...canonical.campAnchor } : undefined;
  world.gates = [];
  const destOf = (nrx: number, nry: number) => {
    const dest = regionProfileAt(nrx, nry);
    return { destLandName: dest.landName, destRegionName: dest.regionName };
  };
  for (const gy of gatePositions(worldSeed, rx, ry, 'w')) world.gates.push({ edge: 'w', tx: 3, ty: gy, ...destOf(rx - 1, ry) });
  for (const gy of gatePositions(worldSeed, rx, ry, 'e')) world.gates.push({ edge: 'e', tx: w - 4, ty: gy, ...destOf(rx + 1, ry) });
  for (const gx of gatePositions(worldSeed, rx, ry, 'n')) world.gates.push({ edge: 'n', tx: gx, ty: 3, ...destOf(rx, ry - 1) });
  for (const gx of gatePositions(worldSeed, rx, ry, 's')) world.gates.push({ edge: 's', tx: gx, ty: h - 4, ...destOf(rx, ry + 1) });
  rebuildCanonicalResourceVisuals(world);
  return world;
}

function placeRegionFeatures(
  world: World,
  features: readonly RegionFeature[],
  floorIdx: number[],
  rand: () => number,
  worldSeed: number,
): void {
  const used: { x: number; y: number }[] = [];
  const pickSpot = (): { x: number; y: number } | undefined => {
    for (let tries = 0; tries < 120; tries++) {
      const index = floorIdx[(rand() * floorIdx.length) | 0];
      const tx = index % world.w;
      const ty = (index / world.w) | 0;
      if (!isWalkable(world, tx, ty) || inGreenZone(world, tx, ty)) continue;
      if (Math.hypot(tx - world.entrance.x, ty - world.entrance.y) < 12) continue;
      if (used.some((spot) => Math.hypot(spot.x - tx, spot.y - ty) < 12)) continue;
      used.push({ x: tx, y: ty });
      return { x: (tx + 0.5) * TILE, y: (ty + 1) * TILE - 2 };
    }
    return undefined;
  };

  for (const feature of features) {
    let kind: WorldPortalKind;
    if (feature.kind === 'dungeon') kind = 'dungeon';
    else if (feature.kind === 'black-market-route') kind = 'black-market';
    else if (feature.kind === 'red-gate') kind = 'red-gate';
    else if (feature.kind === 'black-gate') kind = 'black-gate';
    else continue;
    let spot: { x: number; y: number } | undefined;
    if (kind === 'dungeon' && feature.dungeonId) {
      const authoritative = dungeonOverworldEntrance(worldSeed, feature.dungeonId);
      const target = floorIdx.reduce<{ tx: number; ty: number; distance: number } | null>((best, index) => {
        const tx = index % world.w;
        const ty = (index / world.w) | 0;
        const distance = Math.abs(tx - authoritative.tx) + Math.abs(ty - authoritative.ty);
        return !best || distance < best.distance ? { tx, ty, distance } : best;
      }, null);
      if (!target) continue;
      let cx = authoritative.tx;
      let cy = authoritative.ty;
      const carve = (tx: number, ty: number): void => {
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const x = Math.max(1, Math.min(world.w - 2, tx + ox));
          const y = Math.max(1, Math.min(world.h - 2, ty + oy));
          world.tiles[y * world.w + x] = Tile.Floor;
        }
      };
      carve(cx, cy);
      while (cx !== target.tx) { cx += Math.sign(target.tx - cx); carve(cx, cy); }
      while (cy !== target.ty) { cy += Math.sign(target.ty - cy); carve(cx, cy); }
      spot = { x: authoritative.x, y: authoritative.y };
      used.push({ x: authoritative.tx, y: authoritative.ty });
    } else {
      spot = pickSpot();
    }
    if (!spot) continue;
    world.portals.push({
      id: feature.id,
      kind,
      name: feature.name,
      description: feature.description,
      x: spot.x,
      y: spot.y,
      dungeonId: feature.dungeonId,
    });
    if (kind === 'dungeon' && world.portals.filter((portal) => portal.kind === 'dungeon').length === 1) {
      world.exit = { x: Math.floor(spot.x / TILE), y: Math.floor(spot.y / TILE) };
    }
  }
}

function decorateDungeonEntrances(world: World, worldSeed: number): void {
  const dungeonPortals = world.portals.filter((portal) => portal.kind === 'dungeon');
  for (const portal of dungeonPortals) {
    const tx = portal.x / TILE;
    const ty = portal.y / TILE;
    const seed = hashCoords(worldSeed ^ 0x44554e47, Math.floor(tx), Math.floor(ty)) >>> 0;
    const candidates: Array<{ kind: PropKind; ox: number; oy: number; rotationY: number }> = [
      { kind: 'dungeonPillar', ox: -2.35, oy: 0.1, rotationY: 0 },
      { kind: 'dungeonPillar', ox: 2.35, oy: 0.1, rotationY: 0 },
      { kind: 'dungeonBrazier', ox: -1.45, oy: 2.05, rotationY: Math.PI },
      { kind: 'dungeonBrazier', ox: 1.45, oy: 2.05, rotationY: Math.PI },
      { kind: 'dungeonRubble', ox: -2.65, oy: 2.6, rotationY: seed / 4294967296 * Math.PI * 2 },
      { kind: 'dungeonRubble', ox: 2.75, oy: 2.45, rotationY: (seed ^ 0x9e3779b9) / 4294967296 * Math.PI * 2 },
    ];
    candidates.forEach((candidate, index) => {
      const px = tx + candidate.ox;
      const py = ty + candidate.oy;
      const tileX = Math.floor(px);
      const tileY = Math.floor(py);
      if (!isWalkable(world, tileX, tileY)) return;
      if ((world.houses ?? []).some((house) => tileX >= house.x0 - 1 && tileX <= house.x1 + 1 && tileY >= house.y0 - 1 && tileY <= house.y1 + 1)) return;
      world.props.push({
        kind: candidate.kind,
        x: px * TILE,
        y: py * TILE,
        seed: hashCoords(seed, index, candidate.kind.length) >>> 0,
        rotationY: candidate.rotationY,
      });
    });
  }
}

export function generateBlackMarketHub(sourceLandId: LandId, seed = Date.now()): World {
  const rand = mulberry32(seed ^ 0x4b4d4152);
  const w = 88;
  const h = 64;
  const tiles = new Uint8Array(w * h).fill(Tile.Rock);
  const floorVariant = new Uint8Array(w * h);
  for (let y = 4; y < h - 4; y++) {
    for (let x = 4; x < w - 4; x++) {
      const edge = x === 4 || y === 4 || x === w - 5 || y === h - 5;
      tiles[y * w + x] = edge ? Tile.Brick : Tile.Floor;
      floorVariant[y * w + x] = rand() < 0.7 ? 4 : ((rand() * 4) | 0);
    }
  }
  const doorY = (h / 2) | 0;
  tiles[doorY * w + 4] = Tile.Floor;
  tiles[doorY * w + 5] = Tile.Floor;

  const entrance = { x: 8, y: doorY };
  const world: World = {
    layer: 1,
    visualLayer: 3,
    dangerLevel: 0,
    w,
    h,
    tiles,
    floorVariant,
    props: [],
    weaponSpots: [],
    chests: [],
    farmPlots: [],
    npcSpawns: [],
    animalSpawns: [],
    portals: [],
    resourceNodes: [],
    miningNodes: [],
    townBounds: { x0: 4, y0: 4, x1: w - 5, y1: h - 5 },
    entrance,
    exit: { ...entrance },
  };

  const centerX = (w / 2) * TILE;
  const centerY = (h / 2) * TILE;
  world.npcSpawns.push({ kind: 'shopkeeper', x: centerX, y: centerY, wanderRadius: 0 });
  for (let i = 0; i < 7; i++) {
    world.npcSpawns.push({
      kind: 'wanderer',
      x: (18 + rand() * (w - 36)) * TILE,
      y: (12 + rand() * (h - 24)) * TILE,
      wanderRadius: TILE * (2 + rand() * 4),
    });
  }
  for (let i = 0; i < 22; i++) {
    const px = (10 + rand() * (w - 20)) * TILE;
    const py = (8 + rand() * (h - 16)) * TILE;
    world.props.push({
      kind: i % 5 === 0 ? 'statue' : i % 3 === 0 ? 'brokenPillar' : 'rubble',
      x: px,
      y: py,
      seed: (rand() * 1e9) | 0,
    });
  }
  world.portals.push({
    id: `market-exit-${sourceLandId}`,
    kind: 'market-exit',
    name: 'Smuggler Return',
    description: 'Return to the route used to enter the market.',
    x: (entrance.x + 0.5) * TILE,
    y: (entrance.y + 1) * TILE - 2,
  });
  return world;
}

/** enemy spawn points — on floor, away from the entrance */
export function enemySpawnPoints(world: World, count: number, seed: number): { x: number; y: number }[] {
  const rand = mulberry32(seed ^ 0xbeef);
  const pts: { x: number; y: number }[] = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 60) {
    const tx = (rand() * world.w) | 0;
    const ty = (rand() * world.h) | 0;
    if (!isWalkable(world, tx, ty)) continue;
    if (inGreenZone(world, tx, ty)) continue; // the town+farm hub is a safe zone
    const dx = tx - world.entrance.x;
    const dy = ty - world.entrance.y;
    if (dx * dx + dy * dy < 15 * 15) continue;
    pts.push({ x: tx, y: ty });
  }
  return pts;
}


/** Replaces legacy settlement production with server-issued entities and
 * clears a small safe footprint so authoritative coordinates are usable. */
export function prepareAuthoritativeSettlementArea(
  world: World,
  farmPlots: Array<{ id: string; tx: number; ty: number; crop: CropId; growMs: number; plantedAt: string | null; readyAt: string | null; ready: boolean }>,
  animals: Array<{ id: string; kind: AnimalKind; x: number; y: number; readyAt: string | null }>,
): void {
  world.farmPlots = [];
  world.animalSpawns = [];
  for (const plot of farmPlots) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const tx = plot.tx + ox;
        const ty = plot.ty + oy;
        if (tx < 1 || ty < 1 || tx >= world.w - 1 || ty >= world.h - 1) continue;
        world.tiles[ty * world.w + tx] = ox === 0 && oy === 0 ? Tile.Farmland : Tile.Floor;
      }
    }
    const now = Date.now();
    const readyAtMs = plot.readyAt ? new Date(plot.readyAt).getTime() : 0;
    const remaining = readyAtMs > 0 ? Math.max(0, readyAtMs - now) : 0;
    const stage: 0 | 1 | 2 | 3 = !plot.readyAt ? 0 : plot.ready || remaining <= 0 ? 3 : remaining > plot.growMs / 2 ? 1 : 2;
    world.farmPlots.push({
      id: plot.id,
      serverOwned: true,
      plantedAt: plot.plantedAt,
      readyAt: plot.readyAt,
      growMs: plot.growMs,
      tx: plot.tx,
      ty: plot.ty,
      crop: plot.crop,
      stage,
      timer: remaining / 1000,
    });
  }
  for (const animal of animals) {
    const tx = Math.floor(animal.x / TILE);
    const ty = Math.floor(animal.y / TILE);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const px = tx + ox;
      const py = ty + oy;
      if (px > 0 && py > 0 && px < world.w - 1 && py < world.h - 1) world.tiles[py * world.w + px] = Tile.Floor;
    }
    world.animalSpawns.push({
      id: animal.id,
      serverOwned: true,
      readyAt: animal.readyAt,
      kind: animal.kind,
      x: animal.x,
      y: animal.y,
      wanderRadius: 18,
    });
  }
}
