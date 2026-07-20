CREATE TABLE "DungeonRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dungeonId" TEXT NOT NULL,
  "runSeed" INTEGER NOT NULL,
  "floor" INTEGER NOT NULL,
  "floorSeed" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "topology" JSONB NOT NULL,
  "enemies" JSONB NOT NULL,
  "chests" JSONB NOT NULL,
  "playerX" DOUBLE PRECISION NOT NULL,
  "playerY" DOUBLE PRECISION NOT NULL,
  "playerFacing" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "playerHp" INTEGER NOT NULL,
  "playerMaxHp" INTEGER NOT NULL,
  "returnRx" INTEGER NOT NULL,
  "returnRy" INTEGER NOT NULL,
  "returnX" DOUBLE PRECISION NOT NULL,
  "returnY" DOUBLE PRECISION NOT NULL,
  "keyConsumed" BOOLEAN NOT NULL DEFAULT false,
  "contractSettled" BOOLEAN NOT NULL DEFAULT false,
  "floorCompleted" BOOLEAN NOT NULL DEFAULT false,
  "basicReadyAt" TIMESTAMP(3),
  "abilityReadyAt" TIMESTAMP(3),
  "lastMoveAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "DungeonRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DungeonCommand" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DungeonCommand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DungeonFloorReceipt" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "floor" INTEGER NOT NULL,
  "boss" BOOLEAN NOT NULL DEFAULT false,
  "proofHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DungeonFloorReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DungeonVaultProof" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "layer" INTEGER NOT NULL,
  "proofHash" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DungeonVaultProof_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DungeonRun" ADD CONSTRAINT "DungeonRun_status_check" CHECK ("status" IN ('active', 'death_pending', 'completed', 'exited', 'dead'));
ALTER TABLE "DungeonRun" ADD CONSTRAINT "DungeonRun_floor_check" CHECK ("floor" >= 1);
ALTER TABLE "DungeonRun" ADD CONSTRAINT "DungeonRun_revision_check" CHECK ("revision" >= 0);
ALTER TABLE "DungeonRun" ADD CONSTRAINT "DungeonRun_hp_check" CHECK ("playerHp" >= 0 AND "playerMaxHp" > 0 AND "playerHp" <= "playerMaxHp");
ALTER TABLE "DungeonFloorReceipt" ADD CONSTRAINT "DungeonFloorReceipt_floor_check" CHECK ("floor" >= 1);
ALTER TABLE "DungeonVaultProof" ADD CONSTRAINT "DungeonVaultProof_layer_check" CHECK ("layer" IN (1, 5));

CREATE UNIQUE INDEX "DungeonRun_userId_blocking_key" ON "DungeonRun"("userId") WHERE "status" IN ('active', 'death_pending');
CREATE INDEX "DungeonRun_userId_status_createdAt_idx" ON "DungeonRun"("userId", "status", "createdAt");
CREATE INDEX "DungeonRun_dungeonId_createdAt_idx" ON "DungeonRun"("dungeonId", "createdAt");
CREATE UNIQUE INDEX "DungeonCommand_userId_idempotencyKey_key" ON "DungeonCommand"("userId", "idempotencyKey");
CREATE INDEX "DungeonCommand_runId_createdAt_idx" ON "DungeonCommand"("runId", "createdAt");
CREATE UNIQUE INDEX "DungeonFloorReceipt_proofHash_key" ON "DungeonFloorReceipt"("proofHash");
CREATE UNIQUE INDEX "DungeonFloorReceipt_runId_floor_key" ON "DungeonFloorReceipt"("runId", "floor");
CREATE INDEX "DungeonFloorReceipt_userId_createdAt_idx" ON "DungeonFloorReceipt"("userId", "createdAt");
CREATE UNIQUE INDEX "DungeonVaultProof_proofHash_key" ON "DungeonVaultProof"("proofHash");
CREATE UNIQUE INDEX "DungeonVaultProof_runId_layer_key" ON "DungeonVaultProof"("runId", "layer");
CREATE INDEX "DungeonVaultProof_userId_layer_claimedAt_createdAt_idx" ON "DungeonVaultProof"("userId", "layer", "claimedAt", "createdAt");

ALTER TABLE "DungeonRun" ADD CONSTRAINT "DungeonRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DungeonCommand" ADD CONSTRAINT "DungeonCommand_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DungeonRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DungeonCommand" ADD CONSTRAINT "DungeonCommand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DungeonFloorReceipt" ADD CONSTRAINT "DungeonFloorReceipt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DungeonRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DungeonFloorReceipt" ADD CONSTRAINT "DungeonFloorReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DungeonVaultProof" ADD CONSTRAINT "DungeonVaultProof_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DungeonRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DungeonVaultProof" ADD CONSTRAINT "DungeonVaultProof_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
