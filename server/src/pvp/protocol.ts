export type PvpClientMessage =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'attack'; ability: boolean; facing: number };

export function parsePvpClientMessage(raw: string): PvpClientMessage | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.type === 'move' && Object.keys(value).length === 3 && typeof value.dx === 'number' && Number.isFinite(value.dx)
      && typeof value.dy === 'number' && Number.isFinite(value.dy)
      && Math.abs(value.dx) <= 1.5 && Math.abs(value.dy) <= 1.5) {
      return { type: 'move', dx: value.dx, dy: value.dy };
    }
    if (value.type === 'attack' && Object.keys(value).length === 3 && typeof value.ability === 'boolean'
      && typeof value.facing === 'number' && Number.isFinite(value.facing)
      && Math.abs(value.facing) <= Math.PI * 2) {
      return { type: 'attack', ability: value.ability, facing: value.facing };
    }
  } catch {
    // Invalid network input is ignored; no state changes.
  }
  return null;
}
