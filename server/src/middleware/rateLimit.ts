import rateLimit from 'express-rate-limit';
import { env } from '../env.js';

// disabled in tests — supertest fires many requests per test file against
// the same in-memory store and would otherwise trip these mid-suite
const skipInTests = () => env.NODE_ENV === 'test';

// register/login are the brute-force surface: cap attempts per IP well
// below anything a real user would hit, generously above a scripted guesser
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
});

// a light backstop for everything else — not brute-force-grade, just keeps
// one client from hammering the API
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => skipInTests() || req.originalUrl.split('?')[0] === '/api/dungeon/move',
});

// Dungeon movement is a high-frequency authoritative intent stream. It has a
// dedicated budget so it cannot consume the entire API allowance, while still
// bounding abusive clients. The client emits at most five intents per second.
export const dungeonMoveLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 360,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
});
