import { TILE, VIEW_W, VIEW_H, WALL_H, RENDER_SCALE, LAYER_NAMES, WEAPONS, ANIMALS, EnemyKind, setViewSize } from './config';
import { World, WorldPortal, Tile, tileAt, isSolid, farmPlotAt, inGreenZone } from './world';
import { isPathFloorVariant } from '../server/src/world/overworldTopology';
import { Player, Enemy, Npc, Animal, Pet, LootBag, WeaponPickup, currentWeapon } from './entities';
import { Assets, Drawable, PlayerFrameSet } from './assets';
import {
  PlayerFrames, playerFrames, bugFrames, wallwormFrames,
  shellbugFrames, spitterFrames,
  tintSprite, LAYER_TINTS, GRASS_PALETTE, bagSprite, chestClosedSprite, chestOpenSprite, stalagmiteSprite, pillarSprite, brokenPillarSprite,
  statueSprite, bonesSprite, skullSprite, rubbleSprite, rockSprite, treeSprite, deadTreeSprite, shroomClusterSprite,
  grassTuftSprite, tallGrassSprite, flowerSprite, pebbleSprite, roofSprite, doormatSprite, gatePostSprite, stumpSprite, NATURE_ART_SCALE,
  bedSprite, tableSprite, chairSprite, fireplaceSprite, shelfSprite, barrelSprite, rugSprite, HOUSE_ART_SCALE,
  tentSprite, campfireSprite,
  glowshroomSprite, crystalSprite, ironOreSprite, bigCrystalSprite, rootSprite, boneShivSprite,
  chitinBladeSprite, crystalEdgeSprite, farmSproutSprite, farmBudSprite,
  woodClubSprite, ironFalchionSprite, hideWarclubSprite, featherJavelinSprite, prismHalberdSprite,
  cowSprite, chickenSprite, petSprite,
  woodSprite, meatSprite, hideSprite, featherSprite, axeSprite, pickaxeSprite, leatherArmorSprite, ironArmorSprite, hideVestSprite,
  buildTileSet, TileSet, LAYER_PALETTES,
} from './sprites';
import { EASE } from './tween';
import { WebGL2DContext } from './rendering/core/WebGL2DContext';
import type { GpuLight } from './rendering/postprocessing/PostProcessPipeline';
import { qualityNumber } from './rendering/quality/QualityManager';
import { slashProgress, visualEffectBudget, visualSeed, waterEdgeMask, windSway, type VisualEffectBudget, type WaterNeighbor } from './rendering/effects';

const SWING_TIME = 0.16; // seconds of visible weapon swing
const ABILITY_SWING_TIME = 0.22; // abilities swing a little slower/bigger
export const HIT_FLASH_TIME = 0.15; // seconds an enemy's hit-flash overlay lasts
const SHAKE_DURATION = 0.25; // seconds a screen-shake burst decays over
const WALK_CYCLE = [1, 2, 3, 2]; // frame order over [idle, w1, w2, w3]
const MAX_PARTICLES = 140;

interface DrawItem {
  baseY: number; // world y used for depth sorting
  draw: () => void;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  /** horizontal sinusoidal drift amplitude (px/s) — falling leaves, fireflies */
  wobble?: number;
  /** phase offset for the wobble so particles don't move in lockstep */
  phase?: number;
}

/** A butterfly fluttering over the grove — pure ambience, no gameplay role. */
interface Butterfly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** flap phase; wing spread is driven by sin(flap) */
  flap: number;
  flapSpeed: number;
  /** seconds until the next gentle course change */
  turnT: number;
  color: string;
}

import { hashXY, smoothNoise, meadowAt, groundMaterialAt } from './render/terrainField';

interface HouseFurniture {
  spr: Drawable;
  /** world px of the piece's feet (draw anchor) */
  x: number;
  y: number;
  /** flat pieces (rug) lie on the floor and sort behind everything */
  flat?: boolean;
}

interface HouseInterior {
  furniture: HouseFurniture[];
  /** world px of the hearth fire — GPU light + ember source */
  fireplace?: { x: number; y: number };
  /** world px of the roof chimney mouth — smoke source */
  chimney: { x: number; y: number };
  chimneyFrac: number;
}

function waterNeighbor(world: World, tx: number, ty: number): WaterNeighbor {
  const tile = tileAt(world, tx, ty);
  if (tile === Tile.Water) return 'water';
  return isSolid(tile) ? 'solid' : 'walkable';
}

export class Renderer {
  private ctx: WebGL2DContext;
  private sprites: Record<string, Drawable> = {};
  private player!: PlayerFrames;
  private playerStatic?: Drawable; // manifest override replaces the animated frames
  private playerPack?: Record<'down' | 'up' | 'side', PlayerFrameSet>; // pack's animated default
  private npcFrames!: Record<'shopkeeper' | 'wanderer', PlayerFrames>; // tinted copies of the procedural player
  private animalWalkFrames: Partial<Record<string, Drawable[]>> = {}; // manifest '<kind>.walk' strips, sliced
  private enemyBase: Record<EnemyKind, Drawable[]> = { bug: [], shellbug: [], wallworm: [], spitter: [] };
  private enemyTinted = new Map<number, Record<EnemyKind, Drawable[]>>();
  private stalagVariants: HTMLCanvasElement[] = [];
  private rockVariants: Drawable[] = []; // manifest 'rock' image may replace the procedural canvases
  private rubbleVariants: HTMLCanvasElement[] = [];
  private rootVariants: HTMLCanvasElement[] = [];
  private treeVariants: Drawable[] = []; // may hold a single manifest override, unlike the other procedural-only variant arrays above
  private deadTreeVariants: Drawable[] = []; // manifest 'treeDead' — mixed in for natural variety
  // tree-family art (manifest and procedural alike) is authored at 4x world
  // scale — see the manifest _comment
  private tilesets = new Map<number, TileSet>();
  private grassTileSet?: TileSet; // the farm+town hub's ground — one shared tileset, not per-layer
  private groundDecor = new Map<string, { tufts: Drawable[]; tall: Drawable[]; flowers: Drawable[]; pebbles: Drawable[] }>();
  private cornerTintCache = new Map<number, [number, number, number]>();
  private roofCache = new Map<string, Drawable>();
  private doormat?: Drawable;
  private gatePosts: Drawable[] = [];
  private fenceArt: Drawable | null = null; // manifest 'fence' — cosmetic livestock-pen ring
  private campTent?: Drawable;
  private campfire?: Drawable;
  private interiorCache = new Map<string, HouseInterior>();
  private minimap: HTMLCanvasElement;
  private minimapBuf: HTMLCanvasElement;
  private minimapWorld: World | null = null; // which World the buffer was rendered from — see renderMinimap()
  private weaponIcon: HTMLCanvasElement;
  private floats: FloatText[] = [];
  private particles: Particle[] = [];
  private butterflies: Butterfly[] = [];
  private shakeT = 0;
  private shakeMag = 0;
  private frameTime = 0; // seconds; sampled once per frame for wind/particles
  private frameBudget: VisualEffectBudget = visualEffectBudget(2);
  camX = 0;
  camY = 0;
  private disposed = false;
  private readonly onResize = (): void => this.resizeToViewport();
  private readonly onFullscreenChange = (): void => {
    this.resizeToViewport();
    requestAnimationFrame(() => { if (!this.disposed) this.resizeToViewport(); });
    setTimeout(() => { if (!this.disposed) this.resizeToViewport(); }, 300);
  };

