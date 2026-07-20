import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import { ITEM_CATALOG, isItemId, type ItemId } from '../economy/catalog.js';
import { executeInventoryCommandInTransaction, getInventoryInTransaction } from '../inventory/service.js';
import type { InventoryCommandResult, InventorySnapshot, InventoryStacks } from '../inventory/types.js';
import { HttpError } from '../middleware/httpError.js';
import { recordQuestEventInTransaction } from '../quests/service.js';
import { getPersistedWorldPosition } from '../world/positionService.js';
import { getFreshWorldPresence, relocateWorldPresence } from '../world/presence.js';
import { capitalSpawnForLand } from '../world/landLocations.js';
import { regionResourceProfileAt } from '../world/regionResourceProfiles.js';
import { getOrCreateWorldSeed } from '../world/service.js';
import {
  applyProgression,
  attackProfile,
  bestArmorReduction,
  negativeDeltas,
  planDeathLoss,
  reduceIncomingDamage,
  rollEnemyDrops,
} from './domain.js';
import { COMBAT_ENEMIES, maxHpForLevel, type CombatEnemyKind, type CombatRiskTier } from './catalog.js';
import { effectiveEnemyLifecycle, enemyLifeId } from './enemyState.js';

const BAG_LIFETIME_MS = 30 * 60 * 1_000;
const BAG_CLAIM_RADIUS = 32;

interface CombatStateRow {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  dead: boolean;
  deathToken: string | null;
  deaths: number;
  kills: number;
  basicReadyAt: Date | null;
  abilityReadyAt: Date | null;
}

interface EnemyStateRow {
  enemyId: string;
  worldSeed: number;
  rx: number;
  ry: number;
  kind: string;
  generation: number;
  hp: number;
  respawnAt: Date | null;
}

interface LootBagRow {
  id: string;
  ownerUserId: string;
  rx: number;
  ry: number;
  x: number;
  y: number;
  items: unknown;
  expiresAt: Date;
  claimedAt: Date | null;
  claimedById: string | null;
}

export interface PlayerCombatSnapshot {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  dead: boolean;
  deathToken?: string;
  deaths: number;
  kills: number;
}

export interface PublicLootBag {
  id: string;
  ownerUserId: string;
  rx: number;
  ry: number;
  x: number;
  y: number;
  items: InventoryStacks;
  expiresAt: string;
}

export interface DamagePlayerResult {
  player: PlayerCombatSnapshot;
  damage: number;
  death?: {
    token: string;
    riskTier: CombatRiskTier;
    bag: PublicLootBag | null;
    inventory: InventoryCommandResult;
  };
}

export interface EnemyKillResult {
  replayed: boolean;
  reward: InventoryStacks;
  xpGained: number;
  player: PlayerCombatSnapshot;
  inventory: InventoryCommandResult;
}

export interface PersistedEnemyState {
  enemyId: string;
  generation: number;
  hp: number;
  alive: boolean;
  respawnAt: string | null;
}

export interface CombatAttackAuthorization {
  profile: ReturnType<typeof attackProfile>;
  player: PlayerCombatSnapshot;
}

export interface EnemyHitResult {
  enemy: PersistedEnemyState;
  damage: number;
  killed: boolean;
  reward: InventoryStacks;
  xpGained: number;
  player: PlayerCombatSnapshot;
  inventory: InventoryCommandResult | null;
}


function deterministicRandom(key: string): () => number {
  let state = createHash('sha256').update(key).digest().readUInt32LE(0);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function publicCombatState(row: CombatStateRow): PlayerCombatSnapshot {
  return {
    hp: row.hp,
    maxHp: row.maxHp,
    xp: row.xp,
    level: row.level,
    dead: row.dead,
    deathToken: row.deathToken ?? undefined,
    deaths: row.deaths,
    kills: row.kills,
  };
}

function parseInventoryStacks(value: unknown): InventoryStacks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: InventoryStacks = {};
  for (const [itemId, rawQuantity] of Object.entries(value)) {
    if (!isItemId(itemId) || !Number.isSafeInteger(rawQuantity) || Number(rawQuantity) <= 0) continue;
    result[itemId] = Number(rawQuantity);
  }
  return result;
}

