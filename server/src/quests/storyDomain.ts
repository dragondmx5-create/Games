import {
  storyStageMatches,
  type QuestEventContext,
  type QuestEventKind,
  type StoryQuestDefinition,
} from './catalog.js';

export interface StoryStageData {
  seen?: string[];
}

export interface StoryProgressState {
  stageIndex: number;
  progress: number;
  stageData: StoryStageData;
  completed: boolean;
}

export interface StoryProgressTransition extends StoryProgressState {
  changed: boolean;
  stageCompleted: boolean;
}

export function normalizeStoryStageData(value: unknown): StoryStageData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const seen = (value as { seen?: unknown }).seen;
  return {
    seen: Array.isArray(seen)
      ? seen.filter((entry): entry is string => typeof entry === 'string').slice(-128)
      : [],
  };
}

/** Pure ordered story transition. Only an already-verified server event may
 * call this function; it intentionally advances at most one stage per event
 * so a large reward/count from one source cannot skip narrative gates. */
export function advanceStoryProgress(
  story: StoryQuestDefinition,
  state: StoryProgressState,
  eventKind: QuestEventKind,
  amount: number,
  context: QuestEventContext,
): StoryProgressTransition {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('story event amount must be a positive integer');
  if (state.completed || state.stageIndex >= story.stages.length) {
    return { ...state, completed: true, changed: false, stageCompleted: false };
  }

  const stage = story.stages[state.stageIndex];
  if (!stage || !storyStageMatches(stage, eventKind, context)) {
    return { ...state, changed: false, stageCompleted: false };
  }

  const data = normalizeStoryStageData(state.stageData);
  let increment = amount;
  if (stage.distinctBy) {
    const distinctValue = context[stage.distinctBy];
    if (distinctValue == null) return { ...state, changed: false, stageCompleted: false };
    const key = String(distinctValue);
    if (data.seen?.includes(key)) return { ...state, stageData: data, changed: false, stageCompleted: false };
    data.seen = [...(data.seen ?? []), key].slice(-128);
    increment = 1;
  }

  const nextProgress = Math.min(stage.target, Math.max(0, state.progress) + increment);
  const stageCompleted = nextProgress >= stage.target;
  const stageIndex = stageCompleted ? state.stageIndex + 1 : state.stageIndex;
  const completed = stageIndex >= story.stages.length;
  return {
    stageIndex,
    progress: stageCompleted ? 0 : nextProgress,
    stageData: stageCompleted ? {} : data,
    completed,
    changed: true,
    stageCompleted,
  };
}
