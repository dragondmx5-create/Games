import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../prisma/migrations/20260720150000_market_travel_p2p/migration.sql', import.meta.url),
  'utf8',
);

describe('market and P2P migration contract', () => {
  it('uses the same TEXT identifier type as the existing User table', () => {
    expect(migration).toContain('"sellerUserId" TEXT NOT NULL');
    expect(migration).toContain('"initiatorUserId" TEXT NOT NULL');
    expect(migration).toContain('"targetUserId" TEXT NOT NULL');
    expect(migration).not.toMatch(/"(?:sellerUserId|buyerUserId|initiatorUserId|targetUserId)" UUID/);
  });

  it('adds escrow, lookup and trade lifecycle constraints', () => {
    expect(migration).toContain('MarketListing_status_landId_unitPrice_createdAt_idx');
    expect(migration).toContain('MarketListing_sellerUserId_createCommandKey_key');
    expect(migration).toContain('PlayerTradeSession_distinct_players_check');
    expect(migration).toContain("CHECK (\"status\" IN ('pending', 'completed', 'cancelled'))");
  });
});
