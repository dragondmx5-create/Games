import { describe, expect, it } from 'vitest';
import { resolveMiningStrike } from '../world/miningDomain.js';

describe('authoritative mining transition', () => {
  const node = { maxIntegrity: 3, respawnSeconds: 60 };

  it('requires multiple server transitions and rewards only the collapsing strike', () => {
    const first = resolveMiningStrike(node, { integrity: 3, availableAtMs: 0, extractionCount: 0 }, 1_000);
    expect(first).toEqual({ integrity: 2, availableAtMs: 0, extractionCount: 0, collapsed: false });
    const second = resolveMiningStrike(node, first, 1_100);
    expect(second.collapsed).toBe(false);
    expect(second.integrity).toBe(1);
    const third = resolveMiningStrike(node, second, 1_200);
    expect(third).toEqual({ integrity: 3, availableAtMs: 61_200, extractionCount: 1, collapsed: true });
  });

  it('fails closed during cooldown and resets canonically after it expires', () => {
    expect(() => resolveMiningStrike(node, {
      integrity: 3,
      availableAtMs: 10_000,
      extractionCount: 2,
    }, 9_999)).toThrow('mining node is depleted');
    expect(resolveMiningStrike(node, {
      integrity: 0,
      availableAtMs: 10_000,
      extractionCount: 2,
    }, 10_000)).toEqual({ integrity: 2, availableAtMs: 0, extractionCount: 2, collapsed: false });
  });
});
