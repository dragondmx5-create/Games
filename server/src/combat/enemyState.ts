export interface EnemyLifecycleRow {
  enemyId: string;
  generation: number;
  hp: number;
  respawnAt: Date | null;
}

export interface EffectiveEnemyLifecycle {
  enemyId: string;
  generation: number;
  hp: number;
  alive: boolean;
  respawnAt: string | null;
}

/**
 * Projects durable enemy state at a specific server time. Expired deaths are
 * represented as the next generation without mutating storage; the first hit
 * persists that transition under a row lock.
 */
export function effectiveEnemyLifecycle(
  row: EnemyLifecycleRow,
  maxHp: number,
  now: Date,
): EffectiveEnemyLifecycle {
  if (row.respawnAt && row.respawnAt <= now) {
    return {
      enemyId: row.enemyId,
      generation: row.generation + 1,
      hp: maxHp,
      alive: true,
      respawnAt: null,
    };
  }
  return {
    enemyId: row.enemyId,
    generation: row.generation,
    hp: Math.max(0, row.hp),
    alive: row.respawnAt === null && row.hp > 0,
    respawnAt: row.respawnAt?.toISOString() ?? null,
  };
}

/** Stable across reconnects, room eviction, process restart and replicas. */
export function enemyLifeId(enemyId: string, generation: number): string {
  if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('invalid enemy generation');
  return `${enemyId}:${generation}`;
}