function publicBag(row: LootBagRow): PublicLootBag {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    rx: row.rx,
    ry: row.ry,
    x: row.x,
    y: row.y,
    items: parseInventoryStacks(row.items),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function hasItems(stacks: InventoryStacks): boolean {
  return Object.values(stacks).some((quantity) => (quantity ?? 0) > 0);
}

function filterClaimableDrops(snapshot: InventorySnapshot, rolled: InventoryStacks): InventoryStacks {
  const result: InventoryStacks = {};
  for (const [itemId, quantity] of Object.entries(rolled) as Array<[ItemId, number]>) {
    if (quantity <= 0) continue;
    if (ITEM_CATALOG[itemId].unique && (snapshot.stacks[itemId] ?? 0) > 0) continue;
    result[itemId] = quantity;
  }
  return result;
}

async function ensureCombatState(tx: Prisma.TransactionClient, userId: string, lock: boolean): Promise<CombatStateRow> {
  const inventory = await getInventoryInTransaction(tx, userId, false);
  const lockClause = lock ? Prisma.sql` FOR UPDATE` : Prisma.empty;
  let rows = await tx.$queryRaw<CombatStateRow[]>(Prisma.sql`
    SELECT "hp", "maxHp", "xp", "level", "dead", "deathToken", "deaths", "kills", "basicReadyAt", "abilityReadyAt"
    FROM "PlayerCombatState"
    WHERE "userId" = ${userId}${lockClause}
  `);
  if (!rows[0]) {
    const level = Math.max(1, inventory.progressionLevel);
    const maxHp = maxHpForLevel(level);
    const inserted = await tx.$queryRaw<CombatStateRow[]>`
      INSERT INTO "PlayerCombatState"
        ("userId", "hp", "maxHp", "xp", "level", "dead", "deaths", "kills", "updatedAt")
      VALUES
        (${userId}, ${maxHp}, ${maxHp}, 0, ${level}, false, 0, 0, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO NOTHING
      RETURNING "hp", "maxHp", "xp", "level", "dead", "deathToken", "deaths", "kills", "basicReadyAt", "abilityReadyAt"
    `;
    if (inserted[0]) return inserted[0];
    rows = await tx.$queryRaw<CombatStateRow[]>(Prisma.sql`
      SELECT "hp", "maxHp", "xp", "level", "dead", "deathToken", "deaths", "kills", "basicReadyAt", "abilityReadyAt"
      FROM "PlayerCombatState"
      WHERE "userId" = ${userId}${lockClause}
    `);
  }
  const row = rows[0];
  if (!row) throw new Error('failed to create combat state');
  if (!row.dead && inventory.progressionLevel > row.level) {
    const level = inventory.progressionLevel;
    const maxHp = maxHpForLevel(level);
    await tx.$executeRaw`
      UPDATE "PlayerCombatState"
      SET "level" = ${level}, "maxHp" = ${maxHp}, "hp" = LEAST(${maxHp}, GREATEST("hp", 1)), "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `;
    return { ...row, level, maxHp, hp: Math.min(maxHp, Math.max(row.hp, 1)) };
  }
  return row;
}

export function getPlayerCombatState(userId: string): Promise<PlayerCombatSnapshot> {
  return serializableTransaction(async (tx) => publicCombatState(await ensureCombatState(tx, userId, false)));
}

/**
 * Applies progression inside the caller's existing serializable transaction.
 * Gameplay services must use this helper instead of trusting client XP totals.
 * Level changes are mirrored into PlayerInventory so recipe gates and combat
 * always observe the same canonical level.
 */
export async function awardProgressionInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  gainedXp: number,
): Promise<PlayerCombatSnapshot> {
  if (!Number.isSafeInteger(gainedXp) || gainedXp < 0) throw new HttpError(400, 'invalid progression award');
  const combat = await ensureCombatState(tx, userId, true);
  if (combat.dead) throw new HttpError(409, 'dead players cannot receive progression');
  if (gainedXp === 0) return publicCombatState(combat);

  const progression = applyProgression(combat.level, combat.xp, gainedXp);
  const hp = progression.leveledUp ? progression.maxHp : Math.min(combat.hp, progression.maxHp);
  await tx.$executeRaw`
    UPDATE "PlayerCombatState"
    SET "hp" = ${hp}, "maxHp" = ${progression.maxHp}, "xp" = ${progression.xp},
        "level" = ${progression.level}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId}
  `;
  await tx.$executeRaw`
    UPDATE "PlayerInventory"
    SET "progressionLevel" = GREATEST("progressionLevel", ${progression.level}),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId}
  `;
  return publicCombatState({
    ...combat,
    hp,
    maxHp: progression.maxHp,
    xp: progression.xp,
    level: progression.level,
  });
}

