// Game-session value types and a small HTML-escape helper, split out of
// the Game class file. The Game class itself remains in game.ts.
import type { LandId } from '../overworld/types';

export interface ActiveDungeonState {
  id: string;
  floor: number;
  seed: number;
  returnRegion: { rx: number; ry: number };
  returnPos: { x: number; y: number };
}

export interface MarketReturnState {
  sourceLandId: LandId;
  returnRegion: { rx: number; ry: number };
  returnPos: { x: number; y: number };
}

export function escapeUi(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]!);
}
