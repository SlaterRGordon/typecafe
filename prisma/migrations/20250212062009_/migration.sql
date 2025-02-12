/*
  Warnings:

  - A unique constraint covering the columns `[character]` on the table `PracticeStats` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PracticeStats_character_key" ON "PracticeStats"("character");
