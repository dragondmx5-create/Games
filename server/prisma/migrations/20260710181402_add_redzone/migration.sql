-- CreateTable
CREATE TABLE "RedZonePlayer" (
    "userId" TEXT NOT NULL,
    "crystals" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RedZonePlayer_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "RedZonePlayer" ADD CONSTRAINT "RedZonePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
