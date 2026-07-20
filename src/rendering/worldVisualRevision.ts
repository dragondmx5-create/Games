import type { World } from '../world/types';

type VisualWorldState = Pick<
  World,
  'props' | 'portals' | 'houses' | 'chests' | 'farmPlots' | 'miningNodes' | 'resourceNodes'
>;

/**
 * Stable signature for static-world presentation. Countdown values are
 * intentionally excluded: a farm timer changes every frame but does not alter
 * geometry until its growth stage changes.
 */
export function worldVisualRevision(world: VisualWorldState): string {
  let hash = 2166136261;
  const mix = (value: number): void => { hash = Math.imul(hash ^ (value | 0), 16777619); };
  mix(world.props.length);
  mix(world.portals.length);
  mix(world.houses?.length ?? 0);
  for (const chest of world.chests) mix(chest.opened ? 1 : 0);
  for (const plot of world.farmPlots) mix(plot.stage);
  for (const node of world.miningNodes) { mix(node.available ? 1 : 0); mix(node.integrity); }
  for (const node of world.resourceNodes) mix(node.available ? 1 : 0);
  return `${world.props.length}:${world.chests.length}:${world.farmPlots.length}:${hash >>> 0}`;
}
