-- CreateTable
CREATE TABLE "InternalLedgerEntry" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "resultBalance" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InternalLedgerEntry_idempotencyKey_key" ON "InternalLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InternalLedgerEntry_targetId_idx" ON "InternalLedgerEntry"("targetId");
