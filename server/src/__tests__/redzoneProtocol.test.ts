import { describe, expect, it } from 'vitest';
import { parseRedZoneClientMessage } from '../redzone/protocol.js';

describe('red zone protocol', () => {
  it('accepts only finite movement and attack messages', () => {
    expect(parseRedZoneClientMessage('{"type":"move","dx":1,"dy":-1}')).toEqual({ type: 'move', dx: 1, dy: -1 });
    expect(parseRedZoneClientMessage('{"type":"attack"}')).toEqual({ type: 'attack' });
    expect(parseRedZoneClientMessage('{"type":"move","dx":"1","dy":0}')).toBeNull();
    expect(parseRedZoneClientMessage('not-json')).toBeNull();
  });
});
