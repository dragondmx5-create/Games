import { describe, expect, it } from 'vitest';
import {
  DAILY_QUESTS,
  STORY_QUESTS,
  questCycleKey,
  questDefinition,
  storyQuestDefinition,
  storyStageMatches,
} from '../quests/catalog.js';

describe('server quest catalog', () => {
  it('has unique positive, claimable objective definitions', () => {
    expect(new Set(DAILY_QUESTS.map((quest) => quest.id)).size).toBe(DAILY_QUESTS.length);
    for (const quest of DAILY_QUESTS) {
      expect(quest.target).toBeGreaterThan(0);
      expect(quest.rewardCrystals).toBeGreaterThanOrEqual(0);
      expect(quest.rewardXp).toBeGreaterThanOrEqual(0);
      expect(questDefinition(quest.id)).toEqual(quest);
    }
  });

  it('uses a stable UTC daily cycle key', () => {
    expect(questCycleKey(new Date('2026-07-13T23:59:59.999Z'))).toBe('2026-07-13');
    expect(questCycleKey(new Date('2026-07-14T00:00:00.000Z'))).toBe('2026-07-14');
  });

  it('defines ordered multi-stage stories with an authoritative final reward', () => {
    expect(STORY_QUESTS.length).toBeGreaterThan(0);
    for (const story of STORY_QUESTS) {
      expect(storyQuestDefinition(story.id)).toEqual(story);
      expect(story.stages.length).toBeGreaterThanOrEqual(3);
      expect(new Set(story.stages.map((stage) => stage.id)).size).toBe(story.stages.length);
      expect(story.stages.every((stage) => stage.target > 0)).toBe(true);
      expect(Object.values(story.reward).some((amount) => amount > 0)).toBe(true);
      expect(story.rewardXp).toBeGreaterThan(0);
    }
  });

  it('matches kill, collect, distinct travel, dungeon, and filtered NPC events', () => {
    const story = STORY_QUESTS[0];
    expect(storyStageMatches(story.stages[0], 'enemy_kill', { enemyKind: 'bug' })).toBe(true);
    expect(storyStageMatches(story.stages[1], 'resource_harvest', { resourceKind: 'tree' })).toBe(true);
    expect(storyStageMatches(story.stages[1], 'mineral_mined', { miningKind: 'iron_vein' })).toBe(true);
    expect(story.stages[2].distinctBy).toBe('regionKey');
    expect(storyStageMatches(story.stages[2], 'region_visit', { regionKey: '1,0' })).toBe(true);
    expect(storyStageMatches(story.stages[3], 'dungeon_floor', { dungeonId: 'old-crown-mine', floor: 1 })).toBe(true);
    expect(storyStageMatches(story.stages[4], 'npc_interaction', { npcRole: 'archivist' })).toBe(true);
    expect(storyStageMatches(story.stages[4], 'npc_interaction', { npcRole: 'scout' })).toBe(false);
  });
});
