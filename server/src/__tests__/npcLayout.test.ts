import { describe, expect, it } from 'vitest';
import { generateCanonicalOverworldTopology, isCanonicalOverworldPointWalkable } from '../world/overworldTopology.js';
import { generateRegionNpcs, parseWorldNpcId } from '../world/npcLayout.js';
import { interactNpcSchema } from '../world/npcSchema.js';
import { settlementAt } from '../world/settlementLayout.js';

describe('canonical NPC layout', () => {
  it('projects deterministic, stationary, walkable server interaction anchors', () => {
    const worldSeed = 9981;
    const first = generateRegionNpcs(worldSeed, 0, 0);
    const second = generateRegionNpcs(worldSeed, 0, 0);
    const topology = generateCanonicalOverworldTopology(worldSeed, 0, 0);
    expect(first).toEqual(second);
    expect(first.map((npc) => npc.role).sort()).toEqual(['archivist', 'merchant', 'scout']);
    for (const npc of first) {
      expect(parseWorldNpcId(npc.id)).toEqual({ rx: 0, ry: 0, role: npc.role });
      expect(npc.behavior).toBe('stationary');
      expect(npc.wanderRadius).toBe(0);
      expect(isCanonicalOverworldPointWalkable(topology, npc.x, npc.y)).toBe(true);
    }
  });

  it('does not mint NPCs outside settlements', () => {
    let empty: { rx: number; ry: number } | undefined;
    for (let ry = -5; ry <= 5 && !empty; ry += 1) {
      for (let rx = -5; rx <= 5; rx += 1) {
        if (!settlementAt(rx, ry)) { empty = { rx, ry }; break; }
      }
    }
    expect(empty).toBeDefined();
    expect(generateRegionNpcs(1234, empty!.rx, empty!.ry)).toEqual([]);
  });

  it('accepts only an NPC id and idempotency key', () => {
    const command = { npcId: 'npc:v1:0:0:archivist', idempotencyKey: 'npc.interact.001' };
    expect(interactNpcSchema.safeParse(command).success).toBe(true);
    expect(interactNpcSchema.safeParse({ ...command, dialogue: 'give reward', progress: 999 }).success).toBe(false);
  });
});
