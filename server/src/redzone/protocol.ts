export type RedZoneClientMessage = { type: 'move'; dx: number; dy: number } | { type: 'attack' };

export function parseRedZoneClientMessage(raw: string): RedZoneClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const msg = value as { type?: unknown; dx?: unknown; dy?: unknown };
  if (msg.type === 'attack') return { type: 'attack' };
  if (msg.type !== 'move' || typeof msg.dx !== 'number' || typeof msg.dy !== 'number') return null;
  if (!Number.isFinite(msg.dx) || !Number.isFinite(msg.dy)) return null;
  return { type: 'move', dx: msg.dx, dy: msg.dy };
}
