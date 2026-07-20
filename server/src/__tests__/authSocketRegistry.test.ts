import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import {
  closeSessionSockets,
  closeUserSockets,
  registerAuthenticatedSocket,
  resetAuthSocketRegistryForTests,
} from '../auth/socketRegistry.js';

interface FakeSocket {
  OPEN: number;
  CONNECTING: number;
  readyState: number;
  closeCalls: Array<{ code?: number; reason?: string }>;
  once: (event: string, callback: () => void) => void;
  close: (code?: number, reason?: string) => void;
}

function fakeSocket(): FakeSocket {
  const closeListeners: Array<() => void> = [];
  const socket: FakeSocket = {
    OPEN: 1,
    CONNECTING: 0,
    readyState: 1,
    closeCalls: [],
    once(event, callback) {
      if (event === 'close') closeListeners.push(callback);
    },
    close(code, reason) {
      socket.closeCalls.push({ code, reason });
      socket.readyState = 3;
      for (const listener of closeListeners.splice(0)) listener();
    },
  };
  return socket;
}

function asWebSocket(socket: FakeSocket): WebSocket {
  return socket as unknown as WebSocket;
}

afterEach(() => {
  vi.useRealTimers();
  resetAuthSocketRegistryForTests();
});

describe('authenticated websocket registry', () => {
  it('revokes one access session without closing another session for the same user', () => {
    const first = fakeSocket();
    const second = fakeSocket();
    registerAuthenticatedSocket('user-1', 'session-1', Date.now() + 60_000, asWebSocket(first));
    registerAuthenticatedSocket('user-1', 'session-2', Date.now() + 60_000, asWebSocket(second));

    closeSessionSockets('session-1', 'logged out');

    expect(first.closeCalls).toEqual([{ code: 4003, reason: 'logged out' }]);
    expect(second.closeCalls).toEqual([]);
  });

  it('revokes every socket after a password change', () => {
    const first = fakeSocket();
    const second = fakeSocket();
    registerAuthenticatedSocket('user-1', 'session-1', Date.now() + 60_000, asWebSocket(first));
    registerAuthenticatedSocket('user-1', 'session-2', Date.now() + 60_000, asWebSocket(second));

    closeUserSockets('user-1', 'password changed');

    expect(first.closeCalls[0]).toEqual({ code: 4003, reason: 'password changed' });
    expect(second.closeCalls[0]).toEqual({ code: 4003, reason: 'password changed' });
  });

  it('closes a socket when its access token expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    const socket = fakeSocket();
    registerAuthenticatedSocket('user-1', 'session-1', Date.now() + 1_000, asWebSocket(socket));

    vi.advanceTimersByTime(1_001);

    expect(socket.closeCalls[0]).toEqual({ code: 4003, reason: 'access token expired' });
  });
});
