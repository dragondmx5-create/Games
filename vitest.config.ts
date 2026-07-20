import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // server/ is a separate npm project with its own vitest config/run
    // (needs a real Postgres test DB) — keep the two suites from colliding.
    include: ['src/**/*.test.ts'],
  },
});
