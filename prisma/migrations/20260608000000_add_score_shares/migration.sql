-- CreateTable
CREATE TABLE "ScoreShare" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoreShare_slug_key" ON "ScoreShare"("slug");

-- CreateIndex
CREATE INDEX "ScoreShare_testId_idx" ON "ScoreShare"("testId");

-- CreateIndex
CREATE INDEX "ScoreShare_userId_idx" ON "ScoreShare"("userId");

-- CreateIndex
CREATE INDEX "ScoreShare_expiresAt_idx" ON "ScoreShare"("expiresAt");
