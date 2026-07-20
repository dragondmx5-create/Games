// Public API types and internal DB-row shapes for the dungeon service.
import type { PlayerCombatSnapshot } from '../combat/service.js';
import type { InventoryStacks, InventoryCommandResult } from '../inventory/types.js';
import type { DungeonChestState, DungeonEnemyState, DungeonTopology } from './topology.js';

export type DungeonRunStatus = 'active' | 'death_pending' | 'completed' | 'exited' | 'dead';

export interface DungeonRunRow {
  id: string;
  userId: string;
  dungeonId: string;
  runSeed: number;
  floor: number;
  floorSeed: number;
  revision: number;
  status: DungeonRunStatus;
  topology: unknown;
  enemies: unknown;
  chests: unknown;
  playerX: number;
  playerY: number;
  playerFacing: number;
  playerHp: number;
  playerMaxHp: number;
  returnRx: number;
  returnRy: number;
  returnX: number;
  returnY: number;
  keyConsumed: boolean;
  contractSettled: boolean;
  floorCompleted: boolean;
  basicReadyAt: Date | null;
  abilityReadyAt: Date | null;
  hazardReadyAt: Date | null;
  hazardId: string | null;
  lastMoveAt: Date;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
}

export interface DungeonCommandRow {
  requestHash: string;
  result: unknown;
}

export interface DungeonVaultProofRow {
  id: string;
  runId: string;
  layer: 1 | 5;
  proofHash: string;
  createdAt: Date;
}

export interface DungeonReceiptRow {
  id: string;
  runId: string;
  floor: number;
  boss: boolean;
  proofHash: string;
  createdAt: Date;
}

export interface CombatStateRow {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  dead: boolean;
  deathToken: string | null;
  deaths: number;
  kills: number;
}

export interface LootBagRow {
  id: string;
  ownerUserId: string;
  rx: number;
  ry: number;
  x: number;
  y: number;
  items: unknown;
  expiresAt: Date;
}

export interface PublicDungeonVaultProof {
  id: string;
  runId: string;
  layer: 1 | 5;
  proofHash: string;
  createdAt: string;
}

export interface PublicDungeonReceipt {
  id: string;
  runId: string;
  floor: number;
  boss: boolean;
  proofHash: string;
  createdAt: string;
}

export interface PublicDungeonSnapshot {
  runId: string;
  dungeonId: string;
  runSeed: number;
  floor: number;
  floorSeed: number;
  revision: number;
  status: DungeonRunStatus;
  topology: DungeonTopology;
  player: {
    x: number;
    y: number;
    facing: number;
    hp: number;
    maxHp: number;
  };
  enemies: DungeonEnemyState[];
  chests: DungeonChestState[];
  keyConsumed: boolean;
  contractSettled: boolean;
  floorCompleted: boolean;
  returnPosition: { rx: number; ry: number; x: number; y: number };
}

export interface DungeonCommandResponse {
  dungeon: PublicDungeonSnapshot;
  damageTaken?: number;
  killedEnemyIds?: string[];
  reward?: InventoryStacks;
  inventoryCommand?: InventoryCommandResult;
  combatPlayer?: PlayerCombatSnapshot;
  receipt?: PublicDungeonReceipt;
  vaultProofs?: PublicDungeonVaultProof[];
  contractSettled?: boolean;
}
