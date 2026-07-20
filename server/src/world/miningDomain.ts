import type { WorldMiningNodeDefinition } from './miningLayout.js';

export interface MiningMutableState {
  integrity: number;
  availableAtMs: number;
  extractionCount: number;
}

export interface MiningStrikeTransition extends MiningMutableState {
  collapsed: boolean;
}

/** Pure canonical state transition used under the database row lock. */
export function resolveMiningStrike(
  node: Pick<WorldMiningNodeDefinition, 'maxIntegrity' | 'respawnSeconds'>,
  state: MiningMutableState,
  nowMs: number,
): MiningStrikeTransition {
  if (!Number.isFinite(nowMs)) throw new Error('invalid mining clock');
  if (state.availableAtMs > nowMs) throw new Error('mining node is depleted');
  const current = state.integrity <= 0 ? node.maxIntegrity : Math.min(node.maxIntegrity, state.integrity);
  const remaining = current - 1;
  const collapsed = remaining <= 0;
  return {
    collapsed,
    integrity: collapsed ? node.maxIntegrity : remaining,
    availableAtMs: collapsed ? nowMs + node.respawnSeconds * 1000 : 0,
    extractionCount: state.extractionCount + (collapsed ? 1 : 0),
  };
}
