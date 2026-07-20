import { describe, expect, it } from 'vitest';
import { CAPITAL_REGIONS } from '../../server/src/world/landLocations';
import {
  LAND_DEFINITIONS,
  ZONE_RULES,
  getDungeon,
  landAt,
  regionProfileAt,
  regionsForLand,
  routeFeaturesForLand,
  rotatingOffers,
} from '../overworld';
import { WORLD_RADIUS } from '../config';

describe('six-land overworld registry', () => {
  it('defines six distinct lands with a capital, towns, wildlife, dungeons, and danger routes', () => {
    expect(LAND_DEFINITIONS).toHaveLength(6);
    expect(new Set(LAND_DEFINITIONS.map((land) => land.id)).size).toBe(6);
    for (const land of LAND_DEFINITIONS) {
      expect(land.capital.kind).toBe('capital');
      expect(land.settlements.length).toBeGreaterThanOrEqual(4);
      expect(land.wildlife.passive.length).toBeGreaterThan(0);
      expect(land.wildlife.predators.length).toBeGreaterThan(0);
      expect(land.dungeonIds.length).toBeGreaterThanOrEqual(2);
      for (const dungeonId of land.dungeonIds) expect(getDungeon(dungeonId).landId).toBe(land.id);
      const routes = routeFeaturesForLand(land.id);
      expect(routes.redGate.kind).toBe('red-gate');
      expect(routes.blackGate.kind).toBe('black-gate');
      expect(routes.blackMarket.kind).toBe('black-market-route');
    }
  });

  it('assigns every bounded region to exactly one land', () => {
    for (let ry = -WORLD_RADIUS; ry <= WORLD_RADIUS; ry++) {
      for (let rx = -WORLD_RADIUS; rx <= WORLD_RADIUS; rx++) {
        const profile = regionProfileAt(rx, ry);
        expect(profile.landId).toBe(landAt(rx, ry).id);
        expect(profile.key).toBe(`${rx},${ry}`);
        expect(profile.regionName.length).toBeGreaterThan(2);
      }
    }
  });

  it('keeps settlements safe while exposing frontier, fracture, and lost territory in every land', () => {
    for (const land of LAND_DEFINITIONS) {
      expect(regionProfileAt(land.capital.rx, land.capital.ry).riskTier).toBe('sanctuary');
      const tiers = new Set(regionsForLand(land.id, WORLD_RADIUS).map((region) => region.riskTier));
      expect(tiers.has('sanctuary')).toBe(true);
      expect(tiers.has('frontier')).toBe(true);
      expect(tiers.has('fracture')).toBe(true);
      expect(tiers.has('lost')).toBe(true);
    }
  });

  it('uses original risk rules instead of color names as world terminology', () => {
    expect(ZONE_RULES.sanctuary.displayName).toBe('Sanctuary');
    expect(ZONE_RULES.frontier.displayName).toBe('Frontier');
    expect(ZONE_RULES.fracture.displayName).toBe('Fracture');
    expect(ZONE_RULES.lost.displayName).toBe('Lost Territory');
  });

  it('rotates black-market stock deterministically and respects reputation', () => {
    expect(rotatingOffers(0, 0).every((offer) => offer.reputationRequired === 0)).toBe(true);
    expect(rotatingOffers(10, 100)).toEqual(rotatingOffers(10, 100));
    expect(rotatingOffers(10, 100).length).toBeGreaterThan(rotatingOffers(10, 0).length);
  });
  it('shares capital coordinates with the authoritative server relocation map', () => {
    for (const land of LAND_DEFINITIONS) {
      expect(CAPITAL_REGIONS[land.id]).toEqual({ rx: land.capital.rx, ry: land.capital.ry });
    }
  });

});
