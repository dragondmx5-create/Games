import type { SettlementLocation } from '../world/settlementLayout.js';

export const MIN_CARAVAN_FARE = 3;
export const MAX_CARAVAN_FARE = 80;

export function caravanFare(source: SettlementLocation, destination: SettlementLocation): number {
  if (source.id === destination.id) return 0;
  const regionalDistance = Math.abs(source.rx - destination.rx) + Math.abs(source.ry - destination.ry);
  const landSurcharge = source.landId === destination.landId ? 0 : 6;
  const destinationSurcharge = destination.kind === 'capital' ? 2 : destination.kind === 'outpost' ? 1 : 0;
  return Math.min(MAX_CARAVAN_FARE, Math.max(MIN_CARAVAN_FARE, 2 + regionalDistance * 2 + landSurcharge + destinationSurcharge));
}

export function isPublicTravelSettlement(settlement: SettlementLocation): boolean {
  return settlement.kind !== 'hidden';
}