export async function getPlayerCombatStateInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<PlayerCombatSnapshot> {
  return publicCombatState(await ensureCombatState(tx, userId, false));
}

export async function getWorldEnemyStates(
  worldSeed: number,
  rx: number,
  ry: number,
  maxHpByEnemyId: ReadonlyMap<string, number>,
): Promise<Map<string, PersistedEnemyState>> {
  return serializableTransaction(async (tx) => {
    const rows = await tx.$queryRaw<EnemyStateRow[]>`
      SELECT "enemyId", "worldSeed", "rx", "ry", "kind", "generation", "hp", "respawnAt"
      FROM "WorldEnemyState"
      WHERE "worldSeed" = ${worldSeed} AND "rx" = ${rx} AND "ry" = ${ry}
    `;
    const now = new Date();
    return new Map(rows.flatMap((row: EnemyStateRow) => {
      const maxHp = maxHpByEnemyId.get(row.enemyId);
      return maxHp === undefined ? [] : [[row.enemyId, effectiveEnemyLifecycle(row, maxHp, now)] as const];
    }));
  });
}

export async function authorizeCombatAttack(
  userId: string,
  ability: boolean,
  now = new Date(),
): Promise<CombatAttackAuthorization> {
  return serializableTransaction(async (tx) => {
    const inventory = await getInventoryInTransaction(tx, userId, true);
    const combat = await ensureCombatState(tx, userId, true);
    if (combat.dead) throw new HttpError(409, 'dead players cannot attack');
    let profile: ReturnType<typeof attackProfile>;
    try {
      profile = attackProfile(inventory.equippedWeapon, ability);
    } catch {
      throw new HttpError(409, 'equipped weapon is not valid for combat');
    }
    const readyAt = ability ? combat.abilityReadyAt : combat.basicReadyAt;
    if (readyAt && readyAt > now) throw new HttpError(409, 'attack is on cooldown');
    const nextReadyAt = new Date(now.getTime() + profile.cooldownMs);
    if (ability) {
      await tx.$executeRaw`
        UPDATE "PlayerCombatState" SET "abilityReadyAt" = ${nextReadyAt}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ${userId}
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "PlayerCombatState" SET "basicReadyAt" = ${nextReadyAt}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ${userId}
      `;
    }
    return { profile, player: publicCombatState(combat) };
  });
}

