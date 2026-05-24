/*
  Warnings:

  - You are about to drop the `BlogPost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Image` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "BlogPost";

-- DropTable
DROP TABLE "Image";

-- CreateTable
CREATE TABLE "PracticeStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "character" VARCHAR(1) NOT NULL,
    "total" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeStats_pkey" PRIMARY KEY ("id")
);
