import morgan from 'morgan';
import { RequestHandler } from 'express';
import { env } from '../env.js';

// 'combined' in prod (includes remote addr/referrer/UA, useful behind a
// reverse proxy log aggregator), terse 'dev' locally, silent in tests —
// vitest's own output shouldn't be interleaved with per-request noise
export const requestLogger: RequestHandler = morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: () => env.NODE_ENV === 'test',
});
