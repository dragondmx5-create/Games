import { describe, expect, it } from 'vitest';
import { MessageRateLimiter } from '../ws/rateLimit.js';

describe('MessageRateLimiter', () => {
  it('allows the burst capacity and rejects excess work', () => {
    const limiter = new MessageRateLimiter(3, 1, 1_000);
    expect(limiter.allow(1_000)).toBe(true);
    expect(limiter.allow(1_000)).toBe(true);
    expect(limiter.allow(1_000)).toBe(true);
    expect(limiter.allow(1_000)).toBe(false);
  });

  it('refills over server time without exceeding capacity', () => {
    const limiter = new MessageRateLimiter(2, 2, 1_000);
    expect(limiter.allow(1_000)).toBe(true);
    expect(limiter.allow(1_000)).toBe(true);
    expect(limiter.allow(1_249)).toBe(false);
    expect(limiter.allow(1_500)).toBe(true);
    expect(limiter.allow(2_500)).toBe(true);
    expect(limiter.allow(2_500)).toBe(true);
    expect(limiter.allow(2_500)).toBe(false);
  });

  it('does not refill when the clock moves backwards', () => {
    const limiter = new MessageRateLimiter(1, 10, 2_000);
    expect(limiter.allow(2_000)).toBe(true);
    expect(limiter.allow(1_000)).toBe(false);
  });
});
