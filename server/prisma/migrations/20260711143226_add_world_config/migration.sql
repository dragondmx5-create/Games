-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "WorldConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "worldSeed" INTEGER NOT NULL,

    CONSTRAINT "WorldConfig_pkey" PRIMARY KEY ("id")
);
