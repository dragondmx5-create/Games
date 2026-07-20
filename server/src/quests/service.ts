import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import { awardProgressionInTransaction, getPlayerCombatStateInTransaction, type PlayerCombatSnapshot } from '../combat/service.js';
import { executeInventoryCommandInTransaction, getInventoryInTransaction, replayInventoryCommandInTransaction } from '../inventory/service.js';
import type { InventoryCommandResult } from '../inventory/types.js';
import { HttpError } from '../middleware/httpError.js';
import {
  DAILY_QUESTS,
  STORY_QUESTS,
  questCycleKey,
  questDefinition,
  storyQuestDefinition,
  type QuestEventContext,
  type QuestEventKind,
} from './catalog.js';
import { advanceStoryProgress, normalizeStoryStageData } from './storyDomain.js';

interface QuestRow {
  questId: string;
  progress: number;
  completedAt: Date | null;
  claimedAt: Date | null;
}

interface StoryRow {
  storyId: string;
  stageIndex: number;
  progress: number;
  stageData: Prisma.JsonValue;
  completedAt: Date | null;
  claimedAt: Date | null;
}

export interface PublicQuest {
  id: string;
  label: string;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  rewardCrystals: number;
  rewardXp: number;
}

export interface PublicStoryQuest {
  id: string;
  title: string;
  summary: string;
  stageIndex: number;
  totalStages: number;
  currentStage: null | {
    id: string;
    title: string;
    description: string;
    progress: number;
    target: number;
  };
  completed: boolean;
  claimed: boolean;
  reward: Record<string, number>;
  rewardXp: number;
}

export interface QuestListResult {
  cycleKey: string;
  quests: PublicQuest[];
  stories: PublicStoryQuest[];
}

export interface QuestClaimResult extends QuestListResult {
  inventoryCommand: InventoryCommandResult;
  player: PlayerCombatSnapshot;
}

async function ensureQuestRows(tx: Prisma.TransactionClient, userId: string, cycleKey: string): Promise<void> {
  for (const quest of DAILY_QUESTS) {
    await tx.$executeRaw`
      INSERT INTO "PlayerQuestProgress"
        ("userId", "cycleKey", "questId", "progress", "createdAt", "updatedAt")
      VALUES (${userId}, ${cycleKey}, ${quest.id}, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId", "cycleKey", "questId") DO NOTHING
    `;
  }
}

async function ensureStoryRows(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  for (const story of STORY_QUESTS) {
    await tx.$executeRaw`
      INSERT INTO "PlayerStoryQuest"
        ("userId", "storyId", "stageIndex", "progress", "stageData", "createdAt", "updatedAt")
      VALUES (${userId}, ${story.id}, 0, 0, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId", "storyId") DO NOTHING
    `;
  }
}

async function readQuestRows(tx: Prisma.TransactionClient, userId: string, cycleKey: string): Promise<QuestRow[]> {
  return tx.$queryRaw<QuestRow[]>`
    SELECT "questId", "progress", "completedAt", "claimedAt"
    FROM "PlayerQuestProgress"
    WHERE "userId" = ${userId} AND "cycleKey" = ${cycleKey}
    ORDER BY "createdAt", "questId"
  `;
}

async function readStoryRows(tx: Prisma.TransactionClient, userId: string, lock = false): Promise<StoryRow[]> {
  if (lock) {
    return tx.$queryRaw<StoryRow[]>`
      SELECT "storyId", "stageIndex", "progress", "stageData", "completedAt", "claimedAt"
      FROM "PlayerStoryQuest"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt", "storyId"
      FOR UPDATE
    `;
  }
  return tx.$queryRaw<StoryRow[]>`
    SELECT "storyId", "stageIndex", "progress", "stageData", "completedAt", "claimedAt"
    FROM "PlayerStoryQuest"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt", "storyId"
  `;
}

function publicQuests(rows: QuestRow[]): PublicQuest[] {
  const byId = new Map(rows.map((row) => [row.questId, row]));
  return DAILY_QUESTS.map((definition) => {
    const row = byId.get(definition.id);
    const progress = Math.min(definition.target, Math.max(0, row?.progress ?? 0));
    return {
      id: definition.id,
      label: definition.label,
      progress,
      target: definition.target,
      completed: progress >= definition.target || row?.completedAt != null,
      claimed: row?.claimedAt != null,
      rewardCrystals: definition.rewardCrystals,
      rewardXp: definition.rewardXp,
    };
  });
}