  constructor(private canvas: HTMLCanvasElement, private assets: Assets) {
    this.ctx = new WebGL2DContext(canvas);
    this.minimap = document.getElementById('minimap') as HTMLCanvasElement;
    this.minimapBuf = document.createElement('canvas');
    this.weaponIcon = document.getElementById('weapon-icon') as HTMLCanvasElement;
    this.buildSprites();
    this.resizeToViewport();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.onFullscreenChange);
  }

  /**
   * Picks an internal resolution whose aspect ratio matches the actual
   * device/window instead of a fixed 640x384 shape — a phone in landscape
   * is usually much wider than that ratio, and forcing a fixed shape left
   * big black gutters on both sides with the HUD positioned outside the
   * visible game area entirely.
   *
   * Tile count is derived from a *minimum on-screen scale* (MIN_SCALE) —
   * pixel art needs to stay big enough to read (the player character is
   * only ~15px wide in the source art), so a cramped screen shows LESS of
   * the map at a bigger per-tile size, rather than holding the tile count
   * fixed and letting individual pixels shrink. A generous screen shows
   * more of the map, but only up to MAX_TILES_TALL, so it doesn't zoom out
   * indefinitely on a huge monitor either.
   */
  private resizeToViewport(): void {
    const MIN_SCALE = 2.5; // never render a 16px tile smaller than 40 CSS px
    const MIN_TILES = 10; // floor on FOV even if that means dropping below MIN_SCALE
    const MAX_TILES_SHORT = 22; // cap on the constrained (shorter) dimension
    const MAX_TILES_LONG = 44; // cap on the other dimension

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const portrait = vw <= vh;
    const shortSide = portrait ? vw : vh;
    const longSide = portrait ? vh : vw;

    let tilesShort = Math.floor(shortSide / (TILE * MIN_SCALE));
    tilesShort = Math.max(MIN_TILES, Math.min(MAX_TILES_SHORT, tilesShort));
    let tilesLong = Math.round(tilesShort * (longSide / shortSide));
    tilesLong = Math.max(MIN_TILES, Math.min(MAX_TILES_LONG, tilesLong));

    const tilesWide = portrait ? tilesShort : tilesLong;
    const tilesTall = portrait ? tilesLong : tilesShort;
    const w = tilesWide * TILE;
    const h = tilesTall * TILE;
    if (w !== VIEW_W || h !== VIEW_H || this.canvas.width !== w * RENDER_SCALE) {
      setViewSize(w, h);
      // physical backing store is supersampled; all game code keeps thinking
      // in logical pixels (the base transform in beginFrame maps them)
      this.canvas.width = VIEW_W * RENDER_SCALE;
      this.canvas.height = VIEW_H * RENDER_SCALE;
      this.ctx.imageSmoothingEnabled = false; // resizing a canvas resets its context state
    }
    this.fitToScreen();
  }

  private fitToScreen(): void {
    // Fill the screen exactly rather than snapping to an integer multiple —
    // flooring to the nearest integer scale could waste up to half the
    // screen as a gutter (e.g. a true scale of 2.3x flooring to 2x). Since
    // VIEW_W/VIEW_H already match the device's aspect ratio (see
    // resizeToViewport), this fits edge-to-edge with only the sub-tile
    // rounding from that step left over, not a deliberate letterbox.
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    this.canvas.style.width = `${VIEW_W * scale}px`;
    this.canvas.style.height = `${VIEW_H * scale}px`;
  }

  private buildSprites(): void {
    const a = this.assets;
    this.player = playerFrames();
    this.playerStatic = a.get('player');
    if (!this.playerStatic) {
      const down = a.getPlayerFrameSet('down');
      const up = a.getPlayerFrameSet('up');
      const side = a.getPlayerFrameSet('side');
      if (down && up && side) this.playerPack = { down, up, side };
    }
    // priority: an owner-deployed manifest image (single static frame) > the pack's animated
    // default (4 frames) > procedural animated fallback
    const bugStatic = a.get('bug');
    const wormStatic = a.get('wallworm');
    const shellbugStatic = a.get('shellbug');
    const spitterStatic = a.get('spitter');
    this.enemyBase.bug = bugStatic ? [bugStatic] : (a.getMonsterFrames('bug') ?? bugFrames());
    this.enemyBase.wallworm = wormStatic ? [wormStatic] : (a.getMonsterFrames('wallworm') ?? wallwormFrames());
    this.enemyBase.shellbug = shellbugStatic ? [shellbugStatic] : (a.getMonsterFrames('shellbug') ?? shellbugFrames());
    this.enemyBase.spitter = spitterStatic ? [spitterStatic] : (a.getMonsterFrames('spitter') ?? spitterFrames());
    this.sprites.bag = a.pick('bag', bagSprite());
    this.sprites.chestClosed = a.pick('chestClosed', chestClosedSprite());
    this.sprites.chestOpen = a.pick('chestOpen', chestOpenSprite());
    this.sprites.pillar = a.pick('pillar', pillarSprite());
    this.sprites.brokenPillar = a.pick('brokenPillar', brokenPillarSprite());
    this.sprites.statue = a.pick('statue', statueSprite());
    this.sprites.bones = a.pick('bones', bonesSprite());
    this.sprites.skull = a.pick('skull', skullSprite());
    this.sprites.shrooms = a.pick('shrooms', shroomClusterSprite());
    this.sprites.glowshroom = a.pick('glowshroom', glowshroomSprite());
    this.sprites.farmSprout = a.pick('farmSprout', farmSproutSprite());
    this.sprites.farmBud = a.pick('farmBud', farmBudSprite());
    // caveberry has no dedicated art — same recoloring technique as the
    // enemy variants in sprites.ts, reusing the glowshroom's ripe silhouette
    this.sprites.caveberry = a.pick('caveberry', tintSprite(glowshroomSprite(), '#c23a5e', 0.55));
    this.sprites.cow = a.pick('cow', cowSprite());
    this.sprites.chicken = a.pick('chicken', chickenSprite());
    this.sprites.pet = a.pick('pet', petSprite());
    this.animalWalkFrames.cow = a.getWalkFrames('cow', 4);
    this.animalWalkFrames.chicken = a.getWalkFrames('chicken', 4);
    this.animalWalkFrames.pet = a.getWalkFrames('pet', 4);
    this.sprites.crystal = a.pick('crystal', crystalSprite());
    this.sprites.ironOre = a.pick('ironOre', ironOreSprite());
    this.sprites.bigCrystal = a.pick('bigCrystal', bigCrystalSprite());
    // inventory-panel-only icons (materials/tools/armor) — see game.ts renderInventoryList
    this.sprites.wood = a.pick('wood', woodSprite());
    this.sprites.meat = a.pick('meat', meatSprite());
    this.sprites.hide = a.pick('hide', hideSprite());
    this.sprites.feathers = a.pick('feathers', featherSprite());
    this.sprites['tool.axe'] = a.pick('tool.axe', axeSprite());
    this.sprites['tool.pickaxe'] = a.pick('tool.pickaxe', pickaxeSprite());
    this.sprites['armor.leather'] = a.pick('armor.leather', leatherArmorSprite());
    this.sprites['armor.iron'] = a.pick('armor.iron', ironArmorSprite());
    this.sprites['armor.hideVest'] = a.pick('armor.hideVest', hideVestSprite());
    this.sprites['weapon.bone'] = a.pick('weapon.bone', boneShivSprite());
    this.sprites['weapon.chitin'] = a.pick('weapon.chitin', chitinBladeSprite());
    this.sprites['weapon.crystal'] = a.pick('weapon.crystal', crystalEdgeSprite());
    this.sprites['weapon.wood_club'] = a.pick('weapon.wood_club', woodClubSprite());
    this.sprites['weapon.iron_falchion'] = a.pick('weapon.iron_falchion', ironFalchionSprite());
    this.sprites['weapon.hide_warclub'] = a.pick('weapon.hide_warclub', hideWarclubSprite());
    this.sprites['weapon.feather_javelin'] = a.pick('weapon.feather_javelin', featherJavelinSprite());
    this.sprites['weapon.prism_halberd'] = a.pick('weapon.prism_halberd', prismHalberdSprite());
    for (let i = 0; i < 4; i++) {
      this.rockVariants.push(rockSprite(100 + i * 17));
      this.rubbleVariants.push(rubbleSprite(300 + i * 23));
      this.rootVariants.push(rootSprite(200 + i * 31));
    }
    this.stalagVariants = [stalagmiteSprite(0), stalagmiteSprite(1)];
    this.doormat = doormatSprite(11);
    this.gatePosts = [gatePostSprite(1), gatePostSprite(2)];
    this.campTent = tentSprite(23);
    this.campfire = campfireSprite();
    // trees are the one multi-variant prop that's asset-overridable — the
    // world is now mostly open field, so custom tree images matter a lot
    // more than they would for a rock or a root. 'tree' plus optional
    // 'tree.2'/'tree.3' manifest entries become the variant pool. Manifest
    // art is authored at 1 image px = 1 world px (per the manifest
    // contract), unlike the 4x-supersampled procedural art, so the art
    // scale divisor drops to 1 whenever manifest trees are in play.
    const treeStatics = ['tree', 'tree.2', 'tree.3', 'tree.4', 'tree.5']
      .map((k) => a.get(k))
      .filter((img): img is HTMLImageElement => !!img);
    this.treeVariants = treeStatics.length > 0 ? treeStatics : [400, 441, 482, 523].map((s) => treeSprite(s));
    const deadStatic = a.get('treeDead');
    this.deadTreeVariants = deadStatic ? [deadStatic] : [611, 653].map((s) => deadTreeSprite(s));
    this.sprites.stump = a.pick('treeStump', stumpSprite(77));
    // boulder pile art from the manifest replaces all procedural rock variants
    const rockStatic = a.get('rock');
    if (rockStatic) this.rockVariants = [rockStatic];
    // fence art (manifest-only, no procedural fallback) rings livestock pens
    this.fenceArt = a.get('fence') ?? null;

    // NPCs reuse the player rig, tinted, so they read as townsfolk rather
    // than clones. When the animated pack rig exists it becomes the base
    // (frame order [idle, w0, w1, w2] to match WALK_CYCLE indexing).
    const rig: Record<'down' | 'up' | 'side', (HTMLCanvasElement | HTMLImageElement)[]> = this.playerPack
      ? {
          down: [this.playerPack.down.idle, ...this.playerPack.down.walk.slice(0, 3)],
          up: [this.playerPack.up.idle, ...this.playerPack.up.walk.slice(0, 3)],
          side: [this.playerPack.side.idle, ...this.playerPack.side.walk.slice(0, 3)],
        }
      : this.player;
    const tintFrames = (color: string, alpha: number): PlayerFrames => ({
      down: rig.down.map((f) => tintSprite(f, color, alpha)),
      up: rig.up.map((f) => tintSprite(f, color, alpha)),
      side: rig.side.map((f) => tintSprite(f, color, alpha)),
    });
    this.npcFrames = {
      shopkeeper: tintFrames('#8a6a2e', 0.45),
      wanderer: tintFrames('#3d6b6b', 0.4),
    };
  }

  private tilesetFor(layer: number): TileSet {
    let ts = this.tilesets.get(layer);
    if (!ts) {
      ts = buildTileSet(TILE, WALL_H, LAYER_PALETTES[layer - 1], layer * 1337);
      // wall look is asset-overridable — one custom texture replaces both
      // top variants (or both the clean and crumbled brick face) so a
      // player-supplied wall reads consistently across a room
      const wallTop = this.assets.get('wallTop');
      const wallFace = this.assets.get('wallFace');
      const brickTop = this.assets.get('brickTop');
      const brickFace = this.assets.get('brickFace');
      const floor = this.assets.get('floor');
      const farmland = this.assets.get('farmland');
      if (wallTop) ts.wallTops = [wallTop, wallTop];
      if (wallFace) ts.wallFace = wallFace;
      if (brickTop) ts.brickTop = brickTop;
      if (brickFace) {
        ts.brickFace = brickFace;
        ts.brickFaceCrumbled = brickFace;
      }
      // one floor texture replaces the procedural grass variants — but never
      // the packed-dirt road variant, or custom ground art would silently
      // erase every road in the world
      if (floor) ts.floors = ts.floors.map((original, index) => (isPathFloorVariant(index) ? original : floor));
      if (farmland) ts.farmland = farmland;
      this.tilesets.set(layer, ts);
    }
    return ts;
  }

  /**
   * Deterministic furnishing for one house: hearth against a wall, bed in a
   * corner, table + chairs on a rug, shelf and barrels. Cosmetic only — the
   * canonical tile map is untouched, furniture never blocks movement.
   */
  private interiorFor(house: { id: string; ordinal: number; x0: number; y0: number; x1: number; y1: number; doorSide: string }): HouseInterior {
    const cached = this.interiorCache.get(house.id);
    if (cached) return cached;
    const h = (n: number) => hashXY(house.ordinal * 31 + n, house.x0 + house.y0 * 7 + n * 13);
    const ix0 = house.x0 + 1; // interior tile bounds
    const iy0 = house.y0 + 1;
    const ix1 = house.x1 - 1;
    const iy1 = house.y1 - 1;
    const wide = ix1 - ix0 >= 8; // the long hall gets extra pieces
    const furniture: HouseFurniture[] = [];

    // hearth against the north interior wall, shifted away from a north door
    const fireTx = house.doorSide === 'n' ? ix1 - 1 : ix0 + 1 + Math.floor(h(1) * 2);
    const fireX = (fireTx + 0.5) * TILE;
    const fireY = iy0 * TILE + 14;
    furniture.push({ spr: fireplaceSprite(), x: fireX, y: fireY });
    const fireplace = { x: fireX, y: fireY - 6 };

    // bed against the wall opposite the door so it never crowds the entry.
    // NOTE: interior row iy1 is visually hidden behind the south wall's top
    // face in the 3/4 view, so furniture keeps its feet above iy1.
    const bedTx = house.doorSide === 'e' ? ix0 : house.doorSide === 'w' ? ix1 : fireTx <= ix0 + 2 ? ix1 : ix0;
    furniture.push({ spr: bedSprite(house.ordinal * 51 + 7), x: (bedTx + 0.5) * TILE, y: iy1 * TILE - 2 });
    if (wide) furniture.push({ spr: bedSprite(house.ordinal * 51 + 8), x: (bedTx + (bedTx === ix0 ? 1.6 : -1.6)) * TILE, y: iy1 * TILE - 2 });

    // rug + table + chairs at the room's heart
    const midX = ((ix0 + ix1) / 2 + 0.5) * TILE;
    const midY = ((iy0 + iy1) / 2 + 0.9) * TILE;
    furniture.push({ spr: rugSprite(house.ordinal * 17 + 3), x: midX, y: midY + 8, flat: true });
    furniture.push({ spr: tableSprite(), x: midX, y: midY + 4 });
    furniture.push({ spr: chairSprite(false), x: midX - 15, y: midY + 3 });
    furniture.push({ spr: chairSprite(true), x: midX + 15, y: midY + 3 });

    // shelf on the north wall away from the hearth, barrels in a south corner
    const shelfTx = fireTx >= ix1 - 1 ? ix0 + 1 : ix1 - 1;
    furniture.push({ spr: shelfSprite(house.ordinal * 29 + 5), x: (shelfTx + 0.5) * TILE, y: iy0 * TILE + 12 });
    const barrelTx = bedTx === ix0 ? ix1 : ix0;
    furniture.push({ spr: barrelSprite(), x: (barrelTx + 0.4) * TILE, y: (iy1 - 0.1) * TILE });
    if (h(4) < 0.6 || wide) furniture.push({ spr: barrelSprite(), x: (barrelTx + (barrelTx === ix0 ? 1.1 : -0.3)) * TILE, y: (iy1 - 0.05) * TILE });

    const chimneyFrac = 0.25 + h(9) * 0.55;
    const roofW = (house.x1 - house.x0 + 1) * TILE + 8;
    const interior: HouseInterior = {
      furniture,
      fireplace,
      chimney: {
        x: house.x0 * TILE - 4 + chimneyFrac * roofW,
        y: house.y0 * TILE - WALL_H,
      },
      chimneyFrac,
    };
    this.interiorCache.set(house.id, interior);
    return interior;
  }

  /**
   * Smooth tonal tint at a tile corner. Adjacent tiles share corner values,
   * and the GPU interpolates between them, so brightness/hue flows across
   * tile boundaries instead of stopping at them — the ground stops reading
   * as a grid of squares.
   */
  private cornerTint(cx: number, cy: number): [number, number, number] {
    const key = cx * 8192 + cy;
    const cached = this.cornerTintCache.get(key);
    if (cached) return cached;
    const lumNoise = smoothNoise(cx * 0.055 + 31.7, cy * 0.055 + 17.3);
    const warmNoise = smoothNoise(cx * 0.021 + 91.2, cy * 0.021 + 45.8);
    const lum = 0.9 + lumNoise * 0.18;
    const tint: [number, number, number] = [
      lum * (0.97 + warmNoise * 0.06),
      lum,
      lum * (1.03 - warmNoise * 0.06),
    ];
    if (this.cornerTintCache.size > 16000) this.cornerTintCache.clear();
    this.cornerTintCache.set(key, tint);
    return tint;
  }

  private tileCornerTints(tx: number, ty: number): [[number, number, number], [number, number, number], [number, number, number], [number, number, number]] {
    return [
      this.cornerTint(tx, ty),
      this.cornerTint(tx + 1, ty),
      this.cornerTint(tx + 1, ty + 1),
      this.cornerTint(tx, ty + 1),
    ];
  }

  /** per-palette grass tufts/flowers/pebbles used to detail plain ground tiles */
  private decorFor(base: string): { tufts: Drawable[]; tall: Drawable[]; flowers: Drawable[]; pebbles: Drawable[] } {
    let decor = this.groundDecor.get(base);
    if (!decor) {
      decor = {
        tufts: [0, 1, 2, 3, 4, 5].map((i) => grassTuftSprite(base, 900 + i * 37)),
        tall: [0, 1, 2, 3].map((i) => tallGrassSprite(base, 1300 + i * 41)),
        flowers: [0, 1, 2, 3].map((i) => flowerSprite(700 + i * 53)),
        pebbles: [0, 1, 2].map((i) => pebbleSprite(base, 500 + i * 71)),
      };
      this.groundDecor.set(base, decor);
    }
    return decor;
  }

  /** the farm+town hub's green ground — one shared tileset (not per-layer).
   * Deliberately not routed through the cave tileset's floor/wall custom-asset
   * overrides: those are meant for the underground dirt/rock look, and applying
   * them here could silently undo the whole point of a distinct grass hub. */
  private grassTiles(): TileSet {
    if (!this.grassTileSet) this.grassTileSet = buildTileSet(TILE, WALL_H, GRASS_PALETTE, 4242);
    return this.grassTileSet;
  }

  private enemyFramesFor(layer: number): Record<EnemyKind, Drawable[]> {
    let e = this.enemyTinted.get(layer);
    if (!e) {
      const tint = LAYER_TINTS[layer - 1];
      e = tint
        ? {
            bug: this.enemyBase.bug.map((f) => tintSprite(f, tint, 0.28)),
            shellbug: this.enemyBase.shellbug.map((f) => tintSprite(f, tint, 0.28)),
            wallworm: this.enemyBase.wallworm.map((f) => tintSprite(f, tint, 0.28)),
            spitter: this.enemyBase.spitter.map((f) => tintSprite(f, tint, 0.28)),
          }
        : { ...this.enemyBase };
      this.enemyTinted.set(layer, e);
    }
    return e;
  }

  // ---- game feel hooks (called from game logic) ----

  addFloat(x: number, y: number, text: string, color = '#e8e0d0'): void {
    this.floats.push({ x, y, text, color, life: 0.9 });
  }

  addSparks(x: number, y: number, n: number, color = '#ffd88a'): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 50;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.5,
        color,
        size: 1,
      });
    }
  }

  shake(mag: number): void {
    this.shakeT = SHAKE_DURATION;
    this.shakeMag = mag;
  }

  /** looks up an already-built sprite by key — used by the inventory panel
   * (game.ts renderInventoryList) to draw icons that match whatever custom
   * assets are currently active, instead of duplicating sprite lookup logic. */
  getSprite(key: string): Drawable | undefined {
    return this.sprites[key];
  }

  render(
    world: World, player: Player, enemies: Enemy[], npcs: Npc[], animals: Animal[], pet: Pet | null,
    bags: LootBag[], pickups: WeaponPickup[], flashRed: number, dt: number,
    otherPlayers: { player: Player; username: string }[] = [], // Red Zone only — see src/redZoneGame.ts
  ): void {
    const ctx = this.ctx;
    const renderLayer = world.visualLayer ?? world.layer;
    const ts = this.tilesetFor(renderLayer);
    const eframes = this.enemyFramesFor(renderLayer);

    this.shakeT = Math.max(0, this.shakeT - dt);
    const shakeCurve = this.shakeT > 0 ? EASE.outCubic(this.shakeT / SHAKE_DURATION) : 0;
    const shx = shakeCurve > 0 ? (Math.random() - 0.5) * 2 * this.shakeMag * shakeCurve : 0;
    const shy = shakeCurve > 0 ? (Math.random() - 0.5) * 2 * this.shakeMag * shakeCurve : 0;
    this.camX = Math.round(player.x - VIEW_W / 2 + shx);
    this.camY = Math.round(player.y - VIEW_H / 2 + shy);
    ctx.beginFrame(VIEW_W * RENDER_SCALE, VIEW_H * RENDER_SCALE, RENDER_SCALE);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const tx0 = Math.floor(this.camX / TILE) - 1;
    const ty0 = Math.floor(this.camY / TILE) - 1;
    const tx1 = tx0 + Math.ceil(VIEW_W / TILE) + 3;
    const ty1 = ty0 + Math.ceil(VIEW_H / TILE) + 3;
    const graphicsQuality = qualityNumber();
    this.frameTime = performance.now() / 1000;
    this.frameBudget = visualEffectBudget(graphicsQuality);

    // ---- pass 1: ground with edge AO + water foam ----
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = tileAt(world, tx, ty);
        if (isSolid(t)) continue;
        const px = tx * TILE - this.camX;
        const py = ty * TILE - this.camY;
        const inBounds = tx >= 0 && ty >= 0 && tx < world.w && ty < world.h;
        const variant = inBounds ? world.floorVariant[ty * world.w + tx] : 0;
        // the farm+town hub always reads as the same tended green, distinct
        // from each layer's own (now also outdoor) biome tint — see grassTiles()
        const green = inGreenZone(world, tx, ty);
        const floorTs = green ? this.grassTiles() : ts;
        switch (t) {
          case Tile.Water: {
            const edgeMask = waterEdgeMask({
              top: waterNeighbor(world, tx, ty - 1),
              bottom: waterNeighbor(world, tx, ty + 1),
              left: waterNeighbor(world, tx - 1, ty),
              right: waterNeighbor(world, tx + 1, ty),
            });
            ctx.drawWaterTile(px, py, TILE, TILE, visualSeed(tx, ty), edgeMask);
            break;
          }
          case Tile.Entrance: ctx.drawImage(ts.entrance, px, py, TILE, TILE); break;
          case Tile.Exit: ctx.drawImage(ts.exit, px, py, TILE, TILE); break;
          case Tile.Farmland: ctx.drawImage(floorTs.farmland, px, py, TILE, TILE); break;
          default: {
            // tiles are authored at TILE_ART_SCALE× and drawn at logical
            // size, with smooth corner tints interpolated across neighbors
            const isPath = isPathFloorVariant(variant);
            // the village/farm green is tended ground — no wild bare patches
            const material = t === Tile.Floor && !isPath && !green ? groundMaterialAt(tx, ty) : 0;
            const tints = this.tileCornerTints(tx, ty);
            if (material !== 0) {
              // organic bare-ground patch with ragged grass creeping in
              // from every grass neighbor — no square boundaries
              const dirtVariant = hashXY(tx * 9 + 2, ty * 5 + 3) < 0.5 ? 0 : 1;
              // lay grass down first, then draw the bare patch slightly
              // translucent on top so it reads as worn, thinning turf rather
              // than a hard mud cutout stamped over the field
              ctx.drawImageTintedCorners(floorTs.floors[0], px, py, TILE, TILE, tints);
              ctx.globalAlpha = material === 2 ? 0.82 : 0.7;
              ctx.drawImageTintedCorners(floorTs.dirt[(material - 1) * 2 + dirtVariant], px, py, TILE, TILE, tints);
              ctx.globalAlpha = 1;
              const grassAt = (nx: number, ny: number): boolean => {
                if (tileAt(world, nx, ny) !== Tile.Floor) return false;
                const nInBounds = nx >= 0 && ny >= 0 && nx < world.w && ny < world.h;
                if (nInBounds && isPathFloorVariant(world.floorVariant[ny * world.w + nx])) return false;
                return groundMaterialAt(nx, ny) === 0;
              };
              if (grassAt(tx, ty - 1)) ctx.drawImage(floorTs.fringes[0], px, py, TILE, TILE);
              if (grassAt(tx, ty + 1)) ctx.drawImage(floorTs.fringes[1], px, py, TILE, TILE);
              if (grassAt(tx + 1, ty)) ctx.drawImage(floorTs.fringes[2], px, py, TILE, TILE);
              if (grassAt(tx - 1, ty)) ctx.drawImage(floorTs.fringes[3], px, py, TILE, TILE);
              // bare ground only carries the odd pebble
              const ph = hashXY(tx * 11 + 6, ty * 13 + 9);
              if (ph < 0.16) {
                const paletteBase = green ? GRASS_PALETTE.floor : (LAYER_PALETTES[renderLayer - 1] ?? LAYER_PALETTES[0]).floor;
                const decor = this.decorFor(paletteBase);
                const spr = decor.pebbles[Math.floor(ph * 19) % decor.pebbles.length];
                ctx.drawImage(spr, px + 3 + ph * 30, py + 4 + ((ph * 47) % 1) * 8, spr.width / NATURE_ART_SCALE, spr.height / NATURE_ART_SCALE);
              }
              break;
            }
            ctx.drawImageTintedCorners(floorTs.floors[variant] ?? floorTs.floors[0], px, py, TILE, TILE, tints);
            // ground detail: wind-blown tufts, wildflowers and pebbles on
            // plain field tiles (never on roads) — deterministic per tile.
            // A low-frequency hash carves out lush tall-grass meadows.
            if (t === Tile.Floor && !isPathFloorVariant(variant)) {
              const paletteBase = green ? GRASS_PALETTE.floor : (LAYER_PALETTES[renderLayer - 1] ?? LAYER_PALETTES[0]).floor;
              const decor = this.decorFor(paletteBase);
              const oh = hashXY(ty * 13 + 4, tx * 17 + 2);
              const ox = 2 + Math.floor(oh * 7);
              const oy = 3 + Math.floor(((oh * 7) % 1) * 7);
              // continuous simplex field — meadow borders are organic
              // curves, never square blocks
              const meadow = meadowAt(tx, ty);
              const sway = windSway(this.frameTime, tx * TILE, ty * TILE) * this.frameBudget.windStrength;
              const draw = (spr: Drawable, dx: number, dy: number, swayMul: number) => {
                const w = spr.width / NATURE_ART_SCALE;
                const h2 = spr.height / NATURE_ART_SCALE;
                if (swayMul > 0) ctx.drawImageSwaying(spr, dx, dy, sway * swayMul, w, h2);
                else ctx.drawImage(spr, dx, dy, w, h2);
              };
              if (meadow) {
                // dense waving meadow: every tile gets tall grass, plus a
                // second clump and scattered flowers for depth
                draw(decor.tall[Math.floor(oh * decor.tall.length) % decor.tall.length], px + 1, py + 3, 1.4);
                if (oh < 0.55) {
                  draw(decor.tufts[Math.floor(oh * 11) % decor.tufts.length], px + 6, py + 8, 0.9);
                }
                if (oh > 0.82) {
                  draw(decor.flowers[Math.floor(oh * 17) % decor.flowers.length], px + ox, py + 2, 0.6);
                }
              } else {
                const dh = hashXY(tx * 5 + 1, ty * 3 + 7);
                if (dh < 0.58) {
                  if (dh < 0.34) {
                    draw(decor.tufts[Math.floor(oh * decor.tufts.length) % decor.tufts.length], px + ox, py + oy, 0.9);
                  } else if (dh < 0.47) {
                    draw(decor.flowers[Math.floor(oh * decor.flowers.length) % decor.flowers.length], px + ox, py + oy, 0.6);
                  } else {
                    draw(decor.pebbles[Math.floor(oh * decor.pebbles.length) % decor.pebbles.length], px + ox, py + oy, 0);
                  }
                }
              }
            }
          }
        }
        // ambient occlusion where floor meets walls — grounds the 3/4 look
        if (isSolid(tileAt(world, tx, ty - 1))) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(px, py, TILE, 3);
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fillRect(px, py + 3, TILE, 2);
        }
        if (isSolid(tileAt(world, tx - 1, ty))) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(px, py, 2, TILE);
        }
        if (isSolid(tileAt(world, tx + 1, ty))) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(px + TILE - 2, py, 2, TILE);
        }
      }
    }

    // ---- pass 2: depth-sorted walls, props, entities ----
    const items: DrawItem[] = [];

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = tileAt(world, tx, ty);
        if (!isSolid(t)) continue;
        const brick = t === Tile.Brick;
        const px = tx * TILE - this.camX;
        const py = ty * TILE - this.camY;
        const southOpen = !isSolid(tileAt(world, tx, ty + 1));
        const h = hashXY(tx, ty);
        // a rock wall right at the hub's edge reads as a hedge/treeline instead
        // of cave stone — keeps the green pocket visually self-contained
        const wallTs = inGreenZone(world, tx, ty) ? this.grassTiles() : ts;
        items.push({
          baseY: (ty + 1) * TILE,
          draw: () => {
            ctx.drawImage(brick ? wallTs.brickTop : wallTs.wallTops[h < 0.5 ? 0 : 1], px, py - WALL_H, TILE, TILE);
            if (southOpen) {
              const face = brick ? (h < 0.3 ? wallTs.brickFaceCrumbled : wallTs.brickFace) : wallTs.wallFace;
              ctx.drawImage(face, px, py + TILE - WALL_H, TILE, WALL_H);
            }
          },
        });
      }
    }

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = tileAt(world, tx, ty);
        if (t !== Tile.Glowshroom && t !== Tile.Crystal && t !== Tile.IronOre) continue;
        const spr = this.sprites[t === Tile.Glowshroom ? 'glowshroom' : t === Tile.Crystal ? 'crystal' : 'ironOre'];
        const bx = (tx + 0.5) * TILE;
        const by = (ty + 1) * TILE - 2;
        // shrooms are soft and catch the wind; crystal/ore stay rigid
        const sway = t === Tile.Glowshroom ? 1.1 : 0;
        items.push({ baseY: by, draw: () => this.drawAtFeet(spr, bx, by, false, sway) });
      }
    }

    for (const plot of world.farmPlots) {
      if (plot.stage === 0) continue;
      if (plot.tx < tx0 || plot.tx > tx1 || plot.ty < ty0 || plot.ty > ty1) continue;
      const ripeKey = plot.crop === 'caveberry' ? 'caveberry' : 'glowshroom';
      const spr = this.sprites[plot.stage === 1 ? 'farmSprout' : plot.stage === 2 ? 'farmBud' : ripeKey];
      const bx = (plot.tx + 0.5) * TILE;
      const by = (plot.ty + 1) * TILE - 2;
      items.push({ baseY: by, draw: () => this.drawAtFeet(spr, bx, by, false, 0.9) });
    }

    for (const node of world.miningNodes) {
      if (node.x < this.camX - 40 || node.x > this.camX + VIEW_W + 40 || node.y < this.camY - 56 || node.y > this.camY + VIEW_H + 56) continue;
      const spr = node.kind === 'iron_vein' ? this.sprites.ironOre : node.kind === 'crystal_geode' ? this.sprites.crystal : this.sprites.bigCrystal;
      items.push({
        baseY: node.y,
        draw: () => {
          const oldAlpha = ctx.globalAlpha;
          ctx.globalAlpha = node.available ? 1 : 0.28;
          this.drawAtFeet(spr, node.x, node.y, true);
          ctx.globalAlpha = oldAlpha;
          if (node.available && node.integrity < node.maxIntegrity) {
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#b7c4d8';
            ctx.fillText(`${node.integrity}/${node.maxIntegrity}`, node.x - this.camX, node.y - 20 - this.camY);
          }
        },
      });
    }

    for (const hazard of world.dungeonHazards ?? []) {
      if (hazard.x < this.camX - 60 || hazard.x > this.camX + VIEW_W + 60 || hazard.y < this.camY - 60 || hazard.y > this.camY + VIEW_H + 60) continue;
      items.push({
        baseY: hazard.y - 2,
        draw: () => {
          const sx = hazard.x - this.camX;
          const sy = hazard.y - this.camY;
          if (hazard.kind === 'water') {
            ctx.drawWaterTile(sx - hazard.radius, sy - hazard.radius * 0.55, hazard.radius * 2, hazard.radius * 1.1, visualSeed(hazard.x, hazard.y), 0, '#102536', '#2a6178');
            return;
          }
          const color = hazard.kind === 'ember' ? '#ff7a3d'
            : hazard.kind === 'frost' ? '#9edcff'
              : hazard.kind === 'crystal' ? '#b66cff'
                : hazard.kind === 'thorn' ? '#7baa45'
                  : '#c85b55';
          const pulse = 0.48 + Math.sin(performance.now() / 260 + visualSeed(hazard.x, hazard.y) * 8) * 0.16;
          ctx.drawGlowParticle(sx, sy - 3, hazard.radius, color, pulse, visualSeed(hazard.y, hazard.x), 0.45);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.52;
          ctx.beginPath();
          ctx.ellipse(sx, sy, Math.max(3, hazard.radius * 0.45), Math.max(2, hazard.radius * 0.18), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      });
    }

    for (const p of world.props) {
      if (p.x < this.camX - 40 || p.x > this.camX + VIEW_W + 40 || p.y < this.camY - 56 || p.y > this.camY + VIEW_H + 56) continue;
      // roughly one tree in six is a dead one when the art pack provides it
      const treeLike = p.kind === 'tree' || p.kind === 'ancientTree' || p.kind === 'pineTree';
      const rockLike = p.kind === 'rock' || p.kind === 'boulder' || p.kind === 'cliffOutcrop';
      const deadTree = treeLike && this.deadTreeVariants.length > 0 && hashXY(p.seed, 17) < 0.17;
      const spr =
        rockLike ? this.rockVariants[p.seed % this.rockVariants.length]
        : p.kind === 'rubble' ? this.rubbleVariants[p.seed % this.rubbleVariants.length]
        : p.kind === 'root' ? this.rootVariants[p.seed % this.rootVariants.length]
        : treeLike ? (deadTree ? this.deadTreeVariants[p.seed % this.deadTreeVariants.length] : this.treeVariants[p.seed % this.treeVariants.length])
        : p.kind === 'flowerPatch' || p.kind === 'reedCluster' ? this.sprites.shrub
        : p.kind === 'stalagmite' ? this.stalagVariants[p.seed % this.stalagVariants.length]
        : this.sprites[p.kind];
      const flat = p.kind === 'bones' || p.kind === 'root' || p.kind === 'rubble' || p.kind === 'skull' || p.kind === 'flowerPatch';
      // living trees lean, dead trees only creak, reeds and shroom clusters rustle
      const sway = treeLike ? (deadTree ? 1.2 : 3.6) : p.kind === 'reedCluster' ? 2.1 : p.kind === 'shrooms' ? 1.2 : 0;
      // manifest images are authored at 1 image px = 1 world px; procedural
      // tree/stump canvases are supersampled 4x — detect per sprite so any
      // mix of manifest and procedural art draws at the right size
      const artScale = (treeLike || p.kind === 'stump') && !(spr instanceof HTMLImageElement) ? NATURE_ART_SCALE : 1;
      items.push({ baseY: p.y, draw: () => this.drawAtFeet(spr, p.x, p.y, !flat, sway, artScale) });
    }

    for (const chest of world.chests) {
      if (chest.x < this.camX - 40 || chest.x > this.camX + VIEW_W + 40 || chest.y < this.camY - 56 || chest.y > this.camY + VIEW_H + 56) continue;
      const spr = this.sprites[chest.opened ? 'chestOpen' : 'chestClosed'];
      items.push({ baseY: chest.y, draw: () => this.drawAtFeet(spr, chest.x, chest.y, true) });
    }

    // cosmetic fence ring around livestock pens (manifest 'fence' art only).
    // Full segments tile along the top and bottom edges; the side edges
    // repeat just the post (cropped from the segment's left end) so they
    // read as a post line instead of a sideways ladder.
    if (this.fenceArt && world.pens) {
      const fence = this.fenceArt;
      const segW = fence.width;
      const segH = fence.height;
      const postW = Math.max(4, Math.round(segW * 0.24));
      for (const pen of world.pens) {
        const left = pen.x0 * TILE;
        const right = (pen.x1 + 1) * TILE;
        const spanW = right - left;
        const count = Math.max(1, Math.round(spanW / segW));
        const step = spanW / count;
        for (const edgeY of [pen.y0 * TILE + 4, (pen.y1 + 1) * TILE]) {
          if (edgeY < this.camY - 60 || edgeY > this.camY + VIEW_H + 60) continue;
          for (let i = 0; i < count; i++) {
            const fx = left + step * (i + 0.5);
            if (fx < this.camX - 60 || fx > this.camX + VIEW_W + 60) continue;
            items.push({ baseY: edgeY, draw: () => this.drawAtFeet(fence, fx, edgeY) });
          }
        }
        for (const edgeX of [left + 2, right - 2]) {
          if (edgeX < this.camX - 60 || edgeX > this.camX + VIEW_W + 60) continue;
          for (let py = pen.y0 * TILE + 12; py < (pen.y1 + 1) * TILE; py += 10) {
            if (py < this.camY - 60 || py > this.camY + VIEW_H + 60) continue;
            const fy = py;
            items.push({
              baseY: fy - 0.5,
              draw: () => {
                const x = Math.round(edgeX - postW / 2 - this.camX);
                const y = Math.round(fy - segH - this.camY);
                this.ctx.drawImage(fence, 0, 0, postW, segH, x, y, postW, segH);
              },
            });
          }
        }
      }
    }

    for (const portal of world.portals) {
      if (portal.x < this.camX - 50 || portal.x > this.camX + VIEW_W + 50 || portal.y < this.camY - 70 || portal.y > this.camY + VIEW_H + 70) continue;
      items.push({ baseY: portal.y, draw: () => this.drawPortal(portal) });
    }

    // settlement houses: gabled roofs + doorstep mats over the shared
    // canonical house rects (walls/doors are already in the tile map)
    for (const house of world.houses ?? []) {
      const X0 = house.x0 * TILE;
      const Y0 = house.y0 * TILE;
      const X1 = (house.x1 + 1) * TILE;
      const Y1 = (house.y1 + 1) * TILE;
      if (X1 < this.camX - 48 || X0 > this.camX + VIEW_W + 48 || Y1 < this.camY - 64 || Y0 > this.camY + VIEW_H + 64) continue;
      const wTiles = house.x1 - house.x0 + 1;
      const hTiles = house.y1 - house.y0 + 1;
      const interior = this.interiorFor(house);
      const key = `${wTiles}x${hTiles}:${house.ordinal}`;
      let roof = this.roofCache.get(key);
      if (!roof) {
        roof = roofSprite(wTiles, hTiles, TILE, 4111 + house.ordinal * 977, interior.chimneyFrac);
        this.roofCache.set(key, roof);
      }

      // furnishings — sorted into the same depth pass as everything else;
      // the rug lies flat under the rest
      for (const piece of interior.furniture) {
        items.push({
          baseY: piece.flat ? house.y0 * TILE + 1 : piece.y,
          draw: () => {
            const spr = piece.spr;
            const w = spr.width / HOUSE_ART_SCALE;
            const h2 = spr.height / HOUSE_ART_SCALE;
            ctx.drawImage(spr, Math.round(piece.x - w / 2 - this.camX), Math.round(piece.y - h2 - this.camY), w, h2);
          },
        });
      }
      const step = house.doorSide === 'w' ? [-1, 0] : house.doorSide === 'e' ? [1, 0] : house.doorSide === 'n' ? [0, -1] : [0, 1];
      const matTx = house.doorTx + step[0];
      const matTy = house.doorTy + step[1];
      items.push({
        baseY: matTy * TILE + 1,
        draw: () => {
          if (this.doormat) {
            ctx.drawImage(
              this.doormat,
              matTx * TILE + 2 - this.camX,
              matTy * TILE + 5 - this.camY,
              this.doormat.width / HOUSE_ART_SCALE,
              this.doormat.height / HOUSE_ART_SCALE,
            );
          }
        },
      });
      const roofSprCached = roof;
      items.push({
        baseY: Y1 + 0.5,
        draw: () => {
          const inside = player.x >= X0 && player.x < X1 && player.y >= Y0 && player.y < Y1;
          const oldAlpha = ctx.globalAlpha;
          // fade the roof away when the player steps inside so the interior shows
          ctx.globalAlpha = inside ? 0.22 : 1;
          ctx.drawImage(
            roofSprCached,
            Math.round(X0 - 4 - this.camX),
            Math.round(Y0 - WALL_H - 2 - this.camY),
            roofSprCached.width / HOUSE_ART_SCALE,
            roofSprCached.height / HOUSE_ART_SCALE,
          );
          ctx.globalAlpha = oldAlpha;
        },
      });
    }

    // wilderness rest camp: a tent + campfire at the region's cleared camp
    // anchor (present only where there's no settlement or authored feature)
    if (world.campAnchor && this.campTent && this.campfire) {
      const cx = (world.campAnchor.tx + 0.5) * TILE;
      const cy = (world.campAnchor.ty + 1) * TILE;
      if (cx >= this.camX - 60 && cx <= this.camX + VIEW_W + 60 && cy >= this.camY - 70 && cy <= this.camY + VIEW_H + 70) {
        const tentX = cx - 12;
        const tentY = cy - 4;
        const fireX = cx + 10;
        const fireY = cy + 2;
        items.push({ baseY: tentY + 2, draw: () => this.drawAtFeet(this.campTent!, tentX, tentY, true, 0, HOUSE_ART_SCALE) });
        items.push({ baseY: fireY, draw: () => this.drawAtFeet(this.campfire!, fireX, fireY, false, 0, HOUSE_ART_SCALE) });
      }
    }

    // border-gate wayposts: a lit timber post on each side of the opening,
    // so the road out of the region reads as a real gate from a distance
    for (const gate of world.gates ?? []) {
      const horizontalEdge = gate.edge === 'n' || gate.edge === 's';
      const posts = horizontalEdge
        ? [
            { x: (gate.tx - 3 + 0.5) * TILE, y: (gate.ty + 1) * TILE },
            { x: (gate.tx + 3 + 0.5) * TILE, y: (gate.ty + 1) * TILE },
          ]
        : [
            { x: (gate.tx + 0.5) * TILE, y: (gate.ty - 3 + 1) * TILE },
            { x: (gate.tx + 0.5) * TILE, y: (gate.ty + 3 + 1) * TILE },
          ];
      posts.forEach((post, i) => {
        if (post.x < this.camX - 40 || post.x > this.camX + VIEW_W + 40 || post.y < this.camY - 60 || post.y > this.camY + VIEW_H + 60) return;
        const spr = this.gatePosts[i % this.gatePosts.length];
        if (spr) items.push({ baseY: post.y, draw: () => this.drawAtFeet(spr, post.x, post.y, true, 0, HOUSE_ART_SCALE) });
      });
      // signpost text on the first waypost, naming the land+region across
      // this gate — answers "where does this road go" before you walk it
      const signPost = posts[0];
      if (signPost.x >= this.camX - 40 && signPost.x <= this.camX + VIEW_W + 40 && signPost.y >= this.camY - 60 && signPost.y <= this.camY + VIEW_H + 60) {
        items.push({
          baseY: signPost.y + 1,
          draw: () => {
            const sx = Math.round(signPost.x - this.camX);
            const sy = Math.round(signPost.y - this.camY) - 30;
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillText(gate.destLandName, sx + 1, sy + 1);
            ctx.fillStyle = '#e8d5a0';
            ctx.fillText(gate.destLandName, sx, sy);
            ctx.font = '6px monospace';
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillText(gate.destRegionName, sx + 1, sy + 8);
            ctx.fillStyle = '#c9bd9a';
            ctx.fillText(gate.destRegionName, sx, sy + 7);
          },
        });
      }
    }

    for (const pk of pickups) {
      const spr = this.sprites[WEAPONS[pk.weapon].sprite];
      const bob = Math.sin(performance.now() / 300) * 1.5;
      items.push({
        baseY: pk.y,
        draw: () => {
          const g = ctx.createRadialGradient(pk.x - this.camX, pk.y - 4 - this.camY, 0, pk.x - this.camX, pk.y - 4 - this.camY, 9);
          g.addColorStop(0, 'rgba(230,220,200,0.18)');
          g.addColorStop(1, 'rgba(230,220,200,0)');
          ctx.fillStyle = g;
          ctx.fillRect(pk.x - 10 - this.camX, pk.y - 14 - this.camY, 20, 20);
          this.drawAtFeet(spr, pk.x, pk.y + bob, true);
        },
      });
    }

    for (const bag of bags) {
      if (bag.layer !== world.layer) continue;
      items.push({ baseY: bag.y, draw: () => this.drawAtFeet(this.sprites.bag, bag.x, bag.y, true) });
    }

    for (const e of enemies) {
      items.push({ baseY: e.y, draw: () => this.drawEnemy(e, eframes[e.kind]) });
    }

    for (const npc of npcs) {
      items.push({ baseY: npc.y, draw: () => this.drawNpc(npc) });
    }

    for (const a of animals) {
      if (a.dead) continue; // killed in combat — hidden until it respawns (see game.ts updateAnimals)
      items.push({ baseY: a.y, draw: () => this.drawAnimal(a) });
    }

    if (pet) items.push({ baseY: pet.y, draw: () => this.drawPet(pet) });

    items.push({ baseY: player.y, draw: () => this.drawPlayer(player) });

    for (const op of otherPlayers) {
      items.push({
        baseY: op.player.y,
        draw: () => {
          this.drawPlayer(op.player);
          this.drawUsernameLabel(op.username, op.player.x, op.player.y - 32);
        },
      });
    }

    items.sort((a, b) => a.baseY - b.baseY);
    for (const it of items) it.draw();

    this.updateParticles(world, player, dt, graphicsQuality);
    this.renderLighting();
    this.renderFloats(dt);

    if (flashRed > 0) {
      ctx.fillStyle = `rgba(140,20,20,${Math.min(0.45, flashRed)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(180,170,150,0.5)';
    ctx.textAlign = 'left';
    const footer = world.profile
      ? `${world.profile.landName} • ${world.profile.regionName} • ${world.profile.rules.displayName}`
      : `${world.layer}. ${LAYER_NAMES[world.layer - 1] ?? 'Dungeon'}`;
    ctx.fillText(footer, 6, VIEW_H - 6);

    // the post pipeline works in physical pixels — scale screen-space
    // light positions/radii and the camera anchor up to match
    const gpuLights = this.collectGpuLights(world, player, pickups, tx0, ty0, tx1, ty1);
    for (const light of gpuLights) {
      light.x *= RENDER_SCALE;
      light.y *= RENDER_SCALE;
      light.radius *= RENDER_SCALE;
    }
    ctx.endFrame({
      time: performance.now() / 1000,
      damage: Math.min(1, flashRed / 0.6),
      quality: graphicsQuality,
      layer: renderLayer,
      lights: gpuLights,
      camera: [this.camX * RENDER_SCALE, this.camY * RENDER_SCALE],
      bloomStrength: this.frameBudget.bloomStrength,
    });

    this.renderMinimap(world, player);
    this.renderWeaponIcon(player);
  }

  private drawPortal(portal: WorldPortal): void {
    const ctx = this.ctx;
    const x = portal.x - this.camX;
    const y = portal.y - this.camY;
    const color =
      portal.kind === 'dungeon' ? '#d3a54a'
      : portal.kind === 'black-market' ? '#9e70d8'
      : portal.kind === 'red-gate' ? '#d74f43'
      : '#5e536b';

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - 7), Math.round(y - 15), 14, 13);
    ctx.fillStyle = 'rgba(10,8,14,0.78)';
    ctx.fillRect(Math.round(x - 4), Math.round(y - 12), 8, 10);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - 1), Math.round(y - 11), 2, 8);

    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(portal.name, x, y - 19);
  }

  // ---------------------------------------------------------------- actors

  private drawPlayer(p: Player): void {
    const ctx = this.ctx;
    if (p.invulnTimer > 0 && Math.floor(p.invulnTimer * 10) % 2 !== 0) return;

    let spr: Drawable;
    let bob = 0;
    if (this.playerStatic) {
      // manifest override: one static image, bobbed while walking so it still reads as motion
      const cycleIdx = Math.floor(p.animTime * (p.running ? 9 : 6)) % WALK_CYCLE.length;
      spr = this.playerStatic;
      bob = p.moving && cycleIdx % 2 === 0 ? -1 : 0;
    } else if (this.playerPack) {
      const set = this.playerPack[p.dir];
      spr = p.moving ? set.walk[Math.floor(p.animTime * (p.running ? 12 : 8)) % set.walk.length] : set.idle;
    } else {
      const frames = this.player[p.dir];
      const cycleIdx = Math.floor(p.animTime * (p.running ? 9 : 6)) % WALK_CYCLE.length;
      const frame = p.moving ? WALK_CYCLE[cycleIdx] : 0;
      spr = frames[frame] ?? frames[0];
      bob = p.moving && frame === 2 ? -1 : 0;
    }

    const swingBehind = p.swingT > 0 && Math.sin(p.facing) < -0.3;
    if (swingBehind) this.drawWeaponSwing(p);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x - this.camX, p.y + 1 - this.camY, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const flip = p.dir === 'side' && p.flipX;
    const dx = Math.round(p.x - spr.width / 2 - this.camX);
    const dy = Math.round(p.y - spr.height + 2 + bob - this.camY);
    if (flip) {
      ctx.save();
      ctx.translate(dx + spr.width / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(spr, -spr.width / 2, dy);
      ctx.restore();
    } else {
      ctx.drawImage(spr, dx, dy);
    }

    if (!swingBehind && p.swingT > 0) this.drawWeaponSwing(p);
  }

  /** Red Zone only — a small name tag above another connected player */
  private drawUsernameLabel(name: string, x: number, y: number): void {
    const ctx = this.ctx;
    const sx = Math.round(x - this.camX);
    const sy = Math.round(y - this.camY);
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(name, sx + 1, sy + 1);
    ctx.fillStyle = '#e0b84a';
    ctx.fillText(name, sx, sy);
  }

  private drawWeaponSwing(p: Player): void {
    const ctx = this.ctx;
    const w = currentWeapon(p);
    const isAbility = p.swingPower === 2;
    const duration = isAbility ? ABILITY_SWING_TIME : SWING_TIME;
    const spr = this.sprites[w.sprite];
    const prog = slashProgress(p.swingT, duration);
    const arc = p.swingArc;
    const range = p.swingRange;
    const ang = p.facing - arc / 2 + arc * prog;
    const hx = p.x + Math.cos(ang) * 8;
    const hy = p.y - 7 + Math.sin(ang) * 8;

    ctx.save();
    ctx.translate(hx - this.camX, hy - this.camY);
    ctx.rotate(ang + Math.PI / 2);
    ctx.drawImage(spr as HTMLCanvasElement, -spr.width / 2, -spr.height + 1);
    ctx.restore();

    // The trail is a fragment-masked GLSL arc rather than a CPU-tessellated line.
    // It keeps a bright moving head, soft tail and ability-weighted glow.
    const budget = visualEffectBudget(qualityNumber());
    ctx.drawCombatSlash(
      p.x - this.camX,
      p.y - 7 - this.camY,
      range * 0.78,
      p.facing - arc / 2,
      Math.max(0.01, arc * prog),
      (isAbility ? 5.2 : 2.8) * budget.slashGlow,
      w.color,
      (isAbility ? 0.94 : 0.72) * budget.slashGlow,
      isAbility,
    );
  }

  private drawNpc(npc: Npc): void {
    const ctx = this.ctx;
    const frames = this.npcFrames[npc.kind][npc.dir];
    const cycleIdx = Math.floor(npc.animTime * 6) % WALK_CYCLE.length;
    const frame = npc.moving ? WALK_CYCLE[cycleIdx] : 0;
    const spr = frames[frame] ?? frames[0];
    const bob = npc.moving && frame === 2 ? -1 : 0;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(npc.x - this.camX, npc.y + 1 - this.camY, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const flip = npc.dir === 'side' && npc.flipX;
    const dx = Math.round(npc.x - spr.width / 2 - this.camX);
    const dy = Math.round(npc.y - spr.height + 2 + bob - this.camY);
    if (flip) {
      ctx.save();
      ctx.translate(dx + spr.width / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(spr, -spr.width / 2, dy);
      ctx.restore();
    } else {
      ctx.drawImage(spr, dx, dy);
    }

    const icon = npc.role === 'archivist' ? 'A' : npc.role === 'scout' ? '!' : npc.kind === 'shopkeeper' ? '$' : '';
    if (icon) {
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = npc.role === 'archivist' ? '#9fc4ef' : npc.role === 'scout' ? '#8fd6b0' : '#e0b84a';
      ctx.fillText(icon, npc.x - this.camX, dy - 4);
    }
    if (npc.name && npc.serverOwned) {
      ctx.font = '6px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d8d1c2';
      ctx.fillText(npc.name, npc.x - this.camX, dy - 12);
    }
  }

  private drawSimpleCritter(x: number, y: number, flipX: boolean, moving: boolean, animTime: number, idleSpr: Drawable, walkFrames?: Drawable[]): number {
    const ctx = this.ctx;
    const walking = moving && walkFrames && walkFrames.length > 0;
    const spr = walking ? walkFrames[Math.floor(animTime * 6) % walkFrames.length] : idleSpr;
    // only fake a bob when there's no real walk-frame animation to carry the motion
    const bob = moving && !walking && Math.floor(animTime * 5) % 2 === 0 ? -1 : 0;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x - this.camX, y + 1 - this.camY, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    const dx = Math.round(x - spr.width / 2 - this.camX);
    const dy = Math.round(y - spr.height + 1 + bob - this.camY);
    if (flipX) {
      ctx.save();
      ctx.translate(dx + spr.width / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(spr as HTMLCanvasElement, -spr.width / 2, dy);
      ctx.restore();
    } else {
      ctx.drawImage(spr as HTMLCanvasElement, dx, dy);
    }
    return dy;
  }

  private drawAnimal(a: Animal): void {
    const spriteFamily = ANIMALS[a.kind].spriteFamily;
    const dy = this.drawSimpleCritter(a.x, a.y, a.flipX, a.moving, a.animTime, this.sprites[spriteFamily], this.animalWalkFrames[spriteFamily]);
    if (a.hitFlash > 0) {
      const spr = this.sprites[spriteFamily];
      const flashAlpha = 0.5 * EASE.outQuad(a.hitFlash / HIT_FLASH_TIME);
      this.ctx.fillStyle = `rgba(255,90,90,${flashAlpha.toFixed(3)})`;
      this.ctx.fillRect(Math.round(a.x - spr.width / 2 - this.camX), dy, spr.width, spr.height);
    }
    if (a.readyTimer <= 0) {
      const ctx = this.ctx;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7de8c3';
      ctx.fillText('✦', a.x - this.camX, dy - 4);
    }
  }

  private drawPet(pet: Pet): void {
    this.drawSimpleCritter(pet.x, pet.y, pet.flipX, pet.moving, pet.animTime, this.sprites.pet, this.animalWalkFrames.pet);
  }

  private drawEnemy(e: Enemy, frames: Drawable[]): void {
    const ctx = this.ctx;
    const rate = e.kind === 'bug' ? (e.aggro ? 12 : 6) : e.kind === 'shellbug' ? (e.aggro ? 7 : 4) : 4;
    const spr = frames[Math.floor(e.animTime * rate) % frames.length] ?? frames[0];

    if (e.emergeTimer > 0) {
      const prog = 1 - e.emergeTimer / 0.9;
      const h = Math.max(2, Math.floor(spr.height * prog));
      const sx = e.x - spr.width / 2 - this.camX + ((Math.random() * 2) | 0) - 1;
      const sy = e.y - h - this.camY;
      ctx.drawImage(spr, 0, 0, spr.width, h, Math.round(sx), Math.round(sy), spr.width, h);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(Math.round(e.x - 5 - this.camX), Math.round(e.y - 2 - this.camY), 10, 3);
      return;
    }

    this.drawAtFeet(spr, e.x, e.y, true);
    if (e.hitFlash > 0) {
      const flashAlpha = 0.5 * EASE.outQuad(e.hitFlash / HIT_FLASH_TIME);
      ctx.fillStyle = `rgba(255,90,90,${flashAlpha.toFixed(3)})`;
      ctx.fillRect(Math.round(e.x - spr.width / 2 - this.camX), Math.round(e.y - spr.height - this.camY), spr.width, spr.height);
    }
    if (e.telegraph > 0) {
      const pulse = 0.3 + 0.25 * Math.sin(e.telegraph * 18);
      ctx.fillStyle = `rgba(255,190,60,${pulse.toFixed(3)})`;
      ctx.fillRect(Math.round(e.x - spr.width / 2 - this.camX), Math.round(e.y - spr.height - this.camY), spr.width, spr.height);
    }
    if (e.hpBarTimer > 0 && e.hp < e.maxHp) {
      const bx = Math.round(e.x - 6 - this.camX);
      const by = Math.round(e.y - spr.height - 5 - this.camY);
      ctx.fillStyle = 'rgba(10,10,12,0.8)';
      ctx.fillRect(bx - 1, by - 1, 14, 4);
      ctx.fillStyle = '#4a1616';
      ctx.fillRect(bx, by, 12, 2);
      ctx.fillStyle = '#3fae5a';
      ctx.fillRect(bx, by, Math.max(1, Math.round((e.hp / e.maxHp) * 12)), 2);
    }
  }

  private collectGpuLights(
    world: World,
    player: Player,
    pickups: WeaponPickup[],
    tx0: number,
    ty0: number,
    tx1: number,
    ty1: number,
  ): GpuLight[] {
    const lights: GpuLight[] = [];
    const centerX = player.x;
    const centerY = player.y;
    const candidates: { light: GpuLight; distance: number }[] = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = tileAt(world, tx, ty);
        let radius = 0;
        let intensity = 0;
        let color: [number, number, number] = [1, 1, 1];
        if (tile === Tile.Glowshroom) {
          radius = 34; intensity = 0.20; color = [0.20, 0.92, 0.72];
        } else if (tile === Tile.Crystal) {
          radius = 42; intensity = 0.22; color = [0.34, 0.66, 1.0];
        } else if (tile === Tile.Exit || tile === Tile.Entrance) {
          radius = 52; intensity = 0.18; color = [1.0, 0.72, 0.24];
        } else {
          continue;
        }
        const x = (tx + 0.5) * TILE;
        const y = (ty + 0.5) * TILE;
        candidates.push({
          light: { x: x - this.camX, y: y - this.camY, radius, intensity, color },
          distance: Math.hypot(x - centerX, y - centerY),
        });
      }
    }
    for (const portal of world.portals) {
      if (portal.x < this.camX || portal.x > this.camX + VIEW_W || portal.y < this.camY || portal.y > this.camY + VIEW_H) continue;
      const color: [number, number, number] =
        portal.kind === 'dungeon' ? [1.0, 0.66, 0.22]
        : portal.kind === 'black-market' ? [0.62, 0.35, 0.92]
        : portal.kind === 'red-gate' ? [0.95, 0.18, 0.12]
        : [0.32, 0.22, 0.42];
      candidates.push({
        light: { x: portal.x - this.camX, y: portal.y - 8 - this.camY, radius: 56, intensity: 0.24, color },
        distance: Math.hypot(portal.x - centerX, portal.y - centerY),
      });
    }
    for (const pickup of pickups) {
      if (pickup.x < this.camX || pickup.x > this.camX + VIEW_W || pickup.y < this.camY || pickup.y > this.camY + VIEW_H) continue;
      const color = hexToRgb01(WEAPONS[pickup.weapon].color);
      candidates.push({
        light: { x: pickup.x - this.camX, y: pickup.y - 5 - this.camY, radius: 38, intensity: 0.20, color },
        distance: Math.hypot(pickup.x - centerX, pickup.y - centerY),
      });
    }
    // hearth fires — a soft warm glow from every occupied cottage
    for (const house of world.houses ?? []) {
      const interior = this.interiorFor(house);
      if (!interior.fireplace) continue;
      const { x, y } = interior.fireplace;
      if (x < this.camX - 60 || x > this.camX + VIEW_W + 60 || y < this.camY - 60 || y > this.camY + VIEW_H + 60) continue;
      const flickerSeed = Math.sin(performance.now() / 240 + house.ordinal * 2.1) * 0.04;
      candidates.push({
        light: { x: x - this.camX, y: y - this.camY, radius: 44, intensity: 0.20 + flickerSeed, color: [1.0, 0.62, 0.30] },
        distance: Math.hypot(x - centerX, y - centerY),
      });
    }
    // wilderness camp fire — a small warm glow at the rest stop
    if (world.campAnchor) {
      const x = (world.campAnchor.tx + 0.5) * TILE + 10;
      const y = (world.campAnchor.ty + 1) * TILE + 2;
      if (x >= this.camX - 60 && x <= this.camX + VIEW_W + 60 && y >= this.camY - 60 && y <= this.camY + VIEW_H + 60) {
        const flicker = Math.sin(performance.now() / 220) * 0.04;
        candidates.push({
          light: { x: x - this.camX, y: y - 4 - this.camY, radius: 38, intensity: 0.22 + flicker, color: [1.0, 0.58, 0.26] },
          distance: Math.hypot(x - centerX, y - centerY),
        });
      }
    }
    // gate lanterns — warm beacons that make region exits readable from afar
    for (const gate of world.gates ?? []) {
      const x = (gate.tx + 0.5) * TILE;
      const y = (gate.ty + 0.5) * TILE;
      if (x < this.camX - 60 || x > this.camX + VIEW_W + 60 || y < this.camY - 60 || y > this.camY + VIEW_H + 60) continue;
      candidates.push({
        light: { x: x - this.camX, y: y - 10 - this.camY, radius: 52, intensity: 0.22, color: [1.0, 0.78, 0.42] },
        distance: Math.hypot(x - centerX, y - centerY),
      });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates.slice(0, 15)) lights.push(candidate.light);
    return lights;
  }

  // ---------------------------------------------------------------- ambience

  private updateParticles(world: World, player: Player, dt: number, quality: 0 | 1 | 2): void {
    const ctx = this.ctx;
    const budget = visualEffectBudget(quality);
    // Grove ambience (pollen + butterflies) covers the whole Green Land biome,
    // not just the tended town hub.
    const greenLand = world.profile?.landId === 'green-land';

    // spores drifting up from glowing shrooms
    if (this.particles.length < MAX_PARTICLES) {
      const tx0 = Math.floor(this.camX / TILE);
      const ty0 = Math.floor(this.camY / TILE);
      const tx1 = tx0 + Math.ceil(VIEW_W / TILE) + 1;
      const ty1 = ty0 + Math.ceil(VIEW_H / TILE) + 1;
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const isRipePlot = farmPlotAt(world, tx, ty)?.stage === 3;
          if (tileAt(world, tx, ty) !== Tile.Glowshroom && !isRipePlot) continue;
          if (Math.random() < dt * 0.9 * budget.particleMultiplier) {
            this.particles.push({
              x: (tx + 0.3 + Math.random() * 0.4) * TILE,
              y: (ty + 0.5) * TILE,
              vx: (Math.random() - 0.5) * 4,
              vy: -4 - Math.random() * 4,
              life: 2.2 + Math.random() * 1.2,
              maxLife: 3.4,
              color: '#7de8c3',
              size: 1,
            });
          }
        }
      }
      for (const p of world.props) {
        if (p.x < this.camX || p.x > this.camX + VIEW_W || p.y < this.camY || p.y > this.camY + VIEW_H) continue;
        if (p.kind === 'shrooms') {
          if (Math.random() < dt * 0.6 * budget.particleMultiplier) {
            this.particles.push({
              x: p.x + (Math.random() - 0.5) * 8,
              y: p.y - 4,
              vx: (Math.random() - 0.5) * 4,
              vy: -3 - Math.random() * 3,
              life: 2 + Math.random(),
              maxLife: 3,
              color: '#7de8c3',
              size: 1,
            });
          }
        } else if (p.kind === 'tree' && budget.natureParticles) {
          // the occasional leaf shaken loose, wobbling down on the wind
          if (Math.random() < dt * 0.28 * budget.particleMultiplier) {
            this.particles.push({
              x: p.x + (Math.random() - 0.5) * 18,
              y: p.y - 22 - Math.random() * 10,
              vx: 3 + Math.random() * 5,
              vy: 7 + Math.random() * 6,
              life: 2.4 + Math.random() * 1.4,
              maxLife: 3.8,
              color: Math.random() < 0.7 ? '#6f9c3f' : '#b5893a',
              size: 1,
              wobble: 12 + Math.random() * 10,
              phase: Math.random() * Math.PI * 2,
            });
          }
        }
      }
      // fireflies hovering over water and glowing flora
      if (budget.natureParticles) {
        for (let ty = ty0; ty <= ty1; ty += 2) {
          for (let tx = tx0; tx <= tx1; tx += 2) {
            if (tileAt(world, tx, ty) !== Tile.Water) continue;
            if (Math.random() < dt * 0.05 * budget.particleMultiplier) {
              this.particles.push({
                x: (tx + Math.random()) * TILE,
                y: (ty + Math.random()) * TILE - 6,
                vx: (Math.random() - 0.5) * 3,
                vy: -1.5 - Math.random() * 1.5,
                life: 3.2 + Math.random() * 1.8,
                maxLife: 5,
                color: '#ffe98a',
                size: 1,
                wobble: 9 + Math.random() * 8,
                phase: Math.random() * Math.PI * 2,
              });
            }
          }
        }
      }
      // pollen/seed motes drifting on the wind over open grass — makes the
      // whole grove feel alive, not just the water and flora. Green zones only.
      if (budget.natureParticles && greenLand) {
        for (let k = 0; k < 3; k++) {
          if (Math.random() >= dt * 3 * budget.particleMultiplier) continue;
          const tx = tx0 + Math.floor(Math.random() * (tx1 - tx0 + 1));
          const ty = ty0 + Math.floor(Math.random() * (ty1 - ty0 + 1));
          if (isSolid(tileAt(world, tx, ty))) continue;
          this.particles.push({
            x: (tx + Math.random()) * TILE,
            y: (ty + Math.random()) * TILE - 3,
            vx: 3 + Math.random() * 4, // carried on the same breeze as the grass sway
            vy: -0.6 - Math.random() * 1.8,
            life: 3 + Math.random() * 2.5,
            maxLife: 5.5,
            color: Math.random() < 0.7 ? '#eee08a' : '#fff6d6',
            size: 1,
            wobble: 6 + Math.random() * 6,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      // village life: chimney smoke over every roof, embers when indoors
      if (budget.natureParticles) {
        for (const house of world.houses ?? []) {
          const interior = this.interiorFor(house);
          const { chimney, fireplace } = interior;
          if (chimney.x >= this.camX - 30 && chimney.x <= this.camX + VIEW_W + 30 && chimney.y >= this.camY - 40 && chimney.y <= this.camY + VIEW_H + 40) {
            if (Math.random() < dt * 1.3 * budget.particleMultiplier) {
              this.particles.push({
                x: chimney.x + (Math.random() - 0.5) * 3,
                y: chimney.y,
                vx: 2 + Math.random() * 3,
                vy: -7 - Math.random() * 4,
                life: 2.2 + Math.random() * 1.4,
                maxLife: 3.6,
                color: '#9aa0a8',
                size: 1.6,
                wobble: 6 + Math.random() * 5,
                phase: Math.random() * Math.PI * 2,
              });
            }
          }
          // embers drift up from the hearth while the player is inside
          const inside = player.x >= house.x0 * TILE && player.x < (house.x1 + 1) * TILE
            && player.y >= house.y0 * TILE && player.y < (house.y1 + 1) * TILE;
          if (inside && fireplace && Math.random() < dt * 2.2) {
            this.particles.push({
              x: fireplace.x + (Math.random() - 0.5) * 6,
              y: fireplace.y + 4,
              vx: (Math.random() - 0.5) * 4,
              vy: -9 - Math.random() * 7,
              life: 0.5 + Math.random() * 0.45,
              maxLife: 0.95,
              color: Math.random() < 0.6 ? '#e8842a' : '#ffcf70',
              size: 1,
            });
          }
        }
        // campfire embers, always lit (outdoors — no "inside" gate needed)
        if (world.campAnchor) {
          const fx = (world.campAnchor.tx + 0.5) * TILE + 10;
          const fy = (world.campAnchor.ty + 1) * TILE + 2;
          if (fx >= this.camX - 40 && fx <= this.camX + VIEW_W + 40 && fy >= this.camY - 40 && fy <= this.camY + VIEW_H + 40 && Math.random() < dt * 1.8) {
            this.particles.push({
              x: fx + (Math.random() - 0.5) * 5,
              y: fy,
              vx: (Math.random() - 0.5) * 3,
              vy: -8 - Math.random() * 6,
              life: 0.5 + Math.random() * 0.4,
              maxLife: 0.9,
              color: Math.random() < 0.6 ? '#e8842a' : '#ffcf70',
              size: 1,
            });
          }
        }
      }
      // dust kicked up at the player's heels while sprinting
      if (budget.natureParticles && player.moving && player.running && Math.random() < dt * 9) {
        this.particles.push({
          x: player.x + (Math.random() - 0.5) * 6,
          y: player.y + (Math.random() - 0.5) * 2,
          vx: (Math.random() - 0.5) * 10,
          vy: -6 - Math.random() * 5,
          life: 0.4 + Math.random() * 0.25,
          maxLife: 0.65,
          color: '#a99877',
          size: 1,
        });
      }
      // Ambient route motes replace the retired player-lantern particles.
      if (Math.random() < dt * 2.4 * budget.particleMultiplier) {
        const a = Math.random() * Math.PI * 2;
        const r = 18 + Math.random() * 58;
        this.particles.push({
          x: player.x + Math.cos(a) * r,
          y: player.y - 8 + Math.sin(a) * r * 0.55,
          vx: (Math.random() - 0.5) * 2,
          vy: -0.8 - Math.random() * 1.6,
          life: 1.3 + Math.random(),
          maxLife: 2.3,
          color: '#d7c8a5',
          size: 1,
        });
      }
    }

    // simulate + draw
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.wobble) pt.x += Math.sin(this.frameTime * 2.6 + (pt.phase ?? 0)) * pt.wobble * dt;
      if (pt.color === '#ffd88a') pt.vy += 90 * dt; // sparks fall
      const alpha = Math.min(1, pt.life / (pt.maxLife * 0.4)) * 0.7;
      const screenX = pt.x - this.camX;
      const screenY = pt.y - this.camY;
      ctx.drawGlowParticle(
        screenX,
        screenY,
        Math.max(1.25, pt.size * (quality === 2 ? 2.2 : 1.7)),
        pt.color,
        alpha,
        visualSeed(Math.round(pt.x * 4), Math.round(pt.y * 4)),
        pt.color === '#ffd88a' ? 0.82 : 0.58,
      );
    }

    if (greenLand) this.updateButterflies(world, dt, budget);
  }

  /** A few butterflies fluttering over the grove — spawned only in green zones,
   * quality-gated, and purely decorative (no collision, no gameplay). */
  private updateButterflies(world: World, dt: number, budget: VisualEffectBudget): void {
    const ctx = this.ctx;
    const target = budget.natureParticles ? (budget.particleMultiplier >= 1 ? 6 : 3) : 0;
    const palette = ['#f6efd6', '#f2c14e', '#e6884f', '#dcd3f0', '#f0a5c8'];

    // top up the population by spawning over any open (non-solid) ground on screen
    if (this.butterflies.length < target && Math.random() < dt * 6) {
      const tx = Math.floor((this.camX + Math.random() * VIEW_W) / TILE);
      const ty = Math.floor((this.camY + Math.random() * VIEW_H) / TILE);
      if (!isSolid(tileAt(world, tx, ty))) {
        const a = Math.random() * Math.PI * 2;
        this.butterflies.push({
          x: (tx + 0.5) * TILE,
          y: (ty + 0.5) * TILE,
          vx: Math.cos(a) * 14,
          vy: Math.sin(a) * 10,
          flap: Math.random() * Math.PI * 2,
          flapSpeed: 16 + Math.random() * 8,
          turnT: 0.6 + Math.random() * 0.8,
          color: palette[(Math.random() * palette.length) | 0],
        });
      }
    }

    for (let i = this.butterflies.length - 1; i >= 0; i--) {
      const bf = this.butterflies[i];
      bf.flap += bf.flapSpeed * dt;
      bf.turnT -= dt;
      if (bf.turnT <= 0) { // gentle random course changes = fluttery path
        const a = Math.atan2(bf.vy, bf.vx) + (Math.random() - 0.5) * 1.6;
        const sp = 12 + Math.random() * 8;
        bf.vx = Math.cos(a) * sp;
        bf.vy = Math.sin(a) * sp;
        bf.turnT = 0.5 + Math.random() * 0.7;
      }
      bf.x += bf.vx * dt;
      bf.y += (bf.vy + Math.sin(bf.flap) * 12) * dt; // bob with the wing flap
      // retire once it wanders well off-screen
      if (bf.x < this.camX - 40 || bf.x > this.camX + VIEW_W + 40 || bf.y < this.camY - 40 || bf.y > this.camY + VIEW_H + 40) {
        this.butterflies.splice(i, 1);
        continue;
      }
      const sx = Math.round(bf.x - this.camX);
      const sy = Math.round(bf.y - this.camY);
      // crisp solid wings that open/close with the flap — reads clearly over grass
      const spread = 1 + Math.abs(Math.sin(bf.flap)) * 2.5;
      const wingW = Math.max(1, Math.round(spread));
      const seed = visualSeed(Math.round(bf.x), Math.round(bf.y));
      ctx.drawGlowParticle(sx, sy, 4.2, bf.color, 0.32, seed, 0.3); // soft halo
      ctx.fillStyle = bf.color;
      ctx.fillRect(sx - wingW - 1, sy - 2, wingW, 4); // left wing
      ctx.fillRect(sx + 1, sy - 2, wingW, 4);         // right wing
      ctx.fillStyle = '#2a2620';
      ctx.fillRect(sx, sy - 2, 1, 4);                 // body
    }
  }

  private renderFloats(dt: number): void {
    const ctx = this.ctx;
    const POP_TIME = 0.12; // seconds of the scale-in pop at spawn
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y -= dt * 18;
      if (f.life <= 0) {
        this.floats.splice(i, 1);
        continue;
      }
      const age = 0.9 - f.life;
      const scale = age < POP_TIME ? Math.max(0.001, EASE.outBack(age / POP_TIME)) : 1;
      const px = Math.round(f.x - this.camX);
      const py = Math.round(f.y - this.camY);
      ctx.globalAlpha = Math.min(1, f.life * 2.5);
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#0a0a0c';
      ctx.fillText(f.text, 1, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /** `artScale` divides the sprite's authored size down to its in-world size
   * — high-res painterly art (trees) passes NATURE_ART_SCALE. */
  private drawAtFeet(spr: Drawable, wx: number, wy: number, shadow = false, swayAmp = 0, artScale = 1): void {
    if (!spr) {
      console.error(`[undral] missing sprite at world (${wx.toFixed(0)}, ${wy.toFixed(0)})`);
      return;
    }
    const ctx = this.ctx;
    const w = spr.width / artScale;
    const h = spr.height / artScale;
    const x = Math.round(wx - w / 2 - this.camX);
    const y = Math.round(wy - h - this.camY);
    // Any wide prop (a tree, tent, boulder pile…) needs the grounded shadow,
    // whether it's the 4x procedural canopy (artScale>1) OR a manifest PNG
    // authored at 1:1 (artScale==1). Gating on artScale alone left the real
    // manifest trees on the tiny-ellipse path, so their crowns kept floating.
    if (shadow && w >= 36) {
      // Large props get two stacked shadows so the crown reads as *planted*,
      // not floating: a wide soft canopy pool for ambient occlusion, then a
      // tight dark contact ellipse hugging the trunk base. Without the contact
      // core the diffuse pool alone leaves the tree looking hovered.
      const bx = wx - this.camX;
      const by = wy - 1 - this.camY;
      const softEllipse = (cx: number, cy: number, radius: number, squash: number, stops: [number, string][]): void => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        for (const [at, col] of stops) g.addColorStop(at, col);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, squash);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = g;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.restore();
      };
      // ambient canopy pool — wide and faint, nudged slightly with the light
      softEllipse(bx + w * 0.04, by, w * 0.44, 0.30, [
        [0, 'rgba(0,0,0,0.22)'],
        [0.62, 'rgba(0,0,0,0.10)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
      // contact shadow — small, dark, centred on the trunk so it grounds it
      softEllipse(bx, by, w * 0.17, 0.42, [
        [0, 'rgba(0,0,0,0.46)'],
        [0.7, 'rgba(0,0,0,0.24)'],
        [1, 'rgba(0,0,0,0)'],
      ]);
    } else if (shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(wx - this.camX, wy - 1 - this.camY, Math.min(14, w * 0.4), 2.5 + w * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (swayAmp > 0) {
      const sway = windSway(this.frameTime, wx, wy) * swayAmp * this.frameBudget.windStrength;
      ctx.drawImageSwaying(spr, x, y, sway, w, h);
    } else if (artScale !== 1) {
      ctx.drawImage(spr, x, y, w, h);
    } else {
      ctx.drawImage(spr, x, y);
    }
  }

  // The whole world is open-air and fully lit. The retired lantern resource
  // no longer affects visibility or environmental triggers; this is only a
  // subtle atmospheric wash shared by every player.
  private renderLighting(): void {
    const g = this.ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 0, VIEW_W / 2, VIEW_H / 2, Math.max(VIEW_W, VIEW_H) * 0.7);
    g.addColorStop(0, 'rgba(255,244,214,0.06)');
    g.addColorStop(1, 'rgba(255,244,214,0)');
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  private renderMinimap(world: World, player: Player): void {
    if (!this.minimap) return;
    // The tile buffer is rebuilt only when the World object changes (new
    // layer/respawn/load), not per frame — repainting all MAP_W×MAP_H tiles
    // with 1px fillRects every frame was a real per-frame CPU cost on the
    // 220×220 map. In-run tile mutations (gathering flips Glowshroom/
    // Crystal/IronOre to Floor) don't change the color bucket drawn below,
    // so a per-world cache stays visually correct.
    if (this.minimapWorld !== world) {
      this.minimapWorld = world;
      this.minimapBuf.width = world.w;
      this.minimapBuf.height = world.h;
      const bc = this.minimapBuf.getContext('2d')!;
      bc.fillStyle = '#0a0a0e';
      bc.fillRect(0, 0, world.w, world.h);
      // the world is fully lit now — the minimap shows the whole map right
      // away instead of only what your (now-vestigial) torch radius has revealed
      for (let ty = 0; ty < world.h; ty++) {
        for (let tx = 0; tx < world.w; tx++) {
          const t = tileAt(world, tx, ty);
          const road = !isSolid(t) && isPathFloorVariant(world.floorVariant[ty * world.w + tx]);
          bc.fillStyle =
            t === Tile.Water ? '#1d3244'
            : t === Tile.Exit ? '#c9a44a'
            : t === Tile.Brick ? '#57503f'
            : isSolid(t) ? '#262320'
            : road ? '#6e5c3a'
            : '#3d382f';
          bc.fillRect(tx, ty, 1, 1);
        }
      }
      // gates glow gold on the map — the exits players are looking for
      for (const gate of world.gates ?? []) {
        bc.fillStyle = '#e0b84a';
        bc.fillRect(gate.tx - 1, gate.ty - 1, 3, 3);
      }
    }

    const mc = this.minimap.getContext('2d')!;
    mc.imageSmoothingEnabled = false;
    mc.clearRect(0, 0, this.minimap.width, this.minimap.height);
    mc.drawImage(this.minimapBuf, 0, 0, this.minimap.width, this.minimap.height);
    // player dot drawn on the output canvas, scaled to it — the buffer stays static
    const sx = this.minimap.width / world.w;
    const sy = this.minimap.height / world.h;
    mc.fillStyle = '#e8d5a0';
    mc.fillRect((Math.floor(player.x / TILE) - 1) * sx, (Math.floor(player.y / TILE) - 1) * sy, Math.max(1, 2 * sx), Math.max(1, 2 * sy));
  }

  private renderWeaponIcon(player: Player): void {
    if (!this.weaponIcon) return;
    const w = currentWeapon(player);
    const ic = this.weaponIcon.getContext('2d')!;
    const size = this.weaponIcon.width;
    ic.imageSmoothingEnabled = false;
    ic.clearRect(0, 0, size, size);

    ic.fillStyle = 'rgba(12,11,15,0.55)';
    ic.beginPath();
    ic.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ic.fill();
    ic.strokeStyle = w.color;
    ic.lineWidth = 1.5;
    ic.stroke();

    const spr = this.sprites[w.sprite];
    ic.save();
    ic.translate(size / 2, size / 2);
    ic.rotate(-Math.PI / 4);
    const scale = (size * 0.55) / Math.max(spr.width, spr.height);
    ic.drawImage(spr as HTMLCanvasElement, (-spr.width / 2) * scale, (-spr.height / 2) * scale, spr.width * scale, spr.height * scale);
    ic.restore();

    // ability cooldown: a dark radial wipe that shrinks as it recharges
    const frac = Math.min(1, player.abilityTimer / w.ability.cooldown);
    if (frac > 0) {
      ic.fillStyle = 'rgba(0,0,0,0.65)';
      ic.beginPath();
      ic.moveTo(size / 2, size / 2);
      ic.arc(size / 2, size / 2, size / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ic.closePath();
      ic.fill();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);
    this.ctx.dispose();
    this.floats.length = 0;
    this.particles.length = 0;
    this.butterflies.length = 0;
    this.tilesets.clear();
    this.enemyTinted.clear();
  }
}


function hexToRgb01(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  if (value.length !== 6) return [1, 1, 1];
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}
