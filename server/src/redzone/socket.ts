// WebSocket entry point for the Red Zone — attached to the same HTTP
// server the Express API already runs on (see index.ts), so there's no new
// port/CORS surface. Auth reuses the existing httpOnly access_token cookie
// (parsed by hand here since cookie-parser's Express middleware doesn't run
// for a raw upgrade handled via server.on('upgrade')) and the existing
// verifyAccessToken() — Red Zone requires an account, same rule as
// cloud-save/vaults.
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyAccessToken } from '../auth/jwt.js';
import { prisma } from '../db.js';
import { joinRedZone, leaveRedZone, handleMoveIntent, handleAttack } from './state.js';
import { parseRedZoneClientMessage } from './protocol.js';
import { MessageRateLimiter } from '../ws/rateLimit.js';
import { isTrustedBrowserOrigin } from '../middleware/originGuard.js';
import { env } from '../env.js';

const WS_PATH = '/ws/redzone';
let nextConnectionAttempt = 0;
const latestAuthenticatedAttempt = new Map<string, number>();

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

async function authenticate(req: IncomingMessage): Promise<{ id: string; username: string } | null> {
  const token = parseCookies(req.headers.cookie).access_token;
  if (!token) return null;
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    return user ? { id: user.id, username: user.username } : null;
  } catch {
    return null;
  }
}

async function wireSocket(ws: WebSocket, userId: string, username: string): Promise<void> {
  const messageLimiter = new MessageRateLimiter(120, 60);
  ws.once('close', () => leaveRedZone(userId, ws));
  ws.on('message', (raw) => {
    if (!messageLimiter.allow()) {
      ws.close(1008, 'message rate exceeded');
      return;
    }
    const msg = parseRedZoneClientMessage(raw.toString());
    if (!msg) return;
    if (msg.type === 'move') handleMoveIntent(userId, ws, msg.dx, msg.dy);
    else handleAttack(userId, ws);
  });

  try {
    const joined = await joinRedZone(userId, username, ws);
    if (!joined && ws.readyState === ws.OPEN) ws.close(4001, 'connection superseded');
  } catch {
    leaveRedZone(userId, ws);
    if (ws.readyState === ws.OPEN) ws.close(1011, 'failed to join red zone');
  }
}

export function attachRedZone(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_024 });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== WS_PATH) return; // not ours — leave it alone
    if (!isTrustedBrowserOrigin(req.headers.origin, env.CORS_ORIGIN, env.NODE_ENV === 'production')) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    // Capture arrival order before the asynchronous DB-backed auth check.
    // Otherwise an older upgrade whose auth resolves late can incorrectly
    // replace a newer tab that has already connected.
    const attempt = ++nextConnectionAttempt;
    authenticate(req)
      .then((user) => {
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        const latest = latestAuthenticatedAttempt.get(user.id) ?? 0;
        if (attempt < latest) {
          socket.write('HTTP/1.1 409 Conflict\r\n\r\n');
          socket.destroy();
          return;
        }
        latestAuthenticatedAttempt.set(user.id, attempt);
        wss.handleUpgrade(req, socket, head, (ws) => {
          void wireSocket(ws, user.id, user.username);
        });
      })
      .catch(() => {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      });
  });

  return wss;
}
