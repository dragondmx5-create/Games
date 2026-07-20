CREATE TABLE "WorldChestState" (
  "chestId" TEXT NOT NULL,
  "worldSeed" INTEGER NOT NULL,
  "rx" INTEGER NOT NULL,
  "ry" INTEGER NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL,
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "lastOpenedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldChestState_pkey" PRIMARY KEY ("chestId")
);

CREATE INDEX "WorldChestState_worldSeed_rx_ry_idx"
  ON "WorldChestState"("worldSeed", "rx", "ry");
CREATE INDEX "WorldChestState_availableAt_idx"
  ON "WorldChestState"("availableAt");
