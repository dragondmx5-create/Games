import { describe, expect, it } from 'vitest';
import { parsePvpClientMessage } from '../pvp/protocol.js';

describe('authoritative PvP protocol', () => {
  it('accepts normalized movement and intent-only attacks', () => {
    expect(parsePvpClientMessage('{"type":"move","dx":1,"dy":-1}')).toEqual({ type: 'move', dx: 1, dy: -1 });
    expect(parsePvpClientMessage('{"type":"attack","ability":true,"facing":1.5}')).toEqual({ type: 'attack', ability: true, facing: 1.5 });
  });

  it('rejects client-authored combat fields and invalid numeric input', () => {
    expect(parsePvpClientMessage('{"type":"move","dx":2,"dy":0}')).toBeNull();
    expect(parsePvpClientMessage('{"type":"attack","ability":true,"facing":99}')).toBeNull();
    expect(parsePvpClientMessage('{"type":"damage","amount":9999}')).toBeNull();
    expect(parsePvpClientMessage('{"type":"attack","ability":false,"facing":0,"damage":9999}')).toBeNull();
    expect(parsePvpClientMessage('not-json')).toBeNull();
  });
});
