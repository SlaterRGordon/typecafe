/*
  Warnings:

  - You are about to drop the `ContentBlock` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `content` to the `BlogPost` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "content" TEXT NOT NULL;

-- DropTable
DROP TABLE "ContentBlock";

-- DropEnum
DROP TYPE "ContentType";
