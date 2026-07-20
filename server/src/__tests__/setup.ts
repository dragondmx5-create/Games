// Runs before any test file imports app/env/db code, so process.env is
// populated before env.ts's schema.parse(process.env) executes. Points at a
// separate `undral_test` database — see README for how to create/migrate it.
process.env.DATABASE_URL ??= 'postgresql://undral:undral_dev@localhost:5432/undral_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-characters';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.JWT_ISSUER ??= 'undral-api';
process.env.JWT_AUDIENCE ??= 'undral-game';
process.env.JWT_REFRESH_TTL_DAYS ??= '30';
process.env.COOKIE_SECURE ??= 'false';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';
process.env.INTERNAL_API_KEY ??= 'test-internal-api-key-min-24-chars';
process.env.TRUST_PROXY ??= 'false';
process.env.NODE_ENV = 'test';
