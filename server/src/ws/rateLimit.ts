/** Small in-process token bucket for authenticated WebSocket message floods.
 * Gameplay validation still owns semantic rate limits (movement speed and
 * attack cooldown); this guard bounds parser/dispatch work per connection. */
export class MessageRateLimiter {
  private tokens: number;
  private lastRefillAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now = Date.now(),
  ) {
    if (!Number.isFinite(capacity) || capacity <= 0) throw new Error('capacity must be positive');
    if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) throw new Error('refill rate must be positive');
    this.tokens = capacity;
    this.lastRefillAt = now;
  }

  allow(now = Date.now(), cost = 1): boolean {
    if (!Number.isFinite(cost) || cost <= 0) return false;
    const elapsedMs = Math.max(0, now - this.lastRefillAt);
    this.lastRefillAt = Math.max(this.lastRefillAt, now);
    this.tokens = Math.min(this.capacity, this.tokens + elapsedMs * this.refillPerSecond / 1_000);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
