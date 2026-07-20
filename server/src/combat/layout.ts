import { COMBAT_ENEMIES, type CombatEnemyKind, type CombatRiskTier } from './catalog.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from '../world/resourceLayout.js';
import { hashText32, mulberry32 } from '../world/layoutRandom.js';

const REGION_PIXELS = RESOURCE_REGION_SIZE * RESOURCE_TILE_SIZE;
const EDGE_MARGIN = 96;
const CAPITAL_CLEAR_RADIUS = 320;

export interface EnemySpawnDefinition {
  id: string;
  worldSeed: number;
  rx: number;
  ry: number;
  ordinal: number;
  kind: CombatEnemyKind;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  maxHp: number;
}

function countForRisk(riskTier: CombatRiskTier): number {
  if (riskTier === 'sanctuary') return 0;
  if (riskTier === 'frontier') return 12;
  if (riskTier === 'fracture') return 18;
  return 24;
}

function kindsForRisk(riskTier: CombatRiskTier): readonly CombatEnemyKind[] {
  if (riskTier === 'frontier') return ['bug', 'shellbug'];
  if (riskTier === 'fracture') return ['bug', 'shellbug', 'wallworm'];
  if (riskTier === 'lost') return ['bug', 'shellbug', 'wallworm', 'spitter'];
  return [];
}

function outsideCapitalClearance(x: number, y: number): boolean {
  return Math.hypot(x - REGION_PIXELS / 2, y - REGION_PIXELS / 2) >= CAPITAL_CLEAR_RADIUS;
}

export function generateEnemySpawns(
  worldSeed: number,
  rx: number,
  ry: number,
  riskTier: CombatRiskTier,
): EnemySpawnDefinition[] {
  const count = countForRisk(riskTier);
  const kinds = kindsForRisk(riskTier);
  if (count === 0 || kinds.length === 0) return [];
  const rand = mulberry32(hashText32(`enemy-layout:${worldSeed}:${rx}:${ry}:${riskTier}`));
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const usable = REGION_PIXELS - EDGE_MARGIN * 2;
  const cellW = usable / columns;
  const cellH = usable / rows;
  const spawns: EnemySpawnDefinition[] = [];

  for (let ordinal = 0; ordinal < count; ordinal++) {
    const col = ordinal % columns;
    const row = Math.floor(ordinal / columns);
    let x = EDGE_MARGIN + (col + 0.2 + rand() * 0.6) * cellW;
    let y = EDGE_MARGIN + (row + 0.2 + rand() * 0.6) * cellH;
    if (!outsideCapitalClearance(x, y)) {
      const angle = rand() * Math.PI * 2;
      x = REGION_PIXELS / 2 + Math.cos(angle) * (CAPITAL_CLEAR_RADIUS + 40 + rand() * 100);
      y = REGION_PIXELS / 2 + Math.sin(angle) * (CAPITAL_CLEAR_RADIUS + 40 + rand() * 100);
    }
    x = Math.max(EDGE_MARGIN, Math.min(REGION_PIXELS - EDGE_MARGIN, x));
    y = Math.max(EDGE_MARGIN, Math.min(REGION_PIXELS - EDGE_MARGIN, y));
    const kind = kinds[Math.floor(rand() * kinds.length)] ?? kinds[0];
    const maxHp = COMBAT_ENEMIES[kind].hp;
    spawns.push({
      id: `enemy:${worldSeed}:${rx}:${ry}:${ordinal}`,
      worldSeed,
      rx,
      ry,
      ordinal,
      kind,
      x,
      y,
      homeX: x,
      homeY: y,
      maxHp,
    });
  }
  return spawns;
}
