import express from 'express';
import { prisma } from './db.js';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logging.js';
import { authLimiter, generalLimiter } from './middleware/rateLimit.js';
import { authRouter } from './auth/routes.js';
import { saveRouter } from './save/routes.js';
import { vaultRouter } from './vault/routes.js';
import { worldRouter } from './world/routes.js';
import { internalRouter } from './internal/routes.js';
import { inventoryRouter } from './inventory/routes.js';
import { worldResourceRouter } from './world/resourceRoutes.js';
import { underworldRouter } from './underworld/routes.js';
import { questRouter } from './quests/routes.js';
import { settlementRouter } from './world/settlementRoutes.js';
import { dungeonRouter } from './dungeon/routes.js';
import { pvpRouter } from './pvp/routes.js';
import { npcRouter } from './world/npcRoutes.js';
import { miningRouter } from './world/miningRoutes.js';
import { requireBrowserMutationOrigin } from './middleware/originGuard.js';
import { env } from './env.js';
import { travelRouter } from './travel/routes.js';
import { marketRouter } from './market/routes.js';
import { tradeRouter } from './trade/routes.js';

function trustProxySetting(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false' || value === '') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function createApp() {
  const app = express();
  app.set('trust proxy', trustProxySetting(env.TRUST_PROXY));

  // crossOriginResourcePolicy off: the game and API are different origins
  // in prod (see CORS_ORIGIN), and helmet's default would block the
  // browser from reading cross-origin API responses
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(requestLogger);
  app.use(corsMiddleware);
  // Save checkpoints can legitimately be larger than command payloads, but
  // remain explicitly capped. All other JSON endpoints use a much smaller
  // limit to reduce memory-amplification risk.
  app.use('/api/save', express.json({ limit: '1mb' }));
  app.use(express.json({ limit: '128kb' }));
  app.use(cookieParser());
  app.use(generalLimiter);
  app.use('/api', requireBrowserMutationOrigin);

  // verifies the database too — a process that's up but can't reach
  // Postgres should read as DOWN to the title screen's backendUp() check
  // and to any deploy health probe, not as a false green
  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: true });
    } catch {
      res.status(503).json({ ok: false, db: false });
    }
  });
  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/save', saveRouter);
  app.use('/api/vault', vaultRouter);
  app.use('/api/world', worldRouter);
  app.use('/api/world', worldResourceRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/underworld', underworldRouter);
  app.use('/api/quests', questRouter);
  app.use('/api/world', settlementRouter);
  app.use('/api/world', npcRouter);
  app.use('/api/world', miningRouter);
  app.use('/api/dungeon', dungeonRouter);
  app.use('/api/pvp', pvpRouter);
  app.use('/api/travel', travelRouter);
  app.use('/api/market', marketRouter);
  app.use('/api/trades', tradeRouter);
  app.use('/api/internal', internalRouter);

  app.use(errorHandler);

  return app;
}
