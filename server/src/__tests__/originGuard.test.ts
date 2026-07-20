import { describe, expect, it } from 'vitest';
import { parseBrowserOrigins } from '../middleware/browserOrigins.js';
import { isTrustedBrowserOrigin } from '../middleware/originGuard.js';

describe('browser origin validation', () => {
  const expected = 'https://game.example, https://app.game.example, capacitor://app.game.example';

  it('accepts each configured browser/mobile origin and rejects unknown origins', () => {
    expect(isTrustedBrowserOrigin('https://game.example', expected, true)).toBe(true);
    expect(isTrustedBrowserOrigin('https://app.game.example', expected, true)).toBe(true);
    expect(isTrustedBrowserOrigin('capacitor://app.game.example', expected, true)).toBe(true);
    expect(isTrustedBrowserOrigin('https://evil.example', expected, true)).toBe(false);
  });

  it('normalizes whitespace, trailing slashes and duplicate entries', () => {
    expect(parseBrowserOrigins(' https://game.example/,https://game.example, capacitor://localhost ')).toEqual([
      'https://game.example',
      'capacitor://localhost',
    ]);
  });

  it('rejects missing Origin in production and permits non-browser local tooling outside production', () => {
    expect(isTrustedBrowserOrigin(undefined, expected, true)).toBe(false);
    expect(isTrustedBrowserOrigin(undefined, expected, false)).toBe(true);
  });
});
