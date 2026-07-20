-- Phase 4 / step 1: canonical server-owned inventory and idempotent command log.
CREATE TABLE "PlayerInventory" (
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "progressionLevel" INTEGER NOT NULL DEFAULT 1,
    "hasPet" BOOLEAN NOT NULL DEFAULT false,
    "equippedWeapon" TEXT NOT NULL DEFAULT 'weapon.bone',
    "migratedFromSave" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerInventory_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "InventoryStack" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "InventoryStack_pkey" PRIMARY KEY ("userId", "itemId")
);

CREATE TABLE "InventoryCommand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCommand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryStack_itemId_idx" ON "InventoryStack"("itemId");
CREATE UNIQUE INDEX "InventoryCommand_userId_idempotencyKey_key" ON "InventoryCommand"("userId", "idempotencyKey");
CREATE INDEX "InventoryCommand_userId_createdAt_idx" ON "InventoryCommand"("userId", "createdAt");

ALTER TABLE "PlayerInventory" ADD CONSTRAINT "PlayerInventory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryStack" ADD CONSTRAINT "InventoryStack_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "PlayerInventory"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "PlayerInventory"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryStack" ADD CONSTRAINT "InventoryStack_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "PlayerInventory" ADD CONSTRAINT "PlayerInventory_revision_check" CHECK ("revision" >= 0);
ALTER TABLE "PlayerInventory" ADD CONSTRAINT "PlayerInventory_level_check" CHECK ("progressionLevel" BETWEEN 1 AND 200);
