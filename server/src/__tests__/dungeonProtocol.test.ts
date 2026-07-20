import { describe, expect, it } from 'vitest';
import { dungeonAttackSchema, dungeonMoveSchema, startDungeonSchema } from '../dungeon/schema.js';
import { claimSchema } from '../vault/schema.js';

const runId = '550e8400-e29b-41d4-a716-446655440000';

describe('Dungeon public command schemas', () => {
  it('accepts intent with revision/idempotency but no authored coordinates', () => {
    expect(dungeonMoveSchema.parse({
      runId, expectedRevision: 4, idempotencyKey: 'dungeon-move:abc123',
      moveX: 0.5, moveY: -1, running: true, facing: 1.2, dtMs: 80,
    })).toMatchObject({ expectedRevision: 4, dtMs: 80 });
    expect(() => dungeonMoveSchema.parse({
      runId, expectedRevision: 4, idempotencyKey: 'dungeon-move:abc123',
      moveX: 0, moveY: 0, running: false, facing: 0, dtMs: 80,
      x: 500, y: 500,
    })).toThrow();
  });

  it('rejects client seed, topology, damage and reward authorship', () => {
    expect(() => startDungeonSchema.parse({
      dungeonId: 'old-crown-mine', useForbiddenKey: false, idempotencyKey: 'dungeon-start:abc123', seed: 42,
    })).toThrow();
    expect(() => dungeonAttackSchema.parse({
      runId, expectedRevision: 1, idempotencyKey: 'dungeon-attack:abc123', ability: false, facing: 0,
      damage: 999, enemyIds: ['x'], reward: { 'currency.crystal': 999 },
    })).toThrow();
  });

  it('requires bounded idempotency keys and revisions', () => {
    expect(() => dungeonAttackSchema.parse({ runId, expectedRevision: -1, idempotencyKey: 'bad', ability: false, facing: 0 })).toThrow();
  });

  it('binds a Vault claim to one exact server proof id', () => {
    expect(claimSchema.parse({ proofId: runId })).toEqual({ proofId: runId });
    expect(() => claimSchema.parse({ proofId: runId, layer: 1 })).toThrow();
    expect(() => claimSchema.parse({ proofId: 'not-a-proof' })).toThrow();
  });
});
