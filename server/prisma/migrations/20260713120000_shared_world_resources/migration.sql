CREATE TABLE "WorldResourceState" (
  "nodeId" TEXT NOT NULL,
  "worldSeed" INTEGER NOT NULL,
  "rx" INTEGER NOT NULL,
  "ry" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL,
  "harvestCount" INTEGER NOT NULL DEFAULT 0,
  "lastHarvestedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorldResourceState_pkey" PRIMARY KEY ("nodeId")
);
CREATE INDEX "WorldResourceState_worldSeed_rx_ry_idx" ON "WorldResourceState"("worldSeed", "rx", "ry");
CREATE INDEX "WorldResourceState_availableAt_idx" ON "WorldResourceState"("availableAt");
