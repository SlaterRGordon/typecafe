-- CreateTable
CREATE TABLE "TransitionStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" VARCHAR(2) NOT NULL,
    "count" INTEGER NOT NULL,
    "totalMs" INTEGER NOT NULL,
    "errors" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransitionStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransitionStat_userId_idx" ON "TransitionStat"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TransitionStat_userId_pair_key" ON "TransitionStat"("userId", "pair");
