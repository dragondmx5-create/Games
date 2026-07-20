import type { SettlementHouseDefinition } from '../../server/src/world/settlementLayout';


export type HouseArchetype =
  | 'cottage'
  | 'townhouse'
  | 'manor'
  | 'questHouse'
  | 'shop'
  | 'marketHall'
  | 'cafe'
  | 'office'
  | 'guildHall'
  | 'civic'
  | 'workshop'
  | 'lodge';

/** Stable building role derived from the server-authored city footprint. */
export function houseArchetypeFor(house: SettlementHouseDefinition): HouseArchetype {
  switch (house.role) {
    case 'residential-small': return 'cottage';
    case 'residential-medium': return 'townhouse';
    case 'residential-luxury': return 'manor';
    case 'quest-house': return 'questHouse';
    case 'shop': return 'shop';
    case 'market-hall': return 'marketHall';
    case 'cafe': return 'cafe';
    case 'office': return 'office';
    case 'guild-hall': return 'guildHall';
    case 'civic': return 'civic';
    case 'workshop': return 'workshop';
    default: break;
  }
  const width = house.x1 - house.x0 + 1;
  if (width >= 11 || house.ordinal === 2) return 'guildHall';
  if (house.ordinal === 1) return 'shop';
  if (house.ordinal === 3) return 'workshop';
  if (house.ordinal === 4) return 'lodge';
  return 'cottage';
}

export type HouseWallSide = 'n' | 's' | 'e' | 'w';

export interface HouseAnchor {
  x: number;
  z: number;
  rotationY: number;
}

export interface HouseComposition {
  windows: Record<HouseWallSide, readonly boolean[]>;
  reservedSolid: Record<HouseWallSide, readonly number[]>;
  furniture: {
    fireplace: HouseAnchor;
    bookshelf: HouseAnchor;
    bed: HouseAnchor;
    workbench: HouseAnchor;
    barrels: HouseAnchor;
  };
  wallFaces: {
    north: number;
    south: number;
    west: number;
    east: number;
  };
}

function hash01(a: number, b: number): number {
  let value = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) ^ 0xc2b2ae35, 0x27d4eb2d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  return (value >>> 0) / 0xffffffff;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index));
}

function reservePair(target: Set<number>, index: number, towardCenter: number, length: number): void {
  target.add(clampIndex(index, length));
  target.add(clampIndex(index + towardCenter, length));
}

function combinations(values: readonly number[], count: number): number[][] {
  const result: number[][] = [];
  const current: number[] = [];
  const visit = (start: number): void => {
    if (current.length === count) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < values.length; i += 1) {
      const value = values[i];
      if (current.length > 0 && value - current[current.length - 1] < 2) continue;
      current.push(value);
      visit(i + 1);
      current.pop();
    }
  };
  visit(0);
  return result;
}

