import { describe, expect, it } from 'vitest';
import { STORY_QUESTS } from '../quests/catalog.js';
import { advanceStoryProgress, type StoryProgressState } from '../quests/storyDomain.js';

const story = STORY_QUESTS[0];
const initial = (): StoryProgressState => ({ stageIndex: 0, progress: 0, stageData: {}, completed: false });

describe('authoritative story transition', () => {
  it('advances only the active ordered stage and never spills one event across stages', () => {
    const kill = advanceStoryProgress(story, initial(), 'enemy_kill', 99, { enemyKind: 'bug' });
    expect(kill).toMatchObject({ stageIndex: 1, progress: 0, completed: false, changed: true, stageCompleted: true });
    const unrelated = advanceStoryProgress(story, kill, 'enemy_kill', 1, { enemyKind: 'bug' });
    expect(unrelated.changed).toBe(false);
    expect(unrelated.stageIndex).toBe(1);
  });

  it('counts distinct travel once per canonical region key', () => {
    const travel: StoryProgressState = { stageIndex: 2, progress: 0, stageData: {}, completed: false };
    const first = advanceStoryProgress(story, travel, 'region_visit', 20, { regionKey: '1,0' });
    expect(first).toMatchObject({ progress: 1, stageIndex: 2, stageData: { seen: ['1,0'] } });
    const duplicate = advanceStoryProgress(story, first, 'region_visit', 1, { regionKey: '1,0' });
    expect(duplicate.changed).toBe(false);
    expect(duplicate.progress).toBe(1);
    const second = advanceStoryProgress(story, duplicate, 'region_visit', 1, { regionKey: '1,1' });
    expect(second).toMatchObject({ stageIndex: 3, progress: 0, stageCompleted: true });
  });

  it('requires the filtered Archivist event and marks the final stage complete', () => {
    const finalStage: StoryProgressState = { stageIndex: story.stages.length - 1, progress: 0, stageData: {}, completed: false };
    expect(advanceStoryProgress(story, finalStage, 'npc_interaction', 1, { npcRole: 'scout' }).changed).toBe(false);
    const completed = advanceStoryProgress(story, finalStage, 'npc_interaction', 1, { npcRole: 'archivist' });
    expect(completed).toMatchObject({ stageIndex: story.stages.length, progress: 0, completed: true, stageCompleted: true });
    expect(advanceStoryProgress(story, completed, 'npc_interaction', 1, { npcRole: 'archivist' }).changed).toBe(false);
  });

  it('rejects non-positive or non-integer event amounts', () => {
    expect(() => advanceStoryProgress(story, initial(), 'enemy_kill', 0, {})).toThrow();
    expect(() => advanceStoryProgress(story, initial(), 'enemy_kill', 1.5, {})).toThrow();
  });
});
