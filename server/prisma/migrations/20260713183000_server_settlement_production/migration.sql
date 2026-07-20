CREATE TABLE "PlayerFarmPlot" (
  "userId" TEXT NOT NULL,
  "plotId" TEXT NOT NULL,
  "rx" INTEGER NOT NULL,
  "ry" INTEGER NOT NULL,
  "crop" TEXT,
  "plantedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "harvestCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerFarmPlot_pkey" PRIMARY KEY ("userId", "plotId"),
  CONSTRAINT "PlayerFarmPlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PlayerFarmPlot_userId_rx_ry_idx" ON "PlayerFarmPlot"("userId", "rx", "ry");

CREATE TABLE "PlayerAnimalState" (
  "userId" TEXT NOT NULL,
  "animalId" TEXT NOT NULL,
  "rx" INTEGER NOT NULL,
  "ry" INTEGER NOT NULL,
  "readyAt" TIMESTAMP(3) NOT NULL,
  "collectCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerAnimalState_pkey" PRIMARY KEY ("userId", "animalId"),
  CONSTRAINT "PlayerAnimalState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PlayerAnimalState_userId_rx_ry_idx" ON "PlayerAnimalState"("userId", "rx", "ry");
