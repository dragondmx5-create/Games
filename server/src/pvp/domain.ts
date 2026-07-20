import { ITEM_CATALOG, type ItemId } from '../economy/catalog.js';
import { planDeathLoss } from '../combat/domain.js';
import type { InventorySnapshot, InventoryStacks } from '../inventory/types.js';
import type { ResourceLandId } from '../world/regionResourceProfiles.js';

export type PvpRiskTier = 'fracture' | 'lost';

export interface PvpDeathSettlementPlan {
  victimDeltas: InventoryStacks;
  killerDeltas: InventoryStacks;
  transferred: InventoryStacks;
  destroyed: InventoryStacks;
  vaultCrystals: number;
  victimProgressionLevel: number;
  victimEquippedWeapon: ItemId;
}

const CAPITALS: Readonly<Record<ResourceLandId, { rx: number; ry: number }>> = Object.freeze({
  witchlands: { rx: -4, ry: -3 },
  'green-land': { rx: 0, ry: 0 },
  rainforest: { rx: 4, ry: -3 },
  frostlands: { rx: -4, ry: 3 },
  'sunscorched-desert': { rx: 0, ry: 4 },
  'cinder-coast': { rx: 4, ry: 3 },
});

export function pvpRoomKey(worldSeed: number, gateId: string, riskTier: PvpRiskTier): string {
  if (!Number.isSafeInteger(worldSeed) || !/^[a-z0-9-]{3,80}$/.test(gateId)) throw new Error('invalid PvP room identity');
  return `pvp:v1:${worldSeed}:${riskTier}:${gateId}`;
}

export function capitalRegionForLand(landId: ResourceLandId): { rx: number; ry: number } {
  return { ...CAPITALS[landId] };
}

function add(stack: Record<string, number>, itemId: string, amount: number): void {
  if (!amount) return;
  stack[itemId] = (stack[itemId] ?? 0) + amount;
}

/**
 * Computes a deterministic, fail-closed transfer from canonical inventories.
 * Fracture uses combat-domain partial loss; Lost uses full-loot rules. Items
 * that cannot fit the killer's canonical stack are destroyed and recorded,
 * never duplicated or silently retained by the victim. 20% of dropped
 * crystals is routed to Vault layer 0; the rest may transfer to the killer.
 */
export function planPvpDeathSettlement(
  victim: InventorySnapshot,
  killer: InventorySnapshot,
  riskTier: PvpRiskTier,
): PvpDeathSettlementPlan {
  const loss = planDeathLoss(victim, riskTier);
  const transferred: Record<string, number> = {};
  const destroyed: Record<string, number> = {};
  let vaultCrystals = 0;

  for (const [rawItemId, rawAmount] of Object.entries(loss.dropped)) {
    const itemId = rawItemId as ItemId;
    const amount = rawAmount ?? 0;
    if (amount <= 0) continue;
    if (itemId === 'currency.crystal') {
      vaultCrystals = Math.ceil(amount * 0.2);
      const available = amount - vaultCrystals;
      const capacity = Math.max(0, ITEM_CATALOG[itemId].maxStack - (killer.stacks[itemId] ?? 0));
      const moved = Math.min(available, capacity);
      add(transferred, itemId, moved);
      add(destroyed, itemId, available - moved);
      continue;
    }
    const definition = ITEM_CATALOG[itemId];
    const capacity = definition.unique
      ? ((killer.stacks[itemId] ?? 0) > 0 ? 0 : 1)
      : Math.max(0, definition.maxStack - (killer.stacks[itemId] ?? 0));
    const moved = Math.min(amount, capacity);
    add(transferred, itemId, moved);
    add(destroyed, itemId, amount - moved);
  }

  const victimDeltas = Object.fromEntries(
    Object.entries(loss.dropped).filter(([, amount]) => (amount ?? 0) > 0).map(([itemId, amount]) => [itemId, -(amount ?? 0)]),
  ) as InventoryStacks;

  return {
    victimDeltas,
    killerDeltas: transferred as InventoryStacks,
    transferred: transferred as InventoryStacks,
    destroyed: destroyed as InventoryStacks,
    vaultCrystals,
    victimProgressionLevel: loss.progressionLevel,
    victimEquippedWeapon: loss.equippedWeapon,
  };
}
