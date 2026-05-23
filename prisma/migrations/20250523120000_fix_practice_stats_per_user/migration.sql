-- DropIndex
DROP INDEX "PracticeStats_character_key";

-- CreateIndex
CREATE INDEX "PracticeStats_userId_idx" ON "PracticeStats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeStats_userId_character_key" ON "PracticeStats"("userId", "character");
