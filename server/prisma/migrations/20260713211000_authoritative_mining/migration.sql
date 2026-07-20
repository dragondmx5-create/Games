CREATE TABLE "WorldMiningState" (
  "nodeId" TEXT NOT NULL,
  "worldSeed" INTEGER NOT NULL,
  "rx" INTEGER NOT NULL,
  "ry" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "integrity" INTEGER NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL,
  "extractionCount" INTEGER NOT NULL DEFAULT 0,
  "lastMinedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorldMiningState_pkey" PRIMARY KEY ("nodeId"),
  CONSTRAINT "WorldMiningState_kind_check" CHECK ("kind" IN ('iron_vein', 'crystal_geode', 'ancient_seam')),
  CONSTRAINT "WorldMiningState_integrity_check" CHECK ("integrity" > 0 AND "integrity" <= 5),
  CONSTRAINT "WorldMiningState_extractionCount_check" CHECK ("extractionCount" >= 0)
);
CREATE INDEX "WorldMiningState_worldSeed_rx_ry_idx" ON "WorldMiningState"("worldSeed", "rx", "ry");
CREATE INDEX "WorldMiningState_availableAt_idx" ON "WorldMiningState"("availableAt");
