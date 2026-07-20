CREATE TABLE "MarketListing" (
  "id" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "buyerUserId" TEXT,
  "landId" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createCommandKey" TEXT NOT NULL,
  "closeCommandKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "soldAt" TIMESTAMP(3),
  CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketListing_quantity_check" CHECK ("quantity" > 0 AND "quantity" <= 10000),
  CONSTRAINT "MarketListing_unit_price_check" CHECK ("unitPrice" > 0 AND "unitPrice" <= 100000),
  CONSTRAINT "MarketListing_status_check" CHECK ("status" IN ('active', 'sold', 'cancelled'))
);
CREATE UNIQUE INDEX "MarketListing_sellerUserId_createCommandKey_key" ON "MarketListing"("sellerUserId", "createCommandKey");
CREATE INDEX "MarketListing_status_landId_unitPrice_createdAt_idx" ON "MarketListing"("status", "landId", "unitPrice", "createdAt");
CREATE INDEX "MarketListing_sellerUserId_status_idx" ON "MarketListing"("sellerUserId", "status");
CREATE INDEX "MarketListing_buyerUserId_soldAt_idx" ON "MarketListing"("buyerUserId", "soldAt");
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PlayerTradeSession" (
  "id" TEXT NOT NULL,
  "initiatorUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "initiatorOffer" JSONB NOT NULL,
  "targetOffer" JSONB NOT NULL,
  "initiatorRevision" INTEGER NOT NULL,
  "targetRevision" INTEGER NOT NULL,
  "initiatorAccepted" BOOLEAN NOT NULL DEFAULT false,
  "targetAccepted" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PlayerTradeSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerTradeSession_distinct_players_check" CHECK ("initiatorUserId" <> "targetUserId"),
  CONSTRAINT "PlayerTradeSession_status_check" CHECK ("status" IN ('pending', 'completed', 'cancelled'))
);
CREATE INDEX "PlayerTradeSession_initiatorUserId_status_expiresAt_idx" ON "PlayerTradeSession"("initiatorUserId", "status", "expiresAt");
CREATE INDEX "PlayerTradeSession_targetUserId_status_expiresAt_idx" ON "PlayerTradeSession"("targetUserId", "status", "expiresAt");
CREATE INDEX "PlayerTradeSession_status_expiresAt_idx" ON "PlayerTradeSession"("status", "expiresAt");
ALTER TABLE "PlayerTradeSession" ADD CONSTRAINT "PlayerTradeSession_initiatorUserId_fkey" FOREIGN KEY ("initiatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerTradeSession" ADD CONSTRAINT "PlayerTradeSession_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
