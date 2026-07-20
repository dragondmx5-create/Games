// Server-authoritative PvP hit validation — a client can only ever request
// "I'm attacking," never claim "I hit them." This is the server's own copy
// of the same range/arc math as src/game.ts's resolveHits() in the game
// project (dist -> angle-to-target -> wrapped angle diff -> compare to
// arc/2), hand-ported since the two npm projects don't share code (see
// CLAUDE.md's Red Zone section) — small, stable surface, kept in sync by
// hand if combat math ever changes.
//
// v1 gives every Red Zone player one fixed weapon (no shop, no loadout
// choice yet) — numbers close to the solo game's starter Bone Shiv.
export const REDZONE_WEAPON = {
  damage: 2,
  range: 30,
  arc: Math.PI * 0.8,
  cooldown: 0.35,
};

export const REDZONE_PLAYER = {
  maxHp: 10,
  speed: 70, // px/s — no run/noise mechanic here, so just one flat speed
};

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** true if an attacker at (ax,ay) facing `facing` radians, with the given
 * weapon range/arc, is currently positioned/aimed to land a hit on a
 * target at (tx,ty) */
export function canHit(ax: number, ay: number, facing: number, tx: number, ty: number, range = REDZONE_WEAPON.range, arc = REDZONE_WEAPON.arc): boolean {
  if (dist(ax, ay, tx, ty) > range) return false;
  const angleToTarget = Math.atan2(ty - ay, tx - ax);
  let diff = Math.abs(angleToTarget - facing);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  return diff <= arc / 2;
}
