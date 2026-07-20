import type { InventoryStacks } from '../inventory/types.js';

export type QuestEventKind =
  | 'enemy_kill'
  | 'resource_harvest'
  | 'world_chest'
  | 'region_visit'
  | 'dungeon_floor'
  | 'npc_interaction'
  | 'mineral_mined';

export interface QuestEventContext {
  enemyKind?: string;
  resourceKind?: string;
  regionKey?: string;
  dungeonId?: string;
  floor?: number;
  npcRole?: string;
  miningKind?: string;
}

export interface QuestDefinition {
  id: string;
  label: string;
  eventKind: QuestEventKind;
  target: number;
  rewardCrystals: number;
  rewardXp: number;
}

export interface StoryStageDefinition {
  id: string;
  title: string;
  description: string;
  eventKind: QuestEventKind;
  target: number;
  distinctBy?: keyof QuestEventContext;
  filters?: Partial<Record<keyof QuestEventContext, string | number | readonly (string | number)[]>>;
}

export interface StoryQuestDefinition {
  id: string;
  title: string;
  summary: string;
  stages: readonly StoryStageDefinition[];
  reward: InventoryStacks;
  rewardXp: number;
}

export const DAILY_QUESTS: readonly QuestDefinition[] = Object.freeze([
  { id: 'hunter-five', label: 'Defeat 5 overworld creatures', eventKind: 'enemy_kill', target: 5, rewardCrystals: 6, rewardXp: 8 },
  { id: 'gather-eight', label: 'Harvest 8 shared resource nodes', eventKind: 'resource_harvest', target: 8, rewardCrystals: 5, rewardXp: 7 },
  { id: 'salvage-two', label: 'Open 2 shared world chests', eventKind: 'world_chest', target: 2, rewardCrystals: 8, rewardXp: 10 },
]);

export const STORY_QUESTS: readonly StoryQuestDefinition[] = Object.freeze([
  {
    id: 'echoes-beneath-the-crown',
    title: 'Echoes Beneath the Crown',
    summary: 'Follow the broken royal trail from the frontier into the Old Crown depths.',
    stages: [
      {
        id: 'quiet-the-road',
        title: 'Quiet the Road',
        description: 'Defeat 3 server-owned enemies in the overworld.',
        eventKind: 'enemy_kill',
        target: 3,
      },
      {
        id: 'gather-the-signs',
        title: 'Gather the Signs',
        description: 'Collect 4 canonical resources or mined veins.',
        eventKind: 'resource_harvest',
        target: 4,
      },
      {
        id: 'walk-the-border',
        title: 'Walk the Border',
        description: 'Enter 2 distinct regions through validated world transitions.',
        eventKind: 'region_visit',
        target: 2,
        distinctBy: 'regionKey',
      },
      {
        id: 'prove-the-depths',
        title: 'Prove the Depths',
        description: 'Complete one authoritative Dungeon floor.',
        eventKind: 'dungeon_floor',
        target: 1,
      },
      {
        id: 'return-to-the-archivist',
        title: 'Return to the Archivist',
        description: 'Speak with a canonical Archivist NPC to seal the account.',
        eventKind: 'npc_interaction',
        target: 1,
        filters: { npcRole: 'archivist' },
      },
    ],
    reward: { 'currency.crystal': 30, 'container.supply_crate': 1 },
    rewardXp: 45,
  },
]);

const QUEST_BY_ID = new Map(DAILY_QUESTS.map((quest) => [quest.id, quest]));
const STORY_BY_ID = new Map(STORY_QUESTS.map((quest) => [quest.id, quest]));

export function questDefinition(questId: string): QuestDefinition | undefined {
  return QUEST_BY_ID.get(questId);
}

export function storyQuestDefinition(storyId: string): StoryQuestDefinition | undefined {
  return STORY_BY_ID.get(storyId);
}

export function questCycleKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function storyStageMatches(
  stage: StoryStageDefinition,
  eventKind: QuestEventKind,
  context: QuestEventContext,
): boolean {
  if (stage.eventKind !== eventKind) {
    // Mining is intentionally a collection source for story stages that ask
    // for gathered materials, while remaining a distinct event for analytics.
    if (!(stage.eventKind === 'resource_harvest' && eventKind === 'mineral_mined')) return false;
  }
  for (const [key, expected] of Object.entries(stage.filters ?? {}) as Array<[keyof QuestEventContext, string | number | readonly (string | number)[]]>) {
    const actual = context[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual as never)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}
