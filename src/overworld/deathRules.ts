import type { ArmorId, ToolId, WeaponId } from '../config';
import type { ItemLossRule } from './types';

export interface CarriedInventory {
  loot: number;
  shrooms: number;
  wood: number;
  iron: number;
  meat: number;
  hide: number;
  feathers: number;
  chests: number;
  weapons: WeaponId[];
  tools: ToolId[];
  armor: ArmorId[];
}

export interface DeathInventoryOutcome {
  dropped: CarriedInventory;
  retained: CarriedInventory;
  resetProgression: boolean;
}

const empty = (): CarriedInventory => ({
  loot: 0,
  shrooms: 0,
  wood: 0,
  iron: 0,
  meat: 0,
  hide: 0,
  feathers: 0,
  chests: 0,
  weapons: [],
  tools: [],
  armor: [],
});

const splitNumber = (value: number, ratio: number): [number, number] => {
  const dropped = Math.floor(Math.max(0, value) * ratio);
  return [dropped, Math.max(0, value - dropped)];
};

export function resolveDeathInventory(rule: ItemLossRule, carried: CarriedInventory): DeathInventoryOutcome {
  if (rule === 'none') return { dropped: empty(), retained: { ...carried, weapons: [...carried.weapons], tools: [...carried.tools], armor: [...carried.armor] }, resetProgression: false };

  const ratio = rule === 'supplies' ? 0.25 : rule === 'partial' ? 0.6 : 1;
  const dropped = empty();
  const retained = empty();
  for (const key of ['loot', 'shrooms', 'wood', 'iron', 'meat', 'hide', 'feathers', 'chests'] as const) {
    [dropped[key], retained[key]] = splitNumber(carried[key], ratio);
  }

  if (rule === 'full') {
    dropped.weapons = carried.weapons.filter((weapon) => weapon !== 'bone');
    retained.weapons = ['bone'];
    dropped.tools = [...carried.tools];
    dropped.armor = [...carried.armor];
  } else if (rule === 'partial') {
    const nonStarter = carried.weapons.filter((weapon) => weapon !== 'bone');
    dropped.weapons = nonStarter.length > 0 ? [nonStarter[nonStarter.length - 1]] : [];
    retained.weapons = carried.weapons.filter((weapon) => !dropped.weapons.includes(weapon));
    if (!retained.weapons.includes('bone')) retained.weapons.unshift('bone');
    retained.tools = [...carried.tools];
    retained.armor = [...carried.armor];
  } else {
    retained.weapons = [...carried.weapons];
    retained.tools = [...carried.tools];
    retained.armor = [...carried.armor];
  }

  return { dropped, retained, resetProgression: rule === 'full' };
}
