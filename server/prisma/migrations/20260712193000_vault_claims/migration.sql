-- One claim per account + dungeon run seed + vault layer. The route uses
-- this as its idempotency ledger, so retries can return the original reward.
CREATE TABLE "VaultClaim" (
    "id" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "layer" INTEGER NOT NULL,
    "claimed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultClaim_runKey_key" ON "VaultClaim"("runKey");
CREATE INDEX "VaultClaim_userId_idx" ON "VaultClaim"("userId");
ALTER TABLE "VaultClaim" ADD CONSTRAINT "VaultClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
