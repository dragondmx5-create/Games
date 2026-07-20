import { describe, expect, it } from 'vitest';
import { shouldRetryRequest } from '../api';

describe('REST reliability policy', () => {
  it('retries reads and explicitly idempotent mutations on transient failures', () => {
    expect(shouldRetryRequest('GET', 503)).toBe(true);
    expect(shouldRetryRequest('HEAD', 0)).toBe(true);
    expect(shouldRetryRequest('POST', 503)).toBe(false);
    expect(shouldRetryRequest('POST', 503, true)).toBe(true);
    expect(shouldRetryRequest('POST', 408, true)).toBe(true);
    expect(shouldRetryRequest('POST', 409, true)).toBe(false);
    expect(shouldRetryRequest('GET', 400)).toBe(false);
  });
});
