-- AlterTable: tests can belong to a daily challenge (null = ordinary test).
ALTER TABLE "Test" ADD COLUMN     "challengeDate" DATE;

-- CreateIndex
CREATE INDEX "Test_challengeDate_idx" ON "Test"("challengeDate");
