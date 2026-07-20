import { describe, expect, it } from 'vitest';
import { generateCanonicalOverworldTopology, isCanonicalOverworldTileWalkable } from '../world/overworldTopology.js';
import { generateRegionResourceNodes } from '../world/resourceLayout.js';
import { regionResourceProfileAt } from '../world/regionResourceProfiles.js';
import { generateRegionMiningNodes, parseMiningNodeId } from '../world/miningLayout.js';
import { strikeMiningNodeSchema } from '../world/miningSchema.js';

describe('canonical mining layout', () => {
  it('is deterministic, parseable, unique, and placed on canonical walkable tiles', () => {
    const worldSeed = 551199;
    const first = generateRegionMiningNodes(worldSeed, 0, 0);
    const second = generateRegionMiningNodes(worldSeed, 0, 0);
    const topology = generateCanonicalOverworldTopology(worldSeed, 0, 0);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(new Set(first.map((node) => node.id)).size).toBe(first.length);
    for (const node of first) {
      expect(parseMiningNodeId(node.id)).toEqual({
        worldSeed,
        rx: 0,
        ry: 0,
        kind: node.kind,
        ordinal: node.ordinal,
      });
      expect(isCanonicalOverworldTileWalkable(topology, node.tx, node.ty)).toBe(true);
      expect(node.maxIntegrity).toBeGreaterThan(1);
      expect(node.rewardMax).toBeGreaterThanOrEqual(node.rewardMin);
    }
  });

  it('does not overlap canonical harvesting nodes or portal approaches', () => {
    const worldSeed = 731771;
    const topology = generateCanonicalOverworldTopology(worldSeed, 0, 0);
    const resources = generateRegionResourceNodes(worldSeed, 0, 0, regionResourceProfileAt(0, 0));
    const nodes = generateRegionMiningNodes(worldSeed, 0, 0);
    for (const node of nodes) {
      expect(resources.every((resource) => Math.hypot(resource.tx - node.tx, resource.ty - node.ty) >= 5)).toBe(true);
      expect(topology.portals.every((portal) => Math.hypot(portal.x / 16 - node.tx, portal.y / 16 - node.ty) >= 7)).toBe(true);
    }
  });

  it('accepts intent-only strike commands and rejects client-authored rewards', () => {
    expect(strikeMiningNodeSchema.safeParse({
      nodeId: 'mine1:12345:0:0:iron_vein:0',
      expectedRevision: 4,
      idempotencyKey: 'mine.command.0001',
    }).success).toBe(true);
    expect(strikeMiningNodeSchema.safeParse({
      nodeId: 'mine1:12345:0:0:iron_vein:0',
      expectedRevision: 4,
      idempotencyKey: 'mine.command.0001',
      reward: { 'material.iron': 999 },
    }).success).toBe(false);
  });
});
