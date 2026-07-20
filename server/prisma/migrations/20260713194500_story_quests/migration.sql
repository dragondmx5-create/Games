ALTER TABLE "PlayerQuestEvent"
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE "PlayerStoryQuest" (
  "userId" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "stageIndex" INTEGER NOT NULL DEFAULT 0,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "stageData" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerStoryQuest_pkey" PRIMARY KEY ("userId", "storyId")
);
ALTER TABLE "PlayerStoryQuest"
  ADD CONSTRAINT "PlayerStoryQuest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerStoryQuest"
  ADD CONSTRAINT "PlayerStoryQuest_stage_check" CHECK ("stageIndex" >= 0 AND "progress" >= 0);
CREATE INDEX "PlayerStoryQuest_userId_completedAt_claimedAt_idx"
  ON "PlayerStoryQuest"("userId", "completedAt", "claimedAt");
