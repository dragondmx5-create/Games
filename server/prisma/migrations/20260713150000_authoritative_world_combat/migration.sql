CREATE TABLE "PlayerCombatState" (
  "userId" TEXT NOT NULL,
  "hp" INTEGER NOT NULL DEFAULT 10,
  "maxHp" INTEGER NOT NULL DEFAULT 10,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "level" INTEGER NOT NULL DEFAULT 1,
  "dead" BOOLEAN NOT NULL DEFAULT false,
  "deathToken" TEXT,
  "deaths" INTEGER NOT NULL DEFAULT 0,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlayerCombatState_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "PlayerCombatState_deathToken_key" ON "PlayerCombatState"("deathToken");
ALTER TABLE "PlayerCombatState" ADD CONSTRAINT "PlayerCombatState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerCombatState" ADD CONSTRAINT "PlayerCombatState_hp_check" CHECK ("hp" >= 0 AND "maxHp" >= 1 AND "hp" <= "maxHp");
ALTER TABLE "PlayerCombatState" ADD CONSTRAINT "PlayerCombatState_level_check" CHECK ("level" BETWEEN 1 AND 200);
ALTER TABLE "PlayerCombatState" ADD CONSTRAINT "PlayerCombatState_xp_check" CHECK ("xp" >= 0);

CREATE TABLE "WorldEnemyKill" (
  "lifeId" TEXT NOT NULL,
  "enemyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "worldSeed" INTEGER NOT NULL,
  "rx" INTEGER NOT NULL,
  "ry" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "reward" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldEnemyKill_pkey" PRIMARY KEY ("lifeId")
);
CREATE INDEX "WorldEnemyKill_userId_createdAt_idx" ON "WorldEnemyKill"("userId", "createdAt");
CREATE INDEX "WorldEnemyKill_worldSeed_rx_ry_idx" ON "WorldEnemyKill"("worldSeed", "rx", "ry");
CREATE INDEX "WorldEnemyKill_worldSeed_rx_ry_enemyId_createdAt_idx" ON "WorldEnemyKill"("worldSeed", "rx", "ry", "enemyId", "createdAt");
ALTER TABLE "WorldEnemyKill" ADD CONSTRAINT "WorldEnemyKill_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorldLootBag" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "claimedById" TEXT,
  "worldSeed" INTEGER NOT NULL,
  "rx" INTEGER NOT NULL,
  "ry" INTEGER NOT NULL,
  "x" DOUBLE PRECISION NOT NULL,
  "y" DOUBLE PRECISION NOT NULL,
  "items" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldLootBag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorldLootBag_worldSeed_rx_ry_expiresAt_idx" ON "WorldLootBag"("worldSeed", "rx", "ry", "expiresAt");
CREATE INDEX "WorldLootBag_ownerUserId_createdAt_idx" ON "WorldLootBag"("ownerUserId", "createdAt");
ALTER TABLE "WorldLootBag" ADD CONSTRAINT "WorldLootBag_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorldLootBag" ADD CONSTRAINT "WorldLootBag_claimedById_fkey"
  FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
