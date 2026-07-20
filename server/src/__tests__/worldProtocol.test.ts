import { describe, expect, it } from 'vitest';
import { parseWorldClientMessage } from '../world/protocol.js';
import { OVERWORLD_WORLD_RADIUS } from '../world/worldBounds.js';

describe('world presence protocol', () => {
  it('accepts strict position and visibility intents', () => {
    expect(parseWorldClientMessage(JSON.stringify({ type: 'position', seq: 2, rx: 0, ry: -1, x: 10, y: 20 }))).toMatchObject({ type: 'position', seq: 2 });
    expect(parseWorldClientMessage(JSON.stringify({ type: 'visibility', active: false }))).toEqual({ type: 'visibility', active: false });
  });

  it('rejects extra fields, invalid bounds and oversized frames', () => {
    expect(parseWorldClientMessage(JSON.stringify({ type: 'visibility', active: true, x: 1 }))).toBeNull();
    expect(parseWorldClientMessage(JSON.stringify({ type: 'position', seq: 0, rx: OVERWORLD_WORLD_RADIUS + 1, ry: 0, x: 0, y: 0 }))).toBeNull();
    expect(parseWorldClientMessage('x'.repeat(513))).toBeNull();
  });
});
