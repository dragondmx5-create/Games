import { describe, expect, it } from 'vitest';
import { reconnectDelayMs } from '../worldPresence';

describe('world reconnect reliability', () => {
  it('uses bounded exponential backoff with jitter', () => {
    expect(reconnectDelayMs(0, () => 0.5)).toBe(1000);
    expect(reconnectDelayMs(3, () => 0.5)).toBe(8000);
    expect(reconnectDelayMs(20, () => 0.5)).toBe(15000);
    expect(reconnectDelayMs(2, () => 0)).toBe(3000);
  });
});