export async function damageWorldEnemy(
  userId: string,
  input: {
    enemyId: string;
    kind: CombatEnemyKind;
    worldSeed: number;
    rx: number;
    ry: number;
    expectedGeneration: number;
    maxHp: number;
    damage: number;
    respawnMs: number;
  },
): Promise<EnemyHitResult> {
  return serializableTransaction(async (tx) => {
    let rows = await tx.$queryRaw<EnemyStateRow[]>`
      SELECT "enemyId", "worldSeed", "rx", "ry", "kind", "generation", "hp", "respawnAt"
      FROM "WorldEnemyState"
      WHERE "enemyId" = ${input.enemyId}
      FOR UPDATE
    `;
    if (!rows[0]) {
      await tx.$executeRaw`
        INSERT INTO "WorldEnemyState"
          ("enemyId", "worldSeed", "rx", "ry", "kind", "generation", "hp", "respawnAt", "updatedAt")
        VALUES
          (${input.enemyId}, ${input.worldSeed}, ${input.rx}, ${input.ry}, ${input.kind}, 0, ${input.maxHp}, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT ("enemyId") DO NOTHING
      `;
      rows = await tx.$queryRaw<EnemyStateRow[]>`
        SELECT "enemyId", "worldSeed", "rx", "ry", "kind", "generation", "hp", "respawnAt"
        FROM "WorldEnemyState"
        WHERE "enemyId" = ${input.enemyId}
        FOR UPDATE
      `;
    }
    let state = rows[0];
    if (!state) throw new Error('failed to create enemy state');
    if (state.worldSeed !== input.worldSeed || state.rx !== input.rx || state.ry !== input.ry || state.kind !== input.kind) {
      throw new HttpError(409, 'enemy identity does not match the authoritative world');
    }

    const now = new Date();
    if (state.respawnAt && state.respawnAt <= now) {
      const generation = state.generation + 1;
      await tx.$executeRaw`
        UPDATE "WorldEnemyState"
        SET "generation" = ${generation}, "hp" = ${input.maxHp}, "respawnAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "enemyId" = ${input.enemyId}
      `;
      state = { ...state, generation, hp: input.maxHp, respawnAt: null };
    }

    const combat = await ensureCombatState(tx, userId, true);
    if (combat.dead) throw new HttpError(409, 'dead players cannot damage enemies');
    if (state.generation !== input.expectedGeneration || state.respawnAt || state.hp <= 0) {
      return {
        enemy: effectiveEnemyLifecycle(state, input.maxHp, now),
        damage: 0,
        killed: false,
        reward: {},
        xpGained: 0,
        player: publicCombatState(combat),
        inventory: null,
      };
    }

    const damage = Math.max(1, Math.min(100_000, Math.floor(input.damage)));
    const hp = Math.max(0, state.hp - damage);
    if (hp > 0) {
      await tx.$executeRaw`
        UPDATE "WorldEnemyState" SET "hp" = ${hp}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "enemyId" = ${input.enemyId} AND "generation" = ${state.generation}
      `;
      return {
        enemy: { enemyId: state.enemyId, generation: state.generation, hp, alive: true, respawnAt: null },
        damage,
        killed: false,
        reward: {},
        xpGained: 0,
        player: publicCombatState(combat),
        inventory: null,
      };
    }

    const respawnAt = new Date(now.getTime() + input.respawnMs);
    await tx.$executeRaw`
      UPDATE "WorldEnemyState"
      SET "hp" = 0, "respawnAt" = ${respawnAt}, "lastKilledBy" = ${userId}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "enemyId" = ${input.enemyId} AND "generation" = ${state.generation}
    `;

    const lifeId = enemyLifeId(input.enemyId, state.generation);
    const reserved = await tx.$queryRaw<Array<{ lifeId: string }>>`
      INSERT INTO "WorldEnemyKill"
        ("lifeId", "enemyId", "userId", "worldSeed", "rx", "ry", "kind", "reward", "createdAt")
      VALUES
        (${lifeId}, ${input.enemyId}, ${userId}, ${input.worldSeed}, ${input.rx}, ${input.ry}, ${input.kind}, '{}'::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT ("lifeId") DO NOTHING
      RETURNING "lifeId"
    `;
    if (!reserved[0]) {
      return {
        enemy: { enemyId: state.enemyId, generation: state.generation, hp: 0, alive: false, respawnAt: respawnAt.toISOString() },
        damage,
        killed: false,
        reward: {},
        xpGained: 0,
        player: publicCombatState(combat),
        inventory: null,
      };
    }

    const rolled = rollEnemyDrops(input.kind, deterministicRandom(`enemy-drop:${lifeId}:${input.kind}`));
    let appliedDrops: InventoryStacks = {};
    const progression = applyProgression(combat.level, combat.xp, COMBAT_ENEMIES[input.kind].xp);
    const inventory = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'enemy_loot',
      { lifeId, enemyId: input.enemyId, kind: input.kind },
      { idempotencyKey: `enemy_loot:${lifeId}` },
      (snapshot) => {
        appliedDrops = filterClaimableDrops(snapshot, rolled);
        return { deltas: appliedDrops, progressionLevel: progression.level };
      },
    );
    const playerHp = progression.leveledUp ? progression.maxHp : Math.min(combat.hp, progression.maxHp);
    await tx.$executeRaw`
      UPDATE "PlayerCombatState"
      SET "hp" = ${playerHp}, "maxHp" = ${progression.maxHp}, "xp" = ${progression.xp},
          "level" = ${progression.level}, "kills" = "kills" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `;
    const reward = { drops: appliedDrops, xpGained: COMBAT_ENEMIES[input.kind].xp };
    await tx.$executeRaw`
      UPDATE "WorldEnemyKill" SET "reward" = ${JSON.stringify(reward)}::jsonb WHERE "lifeId" = ${lifeId}
    `;
    await recordQuestEventInTransaction(
      tx,
      userId,
      'enemy_kill',
      1,
      `enemy-kill:${lifeId}`,
      now,
      { enemyKind: input.kind },
    );
    return {
      enemy: { enemyId: state.enemyId, generation: state.generation, hp: 0, alive: false, respawnAt: respawnAt.toISOString() },
      damage,
      killed: true,
      reward: appliedDrops,
      xpGained: COMBAT_ENEMIES[input.kind].xp,
      player: publicCombatState({
        ...combat,
        hp: playerHp,
        maxHp: progression.maxHp,
        xp: progression.xp,
        level: progression.level,
        kills: combat.kills + 1,
      }),
      inventory,
    };
  });
}

