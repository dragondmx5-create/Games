import type { LandId } from './types';

export interface BlackMarketRouteState {
  landId: LandId;
  discovered: boolean;
  reputationRequired: number;
  entryFee: number;
}

export interface BlackMarketOffer {
  id: string;
  label: string;
  description: string;
  crystalCost: number;
  reputationRequired: number;
  stockRule: 'always' | 'rotating' | 'rare';
}

export const BLACK_MARKET_OFFERS: readonly BlackMarketOffer[] = [
  { id: 'contraband-cache', label: 'Contraband Cache', description: 'A sealed cache with region-biased rare materials.', crystalCost: 14, reputationRequired: 0, stockRule: 'always' },
  { id: 'lost-map', label: 'Lost Territory Map', description: 'Reveals one hidden route or landmark in a Lost Territory.', crystalCost: 20, reputationRequired: 10, stockRule: 'rotating' },
  { id: 'clean-papers', label: 'Clean Papers', description: 'Temporarily reduces inspection risk on smuggler routes.', crystalCost: 12, reputationRequired: 5, stockRule: 'always' },
  { id: 'dungeon-key', label: 'Forbidden Dungeon Key', description: 'Unlocks a sealed room in a regional dungeon run.', crystalCost: 28, reputationRequired: 20, stockRule: 'rare' },
  { id: 'anonymous-contract', label: 'Anonymous Contract', description: 'A high-risk PvPvE objective with an underworld payout.', crystalCost: 8, reputationRequired: 15, stockRule: 'rotating' },
] as const;

export function defaultBlackMarketRoutes(): BlackMarketRouteState[] {
  const landIds: LandId[] = ['witchlands', 'green-land', 'rainforest', 'frostlands', 'sunscorched-desert', 'cinder-coast'];
  return landIds.map((landId) => ({
    landId,
    discovered: landId === 'green-land',
    reputationRequired: landId === 'green-land' ? 0 : 5,
    entryFee: landId === 'green-land' ? 2 : 4,
  }));
}

export function rotatingOffers(worldDay: number, reputation: number): BlackMarketOffer[] {
  return BLACK_MARKET_OFFERS.filter((offer, index) => {
    if (offer.reputationRequired > reputation) return false;
    if (offer.stockRule === 'always') return true;
    if (offer.stockRule === 'rare') return (worldDay + index) % 5 === 0;
    return (worldDay + index) % 2 === 0;
  });
}
