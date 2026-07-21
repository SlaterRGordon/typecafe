-- Catch-up migration: national keyboard layouts (feat 9263aab) reached the DB via
-- `db push` without a migration. This records those changes plus dropping the stray
-- CoachingSession.updatedAt default that 20260711180000 created but the schema never declared.

-- DropIndex
DROP INDEX "PracticeStats_userId_character_key";
-- DropIndex
DROP INDEX "TransitionStat_userId_pair_key";
-- DropIndex
DROP INDEX "LearnProgress_userId_difficulty_options_key";

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "layout" TEXT NOT NULL DEFAULT 'qwerty';
-- AlterTable
ALTER TABLE "PracticeStats" ADD COLUMN     "pool" TEXT NOT NULL DEFAULT 'qwerty';
-- AlterTable
ALTER TABLE "TransitionStat" ADD COLUMN     "pool" TEXT NOT NULL DEFAULT 'qwerty';
-- AlterTable
ALTER TABLE "LearnProgress" ADD COLUMN     "pool" TEXT NOT NULL DEFAULT 'qwerty';

-- CreateIndex
CREATE UNIQUE INDEX "PracticeStats_userId_pool_character_key" ON "PracticeStats"("userId", "pool", "character");
-- CreateIndex
CREATE UNIQUE INDEX "TransitionStat_userId_pool_pair_key" ON "TransitionStat"("userId", "pool", "pair");
-- CreateIndex
CREATE UNIQUE INDEX "LearnProgress_userId_difficulty_pool_options_key" ON "LearnProgress"("userId", "difficulty", "pool", "options");

-- AlterTable
ALTER TABLE "CoachingSession" ALTER COLUMN "updatedAt" DROP DEFAULT;