export async function damageCombatPlayer(
  userId: string,
  rawDamage: number,
  riskTier: CombatRiskTier,
  position: { rx: number; ry: number; x: number; y: number },
): Promise<DamagePlayerResult> {
  const worldSeed = await getOrCreateWorldSeed();
  return serializableTransaction(async (tx) => {
    const combat = await ensureCombatState(tx, userId, true);
    if (combat.dead) return { player: publicCombatState(combat), damage: 0 };
    const inventory = await getInventoryInTransaction(tx, userId, true);
    const damage = reduceIncomingDamage(rawDamage, bestArmorReduction(inventory));
    const hp = Math.max(0, combat.hp - damage);
    if (hp > 0) {
      await tx.$executeRaw`
        UPDATE "PlayerCombatState" SET "hp" = ${hp}, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ${userId}
      `;
      return { player: publicCombatState({ ...combat, hp }), damage };
    }

    const deathToken = randomUUID();
    let lossPlan = planDeathLoss(inventory, riskTier);
    const deathInventory = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'death_loss',
      { deathToken, riskTier, rx: position.rx, ry: position.ry },
      { idempotencyKey: `death_loss:${deathToken}` },
      (snapshot) => {
        lossPlan = planDeathLoss(snapshot, riskTier);
        return {
          deltas: negativeDeltas(lossPlan.dropped),
          progressionLevel: lossPlan.progressionLevel,
          equippedWeapon: lossPlan.equippedWeapon,
        };
      },
    );

    let bag: PublicLootBag | null = null;
    if (hasItems(lossPlan.dropped)) {
      const rows = await tx.$queryRaw<LootBagRow[]>`
        INSERT INTO "WorldLootBag"
          ("id", "ownerUserId", "worldSeed", "rx", "ry", "x", "y", "items", "expiresAt", "createdAt")
        VALUES
          (${randomUUID()}, ${userId}, ${worldSeed}, ${position.rx}, ${position.ry}, ${position.x}, ${position.y},
           ${JSON.stringify(lossPlan.dropped)}::jsonb, ${new Date(Date.now() + BAG_LIFETIME_MS)}, CURRENT_TIMESTAMP)
        RETURNING "id", "ownerUserId", "rx", "ry", "x", "y", "items", "expiresAt", "claimedAt", "claimedById"
      `;
      if (!rows[0]) throw new Error('failed to create death bag');
      bag = publicBag(rows[0]);
    }

    const resetProgression = riskTier === 'lost';
    const level = resetProgression ? 1 : combat.level;
    const maxHp = resetProgression ? maxHpForLevel(1) : combat.maxHp;
    const xp = resetProgression ? 0 : combat.xp;
    await tx.$executeRaw`
      UPDATE "PlayerCombatState"
      SET "hp" = 0, "maxHp" = ${maxHp}, "xp" = ${xp}, "level" = ${level}, "dead" = true,
          "deathToken" = ${deathToken}, "deaths" = "deaths" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `;
    const player = publicCombatState({ ...combat, hp: 0, maxHp, xp, level, dead: true, deathToken, deaths: combat.deaths + 1 });
    return { player, damage, death: { token: deathToken, riskTier, bag, inventory: deathInventory } };
  });
}

export async function listActiveLootBags(rx: number, ry: number): Promise<PublicLootBag[]> {
  const worldSeed = await getOrCreateWorldSeed();
  return serializableTransaction(async (tx) => {
    const rows = await tx.$queryRaw<LootBagRow[]>`
      SELECT "id", "ownerUserId", "rx", "ry", "x", "y", "items", "expiresAt", "claimedAt", "claimedById"
      FROM "WorldLootBag"
      WHERE "worldSeed" = ${worldSeed} AND "rx" = ${rx} AND "ry" = ${ry}
        AND "claimedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP
      ORDER BY "createdAt" ASC
    `;
    return rows.map(publicBag);
  });
}