function publicStories(rows: StoryRow[]): PublicStoryQuest[] {
  const byId = new Map(rows.map((row) => [row.storyId, row]));
  return STORY_QUESTS.map((definition) => {
    const row = byId.get(definition.id);
    const stageIndex = Math.max(0, Math.min(definition.stages.length, row?.stageIndex ?? 0));
    const stage = definition.stages[stageIndex];
    return {
      id: definition.id,
      title: definition.title,
      summary: definition.summary,
      stageIndex,
      totalStages: definition.stages.length,
      currentStage: stage ? {
        id: stage.id,
        title: stage.title,
        description: stage.description,
        progress: Math.max(0, Math.min(stage.target, row?.progress ?? 0)),
        target: stage.target,
      } : null,
      completed: row?.completedAt != null || stageIndex >= definition.stages.length,
      claimed: row?.claimedAt != null,
      reward: { ...definition.reward },
      rewardXp: definition.rewardXp,
    };
  });
}

async function publicState(tx: Prisma.TransactionClient, userId: string, cycleKey: string): Promise<QuestListResult> {
  return {
    cycleKey,
    quests: publicQuests(await readQuestRows(tx, userId, cycleKey)),
    stories: publicStories(await readStoryRows(tx, userId)),
  };
}

export async function listPlayerQuests(userId: string, now = new Date()): Promise<QuestListResult> {
  const cycleKey = questCycleKey(now);
  return serializableTransaction(async (tx) => {
    await ensureQuestRows(tx, userId, cycleKey);
    await ensureStoryRows(tx, userId);
    return publicState(tx, userId, cycleKey);
  });
}

async function advanceStoryQuestsInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  eventKind: QuestEventKind,
  amount: number,
  context: QuestEventContext,
): Promise<void> {
  await ensureStoryRows(tx, userId);
  const rows = await readStoryRows(tx, userId, true);
  for (const row of rows) {
    const story = storyQuestDefinition(row.storyId);
    if (!story || row.completedAt || row.claimedAt) continue;
    const transition = advanceStoryProgress(
      story,
      {
        stageIndex: row.stageIndex,
        progress: row.progress,
        stageData: normalizeStoryStageData(row.stageData),
        completed: row.completedAt != null,
      },
      eventKind,
      amount,
      context,
    );
    if (!transition.changed) continue;
    await tx.$executeRaw`
      UPDATE "PlayerStoryQuest"
      SET "stageIndex" = ${transition.stageIndex},
          "progress" = ${transition.progress},
          "stageData" = ${JSON.stringify(transition.stageData)}::jsonb,
          "completedAt" = CASE WHEN ${transition.completed} THEN COALESCE("completedAt", CURRENT_TIMESTAMP) ELSE "completedAt" END,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "storyId" = ${row.storyId}
    `;
  }
}

/** Records a deduplicated, server-verified gameplay event inside the caller's
 * transaction. The client never submits quest progress directly. */
export async function recordQuestEventInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  eventKind: QuestEventKind,
  amount: number,
  eventKey: string,
  now = new Date(),
  context: QuestEventContext = {},
): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('quest event amount must be a positive integer');
  const inserted = await tx.$queryRaw<Array<{ eventKey: string }>>`
    INSERT INTO "PlayerQuestEvent" ("userId", "eventKey", "eventKind", "amount", "metadata", "createdAt")
    VALUES (${userId}, ${eventKey}, ${eventKind}, ${amount}, ${JSON.stringify(context)}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId", "eventKey") DO NOTHING
    RETURNING "eventKey"
  `;
  if (!inserted[0]) return;

  const cycleKey = questCycleKey(now);
  await ensureQuestRows(tx, userId, cycleKey);
  for (const quest of DAILY_QUESTS) {
    if (quest.eventKind !== eventKind) continue;
    await tx.$executeRaw`
      UPDATE "PlayerQuestProgress"
      SET "progress" = LEAST(${quest.target}, "progress" + ${amount}),
          "completedAt" = CASE
            WHEN "completedAt" IS NULL AND "progress" + ${amount} >= ${quest.target} THEN CURRENT_TIMESTAMP
            ELSE "completedAt"
          END,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "cycleKey" = ${cycleKey} AND "questId" = ${quest.id}
    `;
  }
  await advanceStoryQuestsInTransaction(tx, userId, eventKind, amount, context);
}

export function recordQuestEvent(
  userId: string,
  eventKind: QuestEventKind,
  amount: number,
  eventKey: string,
  now = new Date(),
  context: QuestEventContext = {},
): Promise<void> {
  return serializableTransaction((tx) => recordQuestEventInTransaction(tx, userId, eventKind, amount, eventKey, now, context));
}

