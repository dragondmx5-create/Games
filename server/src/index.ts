import http from 'node:http';
import { env } from './env.js';
import { createApp } from './app.js';
import { attachPvp } from './pvp/socket.js';
import { stopAllPvpRooms } from './pvp/rooms.js';
import { attachWorldPresence } from './world/socket.js';
import { prisma } from './db.js';
import { startRefreshTokenCleanup } from './auth/cleanup.js';
import { worldCombatCoordinator } from './combat/coordinator.js';

const server = http.createServer(createApp());
// Bound slow or abandoned HTTP connections so mobile network churn cannot
// retain request state indefinitely or exhaust the socket pool.
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1_000;
const pvpWss = attachPvp(server);
const worldWss = attachWorldPresence(server);
const cleanupTimer = startRefreshTokenCleanup();

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`undral-server listening on :${env.PORT}`);
});

// closes cleanly on a deploy/restart instead of dropping in-flight HTTP
// requests and WebSocket connections mid-response — matters once this runs
// under something that sends SIGTERM on redeploy (systemd, Docker, pm2)
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`${signal} received, shutting down...`);
  clearInterval(cleanupTimer);
  for (const ws of pvpWss.clients) ws.close(1001, 'server shutting down');
  for (const ws of worldWss.clients) ws.close(1001, 'server shutting down');
  pvpWss.close();
  stopAllPvpRooms();
  worldWss.close();
  worldCombatCoordinator.stop();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // don't hang forever if a socket refuses to close
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
