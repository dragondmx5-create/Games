import cors from 'cors';
import { env } from '../env.js';
import { originIsAllowed, parseBrowserOrigins } from './browserOrigins.js';

const allowedOrigins = parseBrowserOrigins(env.CORS_ORIGIN);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Requests without Origin are non-browser calls (health probes, server-to-server).
    if (!origin || originIsAllowed(origin, allowedOrigins)) {
      callback(null, true);
      return;
    }
    callback(new Error('origin not allowed by CORS'));
  },
  credentials: true,
});
