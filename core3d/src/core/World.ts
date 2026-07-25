import type { Actor, Vec2, Wall } from './types';

const WORLD_LIMIT = 14;

export class World {
  readonly walls: Wall[] = [
    { x: 0, z: -6, width: 10, depth: 1 },
    { x: -6, z: 1, width: 1, depth: 8 },
    { x: 6, z: 2, width: 1, depth: 7 },
    { x: 0, z: 7, width: 8, depth: 1 },
    { x: 0, z: 1, width: 3, depth: 1 },
  ];

  move(actor: Actor, direction: Vec2, distance: number): void {
    const nextX = actor.position.x + direction.x * distance;
    const nextZ = actor.position.z + direction.z * distance;

    if (this.canOccupy(nextX, actor.position.z, actor.radius)) {
      actor.position.x = nextX;
    }
    if (this.canOccupy(actor.position.x, nextZ, actor.radius)) {
      actor.position.z = nextZ;
    }
  }

  private canOccupy(x: number, z: number, radius: number): boolean {
    if (x - radius < -WORLD_LIMIT || x + radius > WORLD_LIMIT) return false;
    if (z - radius < -WORLD_LIMIT || z + radius > WORLD_LIMIT) return false;

    return !this.walls.some((wall) => {
      const left = wall.x - wall.width / 2;
      const right = wall.x + wall.width / 2;
      const top = wall.z - wall.depth / 2;
      const bottom = wall.z + wall.depth / 2;
      const closestX = Math.max(left, Math.min(x, right));
      const closestZ = Math.max(top, Math.min(z, bottom));
      return Math.hypot(x - closestX, z - closestZ) < radius;
    });
  }
}
