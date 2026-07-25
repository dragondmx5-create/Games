export interface Vec2 {
  x: number;
  z: number;
}

export interface Actor {
  id: string;
  position: Vec2;
  radius: number;
  speed: number;
  hp: number;
  maxHp: number;
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  alive: boolean;
}

export interface Player extends Actor {
  xp: number;
  level: number;
}

export interface Enemy extends Actor {
  aggroRange: number;
  rewardXp: number;
}

export interface Wall {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface GameSnapshot {
  player: Player;
  enemies: Enemy[];
  walls: Wall[];
  time: number;
}

export const cloneVec = (value: Vec2): Vec2 => ({ x: value.x, z: value.z });

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

export const normalize = (value: Vec2): Vec2 => {
  const length = Math.hypot(value.x, value.z);
  return length > 0 ? { x: value.x / length, z: value.z / length } : { x: 0, z: 0 };
};
