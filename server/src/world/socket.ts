import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { validateAccessToken } from '../auth/session.js';
import { registerAuthenticatedSocket } from '../auth/socketRegistry.js';
import { prisma } from '../db.js';
import { getFreshWorldPresence, joinWorldPresence, leaveWorldPresence, suspendWorldPresence, updateWorldPresence } from './presence.js';
import { claimWorldPositionSession, getPersistedWorldPosition, persistWorldPosition, type AuthoritativeWorldPosition } from './positionService.js';
import { parseWorldClientMessage } from './protocol.js';
import { worldCombatCoordinator } from '../combat/coordinator.js';
import { MessageRateLimiter } from '../ws/rateLimit.js';
import { isTrustedBrowserOrigin } from '../middleware/originGuard.js';
import { env } from '../env.js';
import { getOrCreateWorldSeed } from './service.js';
import { normalizeCanonicalOverworldPosition } from './overworldTopology.js';
import { recordQuestEvent } from '../quests/service.js';

const WS_PATH = '/ws/world';
const POSITION_PERSIST_INTERVAL_MS = 1_000;
let nextConnectionAttempt = 0;
const latestAttemptSeen = new Map<string, number>();
const setupQueues = new Map<string, Promise<void>>();

async function hasBlockingInstance(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "DungeonRun"
    WHERE "userId" = ${userId} AND "status" IN ('active', 'death_pending')
    UNION ALL
    SELECT "id" FROM "PvpSession"
    WHERE "userId" = ${userId} AND "status" IN ('active', 'death_pending')
    LIMIT 1
  `;
  return Boolean(rows[0]);
}


function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

async function authenticate(req: IncomingMessage): Promise<{ id: string; username: string; authSessionId: string; expiresAtMs: number } | null> {
  const token = parseCookies(req.headers.cookie).access_token;
  if (!token) return null;
  const session = await validateAccessToken(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, username: true } });
  return user ? { ...user, authSessionId: session.sessionId, expiresAtMs: session.expiresAtMs } : null;
}

async function wireSocket(
  ws: WebSocket,
  user: { id: string; username: string; authSessionId: string; expiresAtMs: number },
  sessionId: string,
  initial: AuthoritativeWorldPosition,
  worldSeed: number,
): Promise<void> {
  let lastAccepted = initial;
  let presenceActive = true;
  let lastPersistedAt = Date.now();
  let persistenceQueue = Promise.resolve();
  const messageLimiter = new MessageRateLimiter(80, 40);
  registerAuthenticatedSocket(user.id, user.authSessionId, user.expiresAtMs, ws);

  const queuePersist = (position: AuthoritativeWorldPosition): void => {
    persistenceQueue = persistenceQueue
      .then(() => persistWorldPosition(user.id, sessionId, position))
      .then(() => undefined)
      .catch((error: unknown) => console.error('Failed to persist world position', error));
  };

  const blockedByInstance = await hasBlockingInstance(user.id);
  presenceActive = !blockedByInstance;
  if (presenceActive) joinWorldPresence(user.id, user.username, ws, initial);
  await worldCombatCoordinator.join(user.id, user.username, ws, initial);
  worldCombatCoordinator.setActive(user.id, ws, presenceActive);
  ws.send(JSON.stringify({ type: 'welcome', self: initial }));
  if (presenceActive && await hasBlockingInstance(user.id)) {
    // Close the query/join race with a concurrently committing instance start.
    presenceActive = false;
    suspendWorldPresence(user.id);
    worldCombatCoordinator.setActive(user.id, ws, false);
  }

  ws.on('message', (raw) => {
    if (!messageLimiter.allow()) {
      ws.close(1008, 'message rate exceeded');
      return;
    }
    const message = parseWorldClientMessage(raw.toString());
    if (!message) return;
    if (message.type === 'visibility') {
      if (message.active && !presenceActive) {
        worldCombatCoordinator.setActive(user.id, ws, false);
        // An HTTP-authorized relocation (for example Dungeon exit/death) may
        // have happened while this socket was hidden inside an instance.
        // A durable active instance blocks rejoin even when a modified client sends
        // visibility=true directly.
        void Promise.all([getPersistedWorldPosition(user.id), hasBlockingInstance(user.id)])
          .then(async ([persisted, blocked]) => {
            if (blocked || presenceActive || ws.readyState !== ws.OPEN) {
              worldCombatCoordinator.setActive(user.id, ws, false);
              return;
            }
            if (persisted) lastAccepted = persisted;
            presenceActive = true;
            joinWorldPresence(user.id, user.username, ws, lastAccepted);
            worldCombatCoordinator.setActive(user.id, ws, true);
            ws.send(JSON.stringify({ type: 'welcome', self: lastAccepted }));
            if (await hasBlockingInstance(user.id)) {
              // Close the query/join race with a concurrent start transaction.
              presenceActive = false;
              suspendWorldPresence(user.id);
              worldCombatCoordinator.setActive(user.id, ws, false);
            }
          })
          .catch((error: unknown) => console.error('Failed to resume world presence', error));
      } else if (!message.active && presenceActive) {
        worldCombatCoordinator.setActive(user.id, ws, false);
        const live = getFreshWorldPresence(user.id);
        if (live?.ws === ws) lastAccepted = { rx: live.rx, ry: live.ry, x: live.x, y: live.y };
        presenceActive = false;
        leaveWorldPresence(user.id, ws);
        queuePersist(lastAccepted);
      } else {
        worldCombatCoordinator.setActive(user.id, ws, message.active && presenceActive);
      }
      return;
    }
    if (message.type === 'attack' || message.type === 'claim_bag') {
      worldCombatCoordinator.handleMessage(user.id, ws, message);
      return;
    }
    if (!presenceActive || !worldCombatCoordinator.canMove(user.id, ws)) return;
    const previousRegion = { rx: lastAccepted.rx, ry: lastAccepted.ry };
    if (!updateWorldPresence(user.id, ws, message, worldSeed)) return;
    lastAccepted = { rx: message.rx, ry: message.ry, x: message.x, y: message.y };
    if (previousRegion.rx !== message.rx || previousRegion.ry !== message.ry) {
      void recordQuestEvent(
        user.id,
        'region_visit',
        1,
        `region-visit:${sessionId}:${message.seq}`,
        new Date(),
        { regionKey: `${message.rx},${message.ry}` },
      ).catch((error: unknown) => console.error('Failed to record verified region visit', error));
    }
    const now = Date.now();
    if (now - lastPersistedAt >= POSITION_PERSIST_INTERVAL_MS) {
      lastPersistedAt = now;
      queuePersist(lastAccepted);
    }
  });

  ws.once('close', () => {
    const live = presenceActive ? getFreshWorldPresence(user.id) : null;
    if (live?.ws === ws) lastAccepted = { rx: live.rx, ry: live.ry, x: live.x, y: live.y };
    queuePersist(lastAccepted);
    if (presenceActive) leaveWorldPresence(user.id, ws);
    worldCombatCoordinator.leave(user.id, ws);
  });
}

function rejectUpgrade(socket: Duplex, status: '401 Unauthorized' | '409 Conflict'): void {
  socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
  socket.destroy();
}

export function attachWorldPresence(server: HttpServer): WebSocketServer {
  worldCombatCoordinator.start();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_024 });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== WS_PATH) return;
    if (!isTrustedBrowserOrigin(req.headers.origin, env.CORS_ORIGIN, env.NODE_ENV === 'production')) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const attempt = ++nextConnectionAttempt;
    authenticate(req)
      .then((user) => {
        if (!user) {
          rejectUpgrade(socket, '401 Unauthorized');
          return;
        }
        latestAttemptSeen.set(user.id, Math.max(attempt, latestAttemptSeen.get(user.id) ?? 0));
        const previous = setupQueues.get(user.id) ?? Promise.resolve();
        const setup = previous.catch(() => undefined).then(async () => {
          if (attempt < (latestAttemptSeen.get(user.id) ?? 0)) {
            rejectUpgrade(socket, '409 Conflict');
            return;
          }
          const sessionId = randomUUID();
          const worldSeed = await getOrCreateWorldSeed();
          const claimed = await claimWorldPositionSession(user.id, sessionId);
          const persisted = normalizeCanonicalOverworldPosition(worldSeed, claimed);
          if (persisted.x !== claimed.x || persisted.y !== claimed.y || persisted.rx !== claimed.rx || persisted.ry !== claimed.ry) {
            await persistWorldPosition(user.id, sessionId, persisted);
          }
          if (attempt < (latestAttemptSeen.get(user.id) ?? 0)) {
            rejectUpgrade(socket, '409 Conflict');
            return;
          }
          const live = getFreshWorldPresence(user.id);
          const initial = live
            ? { rx: live.rx, ry: live.ry, x: live.x, y: live.y }
            : persisted;
          if (live) await persistWorldPosition(user.id, sessionId, initial);
          wss.handleUpgrade(req, socket, head, (upgraded) => {
            void wireSocket(upgraded, user, sessionId, initial, worldSeed).catch((error: unknown) => {
              console.error('Failed to initialize world socket', error);
              leaveWorldPresence(user.id, upgraded);
              worldCombatCoordinator.leave(user.id, upgraded);
              if (upgraded.readyState === upgraded.OPEN || upgraded.readyState === upgraded.CONNECTING) {
                upgraded.close(1011, 'world initialization failed');
              }
            });
          });
        }).finally(() => {
          if (setupQueues.get(user.id) === setup) setupQueues.delete(user.id);
          if ((latestAttemptSeen.get(user.id) ?? 0) === attempt) latestAttemptSeen.delete(user.id);
        });
        setupQueues.set(user.id, setup);
      })
      .catch(() => rejectUpgrade(socket, '401 Unauthorized'));
  });
  return wss;
}
