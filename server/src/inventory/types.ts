import type { ItemId } from '../economy/catalog.js';

export type InventoryStacks = Partial<Record<ItemId, number>>;

export interface InventorySnapshot {
  revision: number;
  progressionLevel: number;
  equippedWeapon: ItemId;
  hasPet: boolean;
  migratedFromSave: boolean;
  stacks: InventoryStacks;
}

export interface InventoryCommandResult {
  kind: string;
  replayed: boolean;
  inventory: InventorySnapshot;
  deltas: InventoryStacks;
}

export interface InventoryCommandMeta {
  idempotencyKey: string;
  expectedRevision?: number;
}
