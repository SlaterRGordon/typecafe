-- No FK constraint: the schema runs relationMode = "prisma" (relations are
-- emulated client-side, like every other table here); a DB-level FK would be
-- drift the next `migrate dev` tries to undo.
CREATE TABLE "CoachingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "pool" TEXT NOT NULL DEFAULT 'qwerty',
    "language" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachingSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachingSession_userId_dateKey_pool_language_key"
ON "CoachingSession"("userId", "dateKey", "pool", "language");

CREATE INDEX "CoachingSession_userId_idx" ON "CoachingSession"("userId");