function chooseEvenWindows(
  length: number,
  blocked: ReadonlySet<number>,
  count: number,
  seed: number,
  preferred?: readonly number[],
): number[] | undefined {
  const allowed = Array.from({ length }, (_, index) => index).filter((index) => !blocked.has(index));
  const options = combinations(allowed, count);
  if (options.length === 0) return undefined;
  let best = options[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const option of options) {
    let score = 0;
    for (let i = 0; i < option.length; i += 1) {
      const ideal = ((i + 1) * (length - 1)) / (count + 1);
      score += Math.abs(option[i] - ideal);
      if (preferred?.[i] !== undefined) score += Math.abs(option[i] - preferred[i]) * 0.42;
      if (option[i] === 0 || option[i] === length - 1) score += 0.12;
    }
    const signature = option.reduce((value, index, ordinal) => value ^ Math.imul(index + 11, ordinal + 37), seed);
    score += hash01(seed, signature) * 0.18;
    if (score < bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return best;
}

function balancedWindowPair(
  length: number,
  blockedA: ReadonlySet<number>,
  blockedB: ReadonlySet<number>,
  seed: number,
): [number[], number[]] {
  const desired = Math.max(1, Math.floor((length + 1) / 3));
  for (let count = desired; count >= 0; count -= 1) {
    const a = chooseEvenWindows(length, blockedA, count, seed);
    if (!a) continue;
    const mirrored = a.map((index) => length - 1 - index).sort((left, right) => left - right);
    const b = chooseEvenWindows(length, blockedB, count, seed ^ 0x5bd1e995, mirrored);
    if (b) return [a, b];
  }
  return [[], []];
}

function flags(length: number, selected: readonly number[]): readonly boolean[] {
  const selectedSet = new Set(selected);
  return Array.from({ length }, (_, index) => selectedSet.has(index));
}

function sorted(set: ReadonlySet<number>): readonly number[] {
  return [...set].sort((a, b) => a - b);
}

/**
 * Builds one deterministic composition shared by wall construction and
 * interior placement. Window counts are balanced across opposing walls, while
 * wall-adjacent furniture reserves the panels behind it as solid structure.
 */
export function buildHouseComposition(house: SettlementHouseDefinition): HouseComposition {
  const width = house.x1 - house.x0 + 1;
  const depth = house.y1 - house.y0 + 1;
  const sideLength = Math.max(1, depth - 2);
  const north = new Set<number>();
  const south = new Set<number>();
  const west = new Set<number>();
  const east = new Set<number>();

  const quarterIndex = clampIndex(Math.floor(width * 0.27), width);
  const fireplaceIndex = Math.max(1, Math.min(width - 2, quarterIndex));
  const bookshelfIndex = width - 1 - fireplaceIndex;
  const bedIndex = house.ordinal % 2 === 0 ? fireplaceIndex : bookshelfIndex;
  const workbenchIndex = sideLength <= 2 ? 0 : house.ordinal % 2 === 0 ? 1 : sideLength - 2;
  const barrelIndex = sideLength - 1 - workbenchIndex;

  reservePair(north, fireplaceIndex, 1, width);
  reservePair(north, bookshelfIndex, -1, width);
  reservePair(south, bedIndex, bedIndex < width * 0.5 ? 1 : -1, width);
  reservePair(west, workbenchIndex, workbenchIndex < sideLength * 0.5 ? 1 : -1, sideLength);
  reservePair(east, barrelIndex, barrelIndex < sideLength * 0.5 ? 1 : -1, sideLength);

  if (house.doorSide === 'n') north.add(clampIndex(house.doorTx - house.x0, width));
  if (house.doorSide === 's') south.add(clampIndex(house.doorTx - house.x0, width));
  if (house.doorSide === 'w') west.add(clampIndex(house.doorTy - house.y0 - 1, sideLength));
  if (house.doorSide === 'e') east.add(clampIndex(house.doorTy - house.y0 - 1, sideLength));

  const [northWindows, southWindows] = balancedWindowPair(width, north, south, house.ordinal * 131 + width * 17);
  const [westWindows, eastWindows] = balancedWindowPair(sideLength, west, east, house.ordinal * 197 + depth * 23);

  const northPanelCenter = -depth * 0.5 + 0.5;
  const southPanelCenter = depth * 0.5 - 0.5;
  const westPanelCenter = -width * 0.5 + 0.5;
  const eastPanelCenter = width * 0.5 - 0.5;
  const panelInnerFace = 0.12;
  const northFace = northPanelCenter + panelInnerFace;
  const southFace = southPanelCenter - panelInnerFace;
  const westFace = westPanelCenter + panelInnerFace;
  const eastFace = eastPanelCenter - panelInnerFace;
  const wallX = (index: number) => -width * 0.5 + 0.5 + index;
  const wallZ = (index: number) => -depth * 0.5 + 1.5 + index;

  return {
    windows: {
      n: flags(width, northWindows),
      s: flags(width, southWindows),
      w: flags(sideLength, westWindows),
      e: flags(sideLength, eastWindows),
    },
    reservedSolid: {
      n: sorted(north),
      s: sorted(south),
      w: sorted(west),
      e: sorted(east),
    },
    furniture: {
      fireplace: { x: wallX(fireplaceIndex), z: northFace + 0.36, rotationY: 0 },
      bookshelf: { x: wallX(bookshelfIndex), z: northFace + 0.14, rotationY: 0 },
      bed: { x: wallX(bedIndex), z: southFace - 1.025, rotationY: Math.PI },
      workbench: { x: westFace + 0.36, z: wallZ(workbenchIndex), rotationY: Math.PI * 0.5 },
      barrels: { x: eastFace - 0.87, z: wallZ(barrelIndex), rotationY: 0 },
    },
    wallFaces: { north: northFace, south: southFace, west: westFace, east: eastFace },
  };
}
