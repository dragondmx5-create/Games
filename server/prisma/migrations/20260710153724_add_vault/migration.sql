-- CreateTable
CREATE TABLE "Vault" (
    "layer" INTEGER NOT NULL,
    "crystals" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("layer")
);
