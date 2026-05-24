-- CreateTable
CREATE TABLE "LearnProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearnProgress_userId_idx" ON "LearnProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LearnProgress_userId_difficulty_options_key" ON "LearnProgress"("userId", "difficulty", "options");
