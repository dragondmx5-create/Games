// Trust-but-record save auditing — see the SaveAudit model comment in
// prisma/schema.prisma for why this flags instead of rejecting. Runs on
// every PUT /api/save that replaces an existing save; failures here must
// never break the save itself (fire-and-forget from the route).
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import type { SaveData } from './schema.js';

// materials valued the same way the client's lootBagValue() does, so the
// gain-rate heuristic tracks real wealth, not just raw crystals — kept in
// sync by hand like the rest of the save-schema mirror
const MATERIAL_VALUE = { crystal: 1, shroom: 1, wood: 1, iron: 2, meat: 2, hide: 3, feathers: 3 } as const;

// lifetime totals that can only ever grow during normal play. NEW GAME on a
// fresh device legitimately lowers them (they reseed from that device's
// localStorage), which is exactly why a regression is an audit row, not a
// rejection.
const MONOTONIC_STATS = ['deaths', 'kills', 'totalPlaySeconds', 'itemsFound', 'lootLostForever', 'sessions'] as const;

// sustained wealth growth above this many crystal-equivalents per second of
// wall-clock time between saves is beyond anything the game can pay out
// legitimately (vault jackpots arrive in one save, so only flag when the
// elapsed window is long enough for "sustained" to mean something)
const MAX_GAIN_PER_SECOND = 25;
const MIN_WINDOW_SECONDS = 30;

function wealth(p: SaveData['player']): number {
  return (
    p.loot +
    p.shrooms * MATERIAL_VALUE.shroom +
    p.wood * MATERIAL_VALUE.wood +
    p.iron * MATERIAL_VALUE.iron +
    p.meat * MATERIAL_VALUE.meat +
    p.hide * MATERIAL_VALUE.hide +
    p.feathers * MATERIAL_VALUE.feathers
  );
}

export interface AuditEntry {
  kind: 'stats_regression' | 'implausible_gain';
  detail: Record<string, unknown>;
}

/** pure comparison — exported separately from the write so it's unit-testable */
export function detectSaveAnomalies(prev: SaveData, next: SaveData, elapsedSeconds: number): AuditEntry[] {
  const entries: AuditEntry[] = [];

  const regressions: Record<string, { from: number; to: number }> = {};
  for (const key of MONOTONIC_STATS) {
    const from = prev.stats?.[key];
    const to = next.stats?.[key];
    if (typeof from === 'number' && typeof to === 'number' && to < from) regressions[key] = { from, to };
  }
  if (Object.keys(regressions).length > 0) {
    entries.push({ kind: 'stats_regression', detail: { regressions, elapsedSeconds } });
  }

  if (elapsedSeconds >= MIN_WINDOW_SECONDS) {
    const gained = wealth(next.player) - wealth(prev.player);
    const rate = gained / elapsedSeconds;
    if (rate > MAX_GAIN_PER_SECOND) {
      entries.push({ kind: 'implausible_gain', detail: { gained, elapsedSeconds, ratePerSecond: Math.round(rate * 100) / 100 } });
    }
  }

  return entries;
}

/** best-effort write — auditing must never fail a save */
export async function recordSaveAnomalies(userId: string, prev: SaveData, next: SaveData, prevUpdatedAt: Date): Promise<void> {
  try {
    const elapsedSeconds = Math.max(0, (Date.now() - prevUpdatedAt.getTime()) / 1000);
    const entries = detectSaveAnomalies(prev, next, elapsedSeconds);
    if (entries.length === 0) return;
    await prisma.saveAudit.createMany({
      data: entries.map((e) => ({ userId, kind: e.kind, detail: e.detail as Prisma.InputJsonValue })),
    });
  } catch {
    // swallowed on purpose — see function comment
  }
}
