import { describe, expect, it } from 'vitest';
import { parseCombatClientMessage } from '../combat/protocol.js';

describe('combat websocket protocol', () => {
  it('accepts bounded attack and bag commands', () => {
    expect(parseCombatClientMessage({ type: 'attack', attackId: 'attack:123456', ability: false, facing: 1.2 })?.type).toBe('attack');
    expect(parseCombatClientMessage({ type: 'claim_bag', bagId: '123e4567-e89b-12d3-a456-426614174000', claimId: 'claim:123456' })?.type).toBe('claim_bag');
  });

  it('rejects arbitrary client damage and malformed identifiers', () => {
    expect(parseCombatClientMessage({ type: 'attack', attackId: 'x', ability: false, facing: 0, damage: 999 })).toBeNull();
    expect(parseCombatClientMessage({ type: 'claim_bag', bagId: 'not-a-uuid', claimId: 'claim:123456' })).toBeNull();
  });
});
