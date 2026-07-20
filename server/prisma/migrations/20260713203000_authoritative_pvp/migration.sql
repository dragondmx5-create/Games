CREATE TABLE "PvpSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roomKey" TEXT NOT NULL,
  "gateId" TEXT NOT NULL,
  "riskTier" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "admissionToken" TEXT NOT NULL,
  "inventoryRevision" INTEGER NOT NULL,
  "carriedSnapshot" JSONB NOT NULL,
  "sourceRx" INTEGER NOT NULL,
  "sourceRy" INTEGER NOT NULL,
  "sourceX" DOUBLE PRECISION NOT NULL,
  "sourceY" DOUBLE PRECISION NOT NULL,
  "returnRx" INTEGER NOT NULL,
  "returnRy" INTEGER NOT NULL,
  "returnX" DOUBLE PRECISION NOT NULL,
  "returnY" DOUBLE PRECISION NOT NULL,
  "hp" INTEGER NOT NULL,
  "maxHp" INTEGER NOT NULL,
  "playerX" DOUBLE PRECISION NOT NULL,
  "playerY" DOUBLE PRECISION NOT NULL,
  "playerFacing" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "basicReadyAt" TIMESTAMP(3),
  "abilityReadyAt" TIMESTAMP(3),
  "lastMoveAt" TIMESTAMP(3) NOT NULL,
  "deathToken" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "PvpSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PvpCommand" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PvpCommand_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PvpDeathReceipt" (
  "id" TEXT NOT NULL,
  "victimSessionId" TEXT NOT NULL,
  "killerSessionId" TEXT NOT NULL,
  "victimUserId" TEXT NOT NULL,
  "killerUserId" TEXT NOT NULL,
  "riskTier" TEXT NOT NULL,
  "transferred" JSONB NOT NULL,
  "destroyed" JSONB NOT NULL,
  "vaultCrystals" INTEGER NOT NULL DEFAULT 0,
  "victimInventory" JSONB NOT NULL,
  "killerInventory" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PvpDeathReceipt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PvpRoomLease" (
  "roomKey" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PvpRoomLease_pkey" PRIMARY KEY ("roomKey")
);
ALTER TABLE "PvpSession" ADD CONSTRAINT "PvpSession_riskTier_check" CHECK ("riskTier" IN ('fracture', 'lost'));
ALTER TABLE "PvpSession" ADD CONSTRAINT "PvpSession_status_check" CHECK ("status" IN ('active', 'death_pending', 'exited', 'dead'));
ALTER TABLE "PvpSession" ADD CONSTRAINT "PvpSession_hp_check" CHECK ("hp" >= 0 AND "maxHp" > 0 AND "hp" <= "maxHp");
ALTER TABLE "PvpSession" ADD CONSTRAINT "PvpSession_inventoryRevision_check" CHECK ("inventoryRevision" >= 0);
ALTER TABLE "PvpDeathReceipt" ADD CONSTRAINT "PvpDeathReceipt_vaultCrystals_check" CHECK ("vaultCrystals" >= 0);
CREATE UNIQUE INDEX "PvpSession_admissionToken_key" ON "PvpSession"("admissionToken");
CREATE UNIQUE INDEX "PvpSession_deathToken_key" ON "PvpSession"("deathToken");
CREATE UNIQUE INDEX "PvpSession_userId_blocking_key" ON "PvpSession"("userId") WHERE "status" IN ('active', 'death_pending');
CREATE INDEX "PvpSession_userId_status_createdAt_idx" ON "PvpSession"("userId", "status", "createdAt");
CREATE INDEX "PvpSession_roomKey_status_createdAt_idx" ON "PvpSession"("roomKey", "status", "createdAt");
CREATE UNIQUE INDEX "PvpCommand_userId_idempotencyKey_key" ON "PvpCommand"("userId", "idempotencyKey");
CREATE INDEX "PvpCommand_sessionId_createdAt_idx" ON "PvpCommand"("sessionId", "createdAt");
CREATE UNIQUE INDEX "PvpDeathReceipt_victimSessionId_key" ON "PvpDeathReceipt"("victimSessionId");
CREATE INDEX "PvpDeathReceipt_victimUserId_createdAt_idx" ON "PvpDeathReceipt"("victimUserId", "createdAt");
CREATE INDEX "PvpDeathReceipt_killerUserId_createdAt_idx" ON "PvpDeathReceipt"("killerUserId", "createdAt");
CREATE INDEX "PvpRoomLease_leaseExpiresAt_idx" ON "PvpRoomLease"("leaseExpiresAt");
ALTER TABLE "PvpSession" ADD CONSTRAINT "PvpSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PvpCommand" ADD CONSTRAINT "PvpCommand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PvpCommand" ADD CONSTRAINT "PvpCommand_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PvpSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PvpDeathReceipt" ADD CONSTRAINT "PvpDeathReceipt_victimSessionId_fkey" FOREIGN KEY ("victimSessionId") REFERENCES "PvpSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PvpDeathReceipt" ADD CONSTRAINT "PvpDeathReceipt_killerSessionId_fkey" FOREIGN KEY ("killerSessionId") REFERENCES "PvpSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PvpDeathReceipt" ADD CONSTRAINT "PvpDeathReceipt_victimUserId_fkey" FOREIGN KEY ("victimUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PvpDeathReceipt" ADD CONSTRAINT "PvpDeathReceipt_killerUserId_fkey" FOREIGN KEY ("killerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
