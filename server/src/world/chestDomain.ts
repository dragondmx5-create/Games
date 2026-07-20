import { createHash } from 'node:crypto';
import { ITEM_CATALOG, type ItemId } from '../economy/catalog.js';
import type { InventorySnapshot, InventoryStacks } from '../inventory/types.js';
import type { CombatRiskTier } from '../combat/catalog.js';

interface ChestDrop {
  itemId: ItemId;
  chance: number;
  min: number;
  max: number;
}

const CHEST_DROPS: readonly ChestDrop[] = [
  { itemId: 'currency.crystal', chance: 0.65, min: 2, max: 5 },
  { itemId: 'consumable.shroom', chance: 0.4, min: 2, max: 4 },
  { itemId: 'material.wood', chance: 0.35, min: 2, max: 5 },
  { itemId: 'material.iron', chance: 0.3, min: 1, max: 3 },
  { itemId: 'material.meat', chance: 0.25, min: 2, max: 4 },
  { itemId: 'material.hide', chance: 0.15, min: 1, max: 2 },
  { itemId: 'material.feathers', chance: 0.15, min: 1, max: 2 },
  { itemId: 'weapon.chitin', chance: 0.1, min: 1, max: 1 },
];

function randomFor(key: string): () => number {
  let state = createHash('sha256').update(key).digest().readUInt32LE(0);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function riskMultiplier(riskTier: CombatRiskTier): number {
  if (riskTier === 'frontier') return 1;
  if (riskTier === 'fracture') return 1.35;
  if (riskTier === 'lost') return 1.75;
  return 0.8;
}

export function rollWorldChestRewards(key: string, riskTier: CombatRiskTier): InventoryStacks {
  const rand = randomFor(key);
  const multiplier = riskMultiplier(riskTier);
  const rewards: InventoryStacks = {};
  for (const drop of CHEST_DROPS) {
    if (rand() >= Math.min(0.95, drop.chance * multiplier)) continue;
    const base = drop.min + Math.floor(rand() * (drop.max - drop.min + 1));
    const amount = ITEM_CATALOG[drop.itemId].unique ? 1 : Math.max(1, Math.round(base * multiplier));
    rewards[drop.itemId] = (rewards[drop.itemId] ?? 0) + amount;
  }
  return rewards;
}

export function filterWorldChestRewards(snapshot: InventorySnapshot, rewards: InventoryStacks): InventoryStacks {
  const filtered: InventoryStacks = {};
  for (const [itemId, amount] of Object.entries(rewards) as Array<[ItemId, number]>) {
    if (amount <= 0) continue;
    if (ITEM_CATALOG[itemId].unique && (snapshot.stacks[itemId] ?? 0) > 0) continue;
    filtered[itemId] = amount;
  }
  return filtered;
}
