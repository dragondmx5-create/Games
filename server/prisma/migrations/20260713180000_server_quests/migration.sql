CREATE TABLE "PlayerQuestProgress" (
  "userId" TEXT NOT NULL,
  "cycleKey" TEXT NOT NULL,
  "questId" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerQuestProgress_pkey" PRIMARY KEY ("userId", "cycleKey", "questId"),
  CONSTRAINT "PlayerQuestProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PlayerQuestProgress_userId_cycleKey_idx" ON "PlayerQuestProgress"("userId", "cycleKey");

CREATE TABLE "PlayerQuestEvent" (
  "userId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "eventKind" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerQuestEvent_pkey" PRIMARY KEY ("userId", "eventKey"),
  CONSTRAINT "PlayerQuestEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PlayerQuestEvent_userId_createdAt_idx" ON "PlayerQuestEvent"("userId", "createdAt");
