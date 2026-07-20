import { describe, expect, it } from 'vitest';
import {
  dungeonChestReward,
  dungeonContractReward,
  dungeonEnemyReward,
  dungeonMovementMultiplier,
  moveDungeonWithMechanics,
  spawnDungeonEntities,
  tickDungeonEnemies,
  tickDungeonHazards,
} from '../dungeon/domain.js';
import { generateDungeonTopology, tileCenter } from '../dungeon/topology.js';

describe('authoritative Dungeon domain', () => {
  it('spawns deterministic server-owned enemies and key-gated final chest', () => {
    const topology = generateDungeonTopology('caldera-foundry', 5, 77123);
    const first = spawnDungeonEntities(topology, 8, true, true);
    const second = spawnDungeonEntities(topology, 8, true, true);
    expect(first).toEqual(second);
    expect(first.enemies.some((enemy) => enemy.boss)).toBe(true);
    expect(first.chests.some((chest) => chest.kind === 'forbidden')).toBe(true);
    expect(spawnDungeonEntities(topology, 8, true, false).chests.some((chest) => chest.kind === 'forbidden')).toBe(false);
  });

  it('ticks enemy movement and damage from elapsed server time', () => {
    const topology = generateDungeonTopology('old-crown-mine', 1, 4422);
    const player = tileCenter(topology.entrance);
    const enemy = {
      id: 'test-enemy', kind: 'bug' as const, boss: false,
      x: player.x + 8, y: player.y, hp: 5, maxHp: 5,
      damage: 3, speed: 30, attackReadyAt: 0, alive: true,
    };
    const result = tickDungeonEnemies(topology, [enemy], { ...player, hp: 10 }, 100, 0, 1000);
    expect(result.playerHp).toBe(7);
    expect(result.damageTaken).toBe(3);
    expect(result.enemies[0].attackReadyAt).toBeGreaterThan(1000);
  });

  it('derives rewards only from canonical entity identity', () => {
    const topology = generateDungeonTopology('kingless-tomb', 6, 9911);
    const spawned = spawnDungeonEntities(topology, 10, true, true);
    const enemy = spawned.enemies[0];
    const chest = spawned.chests[0];
    expect(dungeonEnemyReward(enemy, 6)).toEqual(dungeonEnemyReward(enemy, 6));
    expect(dungeonChestReward(chest, 6)).toEqual(dungeonChestReward(chest, 6));
    expect(dungeonContractReward(6)).toEqual({ 'currency.crystal': 22, 'container.supply_crate': 1 });
  });

  it('owns floor mechanics, elite affixes, and hazard-safe entity placement', () => {
    let topology = generateDungeonTopology('old-crown-mine', 4, 1);
    let spawned = spawnDungeonEntities(topology, 6, false, false);
    for (let seed = 2; seed < 300 && !spawned.enemies.some((enemy) => enemy.elite); seed += 1) {
      topology = generateDungeonTopology('old-crown-mine', 4, seed);
      spawned = spawnDungeonEntities(topology, 6, false, false);
    }
    expect(spawned.enemies.some((enemy) => enemy.elite && enemy.affix !== 'none')).toBe(true);
    for (const entity of [...spawned.enemies, ...spawned.chests]) {
      expect(topology.hazards.every((hazard) => Math.hypot(entity.x - hazard.x, entity.y - hazard.y) >= hazard.radius + 10)).toBe(true);
    }
    const slow = topology.hazards.find((hazard) => hazard.slowMultiplier < 1);
    if (slow) expect(dungeonMovementMultiplier(topology, slow.x, slow.y)).toBeLessThan(1);
  });

  it('applies elapsed hazard ticks, clears cadence on exit, and cannot be frozen by silence', () => {
    let topology = generateDungeonTopology('caldera-foundry', 5, 1);
    for (let seed = 2; seed < 300 && !topology.hazards.some((hazard) => hazard.damage > 0); seed += 1) {
      topology = generateDungeonTopology('caldera-foundry', 5, seed);
    }
    const hazard = topology.hazards.find((candidate) => candidate.damage > 0)!;
    const first = tickDungeonHazards(topology, { x: hazard.x, y: hazard.y, hp: 20 }, 0, null, null, 1_000);
    expect(first.damageTaken).toBeGreaterThan(0);
    expect(first.readyAt).toBe(1_000 + hazard.cooldownMs);

    const waiting = tickDungeonHazards(topology, { x: hazard.x, y: hazard.y, hp: first.playerHp }, 0, first.hazardId, first.readyAt, first.readyAt! - 1);
    expect(waiting.damageTaken).toBe(0);

    const delayed = tickDungeonHazards(
      topology,
      { x: hazard.x, y: hazard.y, hp: 20 },
      0,
      first.hazardId,
      first.readyAt,
      first.readyAt! + hazard.cooldownMs * 3,
    );
    expect(delayed.damageTaken).toBeGreaterThan(hazard.damage);
    expect(delayed.readyAt).toBe(first.readyAt! + hazard.cooldownMs * 4);

    const entrance = tileCenter(topology.entrance);
    const left = tickDungeonHazards(topology, { ...entrance, hp: 20 }, 0, delayed.hazardId, delayed.readyAt, delayed.readyAt! + 1);
    expect(left).toEqual({ playerHp: 20, damageTaken: 0, readyAt: null, hazardId: null });
  });

  it('does not carry an unrelated hazard cooldown into a newly entered hazard', () => {
    const base = generateDungeonTopology('caldera-foundry', 5, 2718);
    const topology = {
      ...base,
      hazards: [
        { id: 'hazard:a', kind: 'ember' as const, x: 80, y: 80, radius: 12, damage: 3, slowMultiplier: 1, cooldownMs: 1_000 },
        { id: 'hazard:b', kind: 'ember' as const, x: 120, y: 80, radius: 12, damage: 4, slowMultiplier: 1, cooldownMs: 1_000 },
      ],
    };
    const switched = tickDungeonHazards(topology, { x: 120, y: 80, hp: 20 }, 0, 'hazard:a', 99_000, 5_000);
    expect(switched.hazardId).toBe('hazard:b');
    expect(switched.damageTaken).toBe(4);
    expect(switched.readyAt).toBe(6_000);
  });

  it('integrates slow fields along the swept movement path', () => {
    let topology = generateDungeonTopology('old-crown-mine', 2, 1);
    for (let seed = 2; seed < 500 && !topology.hazards.some((hazard) => hazard.slowMultiplier < 1); seed += 1) {
      topology = generateDungeonTopology('old-crown-mine', 2, seed);
    }
    const hazard = topology.hazards.find((candidate) => candidate.slowMultiplier < 1)!;
    const moved = moveDungeonWithMechanics(topology, { x: hazard.x, y: hazard.y }, 20, 0);
    expect(Math.hypot(moved.x - hazard.x, moved.y - hazard.y)).toBeLessThan(20);
  });
});
