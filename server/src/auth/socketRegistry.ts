import type { WebSocket } from 'ws';

interface RegisteredSocket {
  userId: string;
  sessionId: string;
  ws: WebSocket;
  expiryTimer: NodeJS.Timeout;
}

const bySession = new Map<string, Set<RegisteredSocket>>();
const byUser = new Map<string, Set<RegisteredSocket>>();

function remove(entry: RegisteredSocket): void {
  clearTimeout(entry.expiryTimer);
  const sessionEntries = bySession.get(entry.sessionId);
  sessionEntries?.delete(entry);
  if (sessionEntries?.size === 0) bySession.delete(entry.sessionId);
  const userEntries = byUser.get(entry.userId);
  userEntries?.delete(entry);
  if (userEntries?.size === 0) byUser.delete(entry.userId);
}

export function registerAuthenticatedSocket(
  userId: string,
  sessionId: string,
  expiresAtMs: number,
  ws: WebSocket,
): () => void {
  const delay = Math.max(0, Math.min(2_147_000_000, expiresAtMs - Date.now()));
  const entry = {
    userId,
    sessionId,
    ws,
    expiryTimer: setTimeout(() => {
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        ws.close(4003, 'access token expired');
      }
      remove(entry);
    }, delay),
  } satisfies RegisteredSocket;
  entry.expiryTimer.unref();
  const sessionEntries = bySession.get(sessionId) ?? new Set<RegisteredSocket>();
  sessionEntries.add(entry);
  bySession.set(sessionId, sessionEntries);
  const userEntries = byUser.get(userId) ?? new Set<RegisteredSocket>();
  userEntries.add(entry);
  byUser.set(userId, userEntries);
  const unregister = (): void => remove(entry);
  ws.once('close', unregister);
  return unregister;
}

function closeEntries(entries: Iterable<RegisteredSocket>, reason: string): void {
  for (const entry of [...entries]) {
    if (entry.ws.readyState === entry.ws.OPEN || entry.ws.readyState === entry.ws.CONNECTING) {
      entry.ws.close(4003, reason);
    }
    remove(entry);
  }
}

export function closeSessionSockets(sessionId: string, reason = 'session revoked'): void {
  const entries = bySession.get(sessionId);
  if (entries) closeEntries(entries, reason);
}

export function closeUserSockets(userId: string, reason = 'account sessions revoked'): void {
  const entries = byUser.get(userId);
  if (entries) closeEntries(entries, reason);
}

export function resetAuthSocketRegistryForTests(): void {
  const all = new Set<RegisteredSocket>();
  for (const entries of byUser.values()) for (const entry of entries) all.add(entry);
  for (const entry of all) remove(entry);
  bySession.clear();
  byUser.clear();
}
