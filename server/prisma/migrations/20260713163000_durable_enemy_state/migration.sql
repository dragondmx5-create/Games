ALTER TABLE "PlayerCombatState"
  ADD COLUMN "basicReadyAt" TIMESTAMP(3),
  ADD COLUMN "abilityReadyAt" TIMESTAMP(3);

CREATE TABLE "WorldEnemyState" (
  "enemyId" TEXT NOT NULL,
  "worldSeed" INTEGER NOT NULL,
  "rx" INTEGER NOT NULL,
  "ry" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 0,
  "hp" INTEGER NOT NULL,
  "respawnAt" TIMESTAMP(3),
  "lastKilledBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldEnemyState_pkey" PRIMARY KEY ("enemyId")
);

CREATE INDEX "WorldEnemyState_worldSeed_rx_ry_idx"
  ON "WorldEnemyState"("worldSeed", "rx", "ry");
CREATE INDEX "WorldEnemyState_respawnAt_idx"
  ON "WorldEnemyState"("respawnAt");
