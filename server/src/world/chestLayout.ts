import type { CombatRiskTier } from '../combat/catalog.js';
import { RESOURCE_REGION_SIZE, RESOURCE_TILE_SIZE } from './resourceLayout.js';
import { hashText32, mulberry32 } from './layoutRandom.js';

const REGION_PIXELS = RESOURCE_REGION_SIZE * RESOURCE_TILE_SIZE;
const EDGE_MARGIN = 112;
const CAPITAL_CLEAR_RADIUS = 300;

export interface WorldChestDefinition {
  id: string;
  worldSeed: number;
  rx: number;
  ry: number;
  ordinal: number;
  x: number;
  y: number;
  respawnMs: number;
}

function countForRisk(riskTier: CombatRiskTier): number {
  if (riskTier === 'sanctuary') return 2;
  if (riskTier === 'frontier') return 4;
  if (riskTier === 'fracture') return 6;
  return 8;
}

function respawnForRisk(riskTier: CombatRiskTier): number {
  if (riskTier === 'sanctuary') return 30 * 60_000;
  if (riskTier === 'frontier') return 20 * 60_000;
  if (riskTier === 'fracture') return 15 * 60_000;
  return 10 * 60_000;
}

export function generateWorldChests(
  worldSeed: number,
  rx: number,
  ry: number,
  riskTier: CombatRiskTier,
): WorldChestDefinition[] {
  const count = countForRisk(riskTier);
  const rand = mulberry32(hashText32(`world-chests:${worldSeed}:${rx}:${ry}:${riskTier}`));
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const usable = REGION_PIXELS - EDGE_MARGIN * 2;
  const cellW = usable / columns;
  const cellH = usable / rows;
  const result: WorldChestDefinition[] = [];

  for (let ordinal = 0; ordinal < count; ordinal++) {
    const col = ordinal % columns;
    const row = Math.floor(ordinal / columns);
    let x = EDGE_MARGIN + (col + 0.18 + rand() * 0.64) * cellW;
    let y = EDGE_MARGIN + (row + 0.18 + rand() * 0.64) * cellH;
    if (Math.hypot(x - REGION_PIXELS / 2, y - REGION_PIXELS / 2) < CAPITAL_CLEAR_RADIUS) {
      const angle = rand() * Math.PI * 2;
      const radius = CAPITAL_CLEAR_RADIUS + 48 + rand() * 120;
      x = REGION_PIXELS / 2 + Math.cos(angle) * radius;
      y = REGION_PIXELS / 2 + Math.sin(angle) * radius;
    }
    x = Math.max(EDGE_MARGIN, Math.min(REGION_PIXELS - EDGE_MARGIN, x));
    y = Math.max(EDGE_MARGIN, Math.min(REGION_PIXELS - EDGE_MARGIN, y));
    result.push({
      id: `chest:${worldSeed}:${rx}:${ry}:${ordinal}`,
      worldSeed,
      rx,
      ry,
      ordinal,
      x,
      y,
      respawnMs: respawnForRisk(riskTier),
    });
  }
  return result;
}
