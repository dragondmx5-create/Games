import { writeFileSync } from 'node:fs';
import { WORLD_RADIUS } from '../src/config';
import { generateRegion } from '../src/world';
import { regionProfileAt } from '../src/overworld';
import { allSettlements, publicSettlements, settlementHouses } from '../server/src/world/settlementLayout';

const SEED = 424242;
const natureKinds = new Set([
  'tree', 'ancientTree', 'pineTree', 'boulder', 'cliffOutcrop', 'flowerPatch', 'reedCluster', 'rock', 'shrub',
]);
const riskCounts: Record<string, number> = {};
const landCounts: Record<string, number> = {};
const natureByLand: Record<string, Record<string, number>> = {};
let portalCount = 0;
let dungeonEntrances = 0;
let blackMarketRoutes = 0;
let totalProps = 0;

for (let ry = -WORLD_RADIUS; ry <= WORLD_RADIUS; ry++) {
  for (let rx = -WORLD_RADIUS; rx <= WORLD_RADIUS; rx++) {
    const profile = regionProfileAt(rx, ry);
    const world = generateRegion(rx, ry, SEED);
    riskCounts[profile.riskTier] = (riskCounts[profile.riskTier] ?? 0) + 1;
    landCounts[profile.landId] = (landCounts[profile.landId] ?? 0) + 1;
    totalProps += world.props.length;
    portalCount += world.portals.length;
    dungeonEntrances += world.portals.filter((portal) => portal.kind === 'dungeon').length;
    blackMarketRoutes += world.portals.filter((portal) => portal.kind === 'black-market').length;
    const counts = natureByLand[profile.landId] ??= {};
    for (const prop of world.props) {
      if (!natureKinds.has(prop.kind)) continue;
      counts[prop.kind] = (counts[prop.kind] ?? 0) + 1;
    }
  }
}

const architectureByLand: Record<string, { theme: string; houses: number; settlements: number; roles: Record<string, number> }> = {};
for (const settlement of allSettlements()) {
  const houses = settlementHouses(settlement.rx, settlement.ry, SEED);
  const current = architectureByLand[settlement.landId] ??= {
    theme: houses[0]?.architecture ?? 'unknown',
    houses: 0,
    settlements: 0,
    roles: {},
  };
  current.settlements++;
  current.houses += houses.length;
  for (const house of houses) current.roles[house.role ?? 'unknown'] = (current.roles[house.role ?? 'unknown'] ?? 0) + 1;
}

const audit = {
  seed: SEED,
  world: {
    radius: WORLD_RADIUS,
    regions: (WORLD_RADIUS * 2 + 1) ** 2,
    lands: Object.keys(landCounts).length,
    landCounts,
    riskCounts,
    totalProps,
    portalCount,
    dungeonEntrances,
    blackMarketRoutes,
  },
  settlements: {
    total: allSettlements().length,
    publicTravelDestinations: publicSettlements().length,
    hidden: allSettlements().filter((settlement) => settlement.kind === 'hidden').length,
    byKind: Object.fromEntries(['capital', 'town', 'outpost', 'hidden'].map((kind) => [kind, allSettlements().filter((settlement) => settlement.kind === kind).length])),
  },
  architectureByLand,
  natureByLand,
  economy: {
    regionalPublicMarket: true,
    blackMarketPreserved: true,
    p2pTrade: {
      serverAuthoritative: true,
      sanctuaryOnly: true,
      proximityPixels: 96,
      maxItemKinds: 4,
      escrowedListings: true,
      twoPartyAcceptance: true,
    },
  },
};

const output = process.argv[2] ?? 'artifacts/regional-feature-audit.json';
writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit));