export async function claimWorldLootBag(userId: string, bagId: string, _claimId: string): Promise<{ bagId: string; inventory: InventoryCommandResult }> {
  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'world presence is not connected');
  return serializableTransaction(async (tx) => {
    const rows = await tx.$queryRaw<LootBagRow[]>`
      SELECT "id", "ownerUserId", "rx", "ry", "x", "y", "items", "expiresAt", "claimedAt", "claimedById"
      FROM "WorldLootBag" WHERE "id" = ${bagId} FOR UPDATE
    `;
    const bag = rows[0];
    if (!bag) throw new HttpError(409, 'loot bag is unavailable');
    if (bag.claimedAt && bag.claimedById !== userId) throw new HttpError(409, 'loot bag is unavailable');
    if (!bag.claimedAt && bag.expiresAt <= new Date()) throw new HttpError(409, 'loot bag is unavailable');
    if (!bag.claimedAt && (
      presence.rx !== bag.rx || presence.ry !== bag.ry || Math.hypot(presence.x - bag.x, presence.y - bag.y) > BAG_CLAIM_RADIUS
    )) {
      throw new HttpError(409, 'too far from loot bag');
    }
    const contents = parseInventoryStacks(bag.items);
    let applied: InventoryStacks = {};
    const inventory = await executeInventoryCommandInTransaction(
      tx,
      userId,
      'loot_bag_claim',
      { bagId },
      { idempotencyKey: `loot_bag:${bagId}` },
      (snapshot) => {
        applied = filterClaimableDrops(snapshot, contents);
        return { deltas: applied };
      },
    );
    if (!bag.claimedAt) {
      await tx.$executeRaw`
        UPDATE "WorldLootBag" SET "claimedAt" = CURRENT_TIMESTAMP, "claimedById" = ${userId} WHERE "id" = ${bagId}
      `;
    }
    return { bagId, inventory };
  });
}


export async function settleHiddenInstanceDeath(userId: string): Promise<DamagePlayerResult> {
  const persisted = await getPersistedWorldPosition(userId);
  const position = persisted ?? { rx: 0, ry: 0, x: 0, y: 0 };
  return damageCombatPlayer(userId, 1_000_000, 'lost', position);
}

export async function respawnCombatPlayer(userId: string, deathToken: string): Promise<{
  position: { rx: number; ry: number; x: number; y: number };
  player: PlayerCombatSnapshot;
  inventory: InventorySnapshot;
}> {
  const live = getFreshWorldPresence(userId);
  const persisted = live ? { rx: live.rx, ry: live.ry, x: live.x, y: live.y } : await getPersistedWorldPosition(userId);
  const source = persisted ?? { rx: 0, ry: 0, x: 0, y: 0 };
  const destination = capitalSpawnForLand(regionResourceProfileAt(source.rx, source.ry).landId);

  const result = await serializableTransaction(async (tx) => {
    const combat = await ensureCombatState(tx, userId, true);
    if (!combat.dead || combat.deathToken !== deathToken) throw new HttpError(409, 'invalid or expired death ticket');
    await tx.$executeRaw`
      INSERT INTO "PlayerWorldPosition" ("userId", "rx", "ry", "x", "y", "sessionId", "createdAt", "updatedAt")
      VALUES (${userId}, ${destination.rx}, ${destination.ry}, ${destination.x}, ${destination.y}, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET
        "rx" = EXCLUDED."rx", "ry" = EXCLUDED."ry", "x" = EXCLUDED."x", "y" = EXCLUDED."y", "updatedAt" = CURRENT_TIMESTAMP
    `;
    await tx.$executeRaw`
      UPDATE "PlayerCombatState"
      SET "hp" = "maxHp", "dead" = false, "deathToken" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `;
    const inventory = await getInventoryInTransaction(tx, userId, false);
    return { player: publicCombatState({ ...combat, hp: combat.maxHp, dead: false, deathToken: null }), inventory };
  });
  relocateWorldPresence(userId, destination);
  return { position: destination, ...result };
}
