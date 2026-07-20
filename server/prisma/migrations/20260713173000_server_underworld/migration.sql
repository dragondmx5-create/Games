CREATE TABLE "PlayerUnderworldState" (
  "userId" TEXT NOT NULL,
  "reputation" INTEGER NOT NULL DEFAULT 0,
  "discoveredRoutes" JSONB NOT NULL,
  "revealedLostLands" JSONB NOT NULL,
  "forbiddenDungeonKeys" INTEGER NOT NULL DEFAULT 0,
  "activeContracts" INTEGER NOT NULL DEFAULT 0,
  "inspectionProtection" INTEGER NOT NULL DEFAULT 0,
  "activeSessionToken" TEXT,
  "activeSourceLand" TEXT,
  "sessionExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerUnderworldState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "PlayerUnderworldState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlayerUnderworldState_activeSessionToken_key" ON "PlayerUnderworldState"("activeSessionToken");
CREATE INDEX "PlayerUnderworldState_sessionExpiresAt_idx" ON "PlayerUnderworldState"("sessionExpiresAt");
