// Real player stats — persisted across sessions, and behind the title screen's returning-player text.
const KEY = 'undral.stats.v1';

export interface Stats {
  deaths: number;
  kills: number;
  totalPlaySeconds: number;
  deepestLayer: number;
  itemsFound: number;
  lootLostForever: number;
  sessions: number;
  deathSpots: Record<string, number>; // rounded "layer:x:y" → death count nearby
}

function fresh(): Stats {
  return {
    deaths: 0,
    kills: 0,
    totalPlaySeconds: 0,
    deepestLayer: 1,
    itemsFound: 0,
    lootLostForever: 0,
    sessions: 0,
    deathSpots: {},
  };
}

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    /* broken localStorage = fresh stats */
  }
  return fresh();
}

export function saveStats(s: Stats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function deathSpotKey(layer: number, tx: number, ty: number): string {
  // group deaths into 6x6-tile blocks so "died right here" means something
  return `${layer}:${Math.floor(tx / 6)}:${Math.floor(ty / 6)}`;
}
