import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_ISSUER: z.string().min(1).default('undral-api'),
  JWT_AUDIENCE: z.string().min(1).default('undral-game'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().min(1),
  PORT: z.coerce.number().default(8787),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TRUST_PROXY: z.string().default('false'),
  // shared secret for the internal service-to-service API (server/src/internal/)
  // — a future crypto/token layer authenticates with this, never with a user
  // JWT or direct DB access. Deliberately separate from JWT_ACCESS_SECRET so
  // rotating one never affects the other.
  INTERNAL_API_KEY: z.string().min(24),
});

// Fail fast on boot rather than surfacing a confusing error on the first request.
export const env = schema.parse(process.env);
