-- AlterTable: ScoreShare gains a kind ("score" | "progress") and testId becomes
-- nullable so a progress share isn't tied to a single test.
ALTER TABLE "ScoreShare" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'score';
ALTER TABLE "ScoreShare" ALTER COLUMN "testId" DROP NOT NULL;
