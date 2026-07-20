import type { ItemId } from '../economy/catalog.js';
import type { ResourceLandId } from '../world/regionResourceProfiles.js';

export type UnderworldOfferId = 'contraband-cache' | 'lost-map' | 'clean-papers' | 'dungeon-key' | 'anonymous-contract';

export interface UnderworldOffer {
  id: UnderworldOfferId;
  label: string;
  description: string;
  crystalCost: number;
  reputationRequired: number;
  stockRule: 'always' | 'rotating' | 'rare';
}

export const UNDERWORLD_OFFERS: readonly UnderworldOffer[] = [
  { id: 'contraband-cache', label: 'Contraband Cache', description: 'A sealed cache with source-land materials.', crystalCost: 14, reputationRequired: 0, stockRule: 'always' },
  { id: 'lost-map', label: 'Lost Territory Map', description: 'Reveals the source land Lost Territory route.', crystalCost: 20, reputationRequired: 10, stockRule: 'rotating' },
  { id: 'clean-papers', label: 'Clean Papers', description: 'Protects three future smuggler-route inspections.', crystalCost: 12, reputationRequired: 5, stockRule: 'always' },
  { id: 'dungeon-key', label: 'Forbidden Dungeon Key', description: 'A server-owned key for a sealed Dungeon cache.', crystalCost: 28, reputationRequired: 20, stockRule: 'rare' },
  { id: 'anonymous-contract', label: 'Anonymous Contract', description: 'A server-owned contract awaiting authoritative Dungeon completion.', crystalCost: 8, reputationRequired: 15, stockRule: 'rotating' },
] as const;

export const MARKET_ROUTE_REGIONS: Readonly<Record<ResourceLandId, { rx: number; ry: number }>> = Object.freeze({
  witchlands: { rx: -5, ry: -5 },
  'green-land': { rx: -1, ry: -2 },
  rainforest: { rx: 5, ry: -5 },
  frostlands: { rx: -5, ry: 5 },
  'sunscorched-desert': { rx: 1, ry: 2 },
  'cinder-coast': { rx: 5, ry: 5 },
});

export const LOST_ROUTE_REGIONS: Readonly<Record<ResourceLandId, { rx: number; ry: number }>> = Object.freeze({
  witchlands: { rx: -1, ry: -5 },
  'green-land': { rx: 0, ry: -4 },
  rainforest: { rx: 3, ry: -5 },
  frostlands: { rx: -1, ry: 5 },
  'sunscorched-desert': { rx: 1, ry: 5 },
  'cinder-coast': { rx: 3, ry: 5 },
});

export function currentWorldDay(now = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}

export function availableUnderworldOffers(worldDay: number, reputation: number): UnderworldOffer[] {
  return UNDERWORLD_OFFERS.filter((offer, index) => {
    if (offer.reputationRequired > reputation) return false;
    if (offer.stockRule === 'always') return true;
    if (offer.stockRule === 'rare') return (worldDay + index) % 5 === 0;
    return (worldDay + index) % 2 === 0;
  });
}

export function contrabandRewards(landId: ResourceLandId): Partial<Record<ItemId, number>> {
  const reward: Partial<Record<ItemId, number>> = { 'container.supply_crate': 1 };
  if (landId === 'frostlands' || landId === 'sunscorched-desert') reward['material.iron'] = 3;
  else if (landId === 'rainforest' || landId === 'witchlands') reward['consumable.shroom'] = 3;
  else reward['material.wood'] = 4;
  return reward;
}