export async function claimPlayerQuest(
  userId: string,
  questId: string,
  expectedRevision: number,
  idempotencyKey: string,
  now = new Date(),
): Promise<QuestClaimResult> {
  const definition = questDefinition(questId);
  if (!definition) throw new HttpError(404, 'unknown quest');
  const cycleKey = questCycleKey(now);
  const kind = 'claim_quest';
  const payload = { cycleKey, questId };

  return serializableTransaction(async (tx) => {
    const replay = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replay) {
      await ensureQuestRows(tx, userId, cycleKey);
      await ensureStoryRows(tx, userId);
      return { ...await publicState(tx, userId, cycleKey), inventoryCommand: replay, player: await getPlayerCombatStateInTransaction(tx, userId) };
    }

    // Keep the global economic lock order inventory -> quest. Verified combat,
    // harvesting and mining events already hold inventory before advancing
    // objectives; reversing that order here could deadlock a concurrent claim.
    await getInventoryInTransaction(tx, userId, true);
    const replayAfterInventoryLock = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    await ensureQuestRows(tx, userId, cycleKey);
    await ensureStoryRows(tx, userId);
    if (replayAfterInventoryLock) {
      return { ...await publicState(tx, userId, cycleKey), inventoryCommand: replayAfterInventoryLock, player: await getPlayerCombatStateInTransaction(tx, userId) };
    }

    const rows = await tx.$queryRaw<QuestRow[]>`
      SELECT "questId", "progress", "completedAt", "claimedAt"
      FROM "PlayerQuestProgress"
      WHERE "userId" = ${userId} AND "cycleKey" = ${cycleKey} AND "questId" = ${questId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row || row.progress < definition.target) throw new HttpError(409, 'quest is not complete');
    if (row.claimedAt) throw new HttpError(409, 'quest reward was already claimed');

    let player: PlayerCombatSnapshot | null = null;
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx,
      userId,
      kind,
      payload,
      { idempotencyKey, expectedRevision },
      async () => {
        player = await awardProgressionInTransaction(tx, userId, definition.rewardXp);
        return { deltas: { 'currency.crystal': definition.rewardCrystals }, progressionLevel: player.level };
      },
    );
    await tx.$executeRaw`
      UPDATE "PlayerQuestProgress"
      SET "claimedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "cycleKey" = ${cycleKey} AND "questId" = ${questId}
    `;
    return {
      ...await publicState(tx, userId, cycleKey),
      inventoryCommand,
      player: player ?? await getPlayerCombatStateInTransaction(tx, userId),
    };
  });
}

export async function claimPlayerStory(
  userId: string,
  storyId: string,
  expectedRevision: number,
  idempotencyKey: string,
  now = new Date(),
): Promise<QuestClaimResult> {
  const definition = storyQuestDefinition(storyId);
  if (!definition) throw new HttpError(404, 'unknown story quest');
  const cycleKey = questCycleKey(now);
  const kind = 'claim_story_quest';
  const payload = { storyId };

  return serializableTransaction(async (tx) => {
    const replay = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    if (replay) {
      await ensureQuestRows(tx, userId, cycleKey);
      await ensureStoryRows(tx, userId);
      return { ...await publicState(tx, userId, cycleKey), inventoryCommand: replay, player: await getPlayerCombatStateInTransaction(tx, userId) };
    }

    await getInventoryInTransaction(tx, userId, true);
    const replayAfterInventoryLock = await replayInventoryCommandInTransaction(tx, userId, kind, payload, { idempotencyKey });
    await ensureQuestRows(tx, userId, cycleKey);
    await ensureStoryRows(tx, userId);
    if (replayAfterInventoryLock) {
      return { ...await publicState(tx, userId, cycleKey), inventoryCommand: replayAfterInventoryLock, player: await getPlayerCombatStateInTransaction(tx, userId) };
    }

    const rows = await tx.$queryRaw<StoryRow[]>`
      SELECT "storyId", "stageIndex", "progress", "stageData", "completedAt", "claimedAt"
      FROM "PlayerStoryQuest"
      WHERE "userId" = ${userId} AND "storyId" = ${storyId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row?.completedAt || row.stageIndex < definition.stages.length) throw new HttpError(409, 'story quest is not complete');
    if (row.claimedAt) throw new HttpError(409, 'story reward was already claimed');

    let player: PlayerCombatSnapshot | null = null;
    const inventoryCommand = await executeInventoryCommandInTransaction(
      tx,
      userId,
      kind,
      payload,
      { idempotencyKey, expectedRevision },
      async () => {
        player = await awardProgressionInTransaction(tx, userId, definition.rewardXp);
        return { deltas: { ...definition.reward }, progressionLevel: player.level };
      },
    );
    await tx.$executeRaw`
      UPDATE "PlayerStoryQuest"
      SET "claimedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId} AND "storyId" = ${storyId}
    `;
    return {
      ...await publicState(tx, userId, cycleKey),
      inventoryCommand,
      player: player ?? await getPlayerCombatStateInTransaction(tx, userId),
    };
  });
}
