-- CreateTable
CREATE TABLE "DailyUserStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tests" INTEGER NOT NULL,
    "bestWpm" DOUBLE PRECISION NOT NULL,
    "avgWpm" DOUBLE PRECISION NOT NULL,
    "avgAccuracy" DOUBLE PRECISION NOT NULL,
    "avgConsistency" DOUBLE PRECISION,
    "consistencySamples" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyUserStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyUserStat_userId_idx" ON "DailyUserStat"("userId");

-- CreateIndex
CREATE INDEX "DailyUserStat_date_idx" ON "DailyUserStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUserStat_userId_date_key" ON "DailyUserStat"("userId", "date");
