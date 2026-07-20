import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { validateAccessToken } from '../auth/session.js';
import { registerAuthenticatedSocket } from '../auth/socketRegistry.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { isTrustedBrowserOrigin } from '../middleware/originGuard.js';
import { MessageRateLimiter } from '../ws/rateLimit.js';
import { parsePvpClientMessage } from './protocol.js';
import { sessionForAdmissionToken } from './service.js';
import { handlePvpAttack, joinPvpRoom, leavePvpRoom, setPvpMoveIntent } from './rooms.js';

function cookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

async function authenticate(req: IncomingMessage): Promise<{ id: string; username: string; authSessionId: string; expiresAtMs: number } | null> {
  const token = cookies(req.headers.cookie).access_token;
  if (!token) return null;
  const auth = await validateAccessToken(token);
  if (!auth) return null;
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true, username: true } });
  return user ? { ...user, authSessionId: auth.sessionId, expiresAtMs: auth.expiresAtMs } : null;
}

function reject(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function attachPvp(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/ws/redzone') {
      reject(socket, '410 Gone');
      return;
    }
    if (url.pathname !== '/ws/pvp') return;
    if (!isTrustedBrowserOrigin(req.headers.origin, env.CORS_ORIGIN, env.NODE_ENV === 'production')) {
      reject(socket, '403 Forbidden');
      return;
    }
    const admissionToken = url.searchParams.get('token');
    if (!admissionToken || !/^[0-9a-f-]{36}$/i.test(admissionToken)) {
      reject(socket, '401 Unauthorized');
      return;
    }
    Promise.all([authenticate(req), sessionForAdmissionToken(admissionToken)])
      .then(([user, session]) => {
        if (!user || !session || session.userId !== user.id || session.admissionToken !== admissionToken) {
          reject(socket, '401 Unauthorized');
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          registerAuthenticatedSocket(user.id, user.authSessionId, user.expiresAtMs, ws);
          const limiter = new MessageRateLimiter(60, 30);
          void joinPvpRoom(session, user.username, ws).catch(() => ws.close(1011, 'PvP room admission failed'));
          ws.on('message', (raw) => {
            if (!limiter.allow()) {
              ws.close(1008, 'message rate exceeded');
              return;
            }
            const message = parsePvpClientMessage(raw.toString());
            if (!message) return;
            if (message.type === 'move') setPvpMoveIntent(user.id, ws, message.dx, message.dy);
            else handlePvpAttack(user.id, ws, message.ability, message.facing);
          });
          ws.once('close', () => leavePvpRoom(user.id, ws));
        });
      })
      .catch(() => reject(socket, '503 Service Unavailable'));
  });
  return wss;
}
