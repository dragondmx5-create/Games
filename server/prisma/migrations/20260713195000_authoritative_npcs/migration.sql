CREATE TABLE "NpcInteractionReceipt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NpcInteractionReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NpcInteractionReceipt_userId_idempotencyKey_key"
  ON "NpcInteractionReceipt"("userId", "idempotencyKey");
CREATE INDEX "NpcInteractionReceipt_userId_createdAt_idx"
  ON "NpcInteractionReceipt"("userId", "createdAt");
ALTER TABLE "NpcInteractionReceipt"
  ADD CONSTRAINT "NpcInteractionReceipt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
