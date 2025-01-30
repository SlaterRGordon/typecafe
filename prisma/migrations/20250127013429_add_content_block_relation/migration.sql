/*
  Warnings:

  - You are about to drop the column `content` on the `BlogPost` table. All the data in the column will be lost.
  - You are about to drop the column `blogPostId` on the `Image` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('HEADER', 'PARAGRAPH', 'IMAGE');

-- DropIndex
DROP INDEX "Image_blogPostId_idx";

-- AlterTable
ALTER TABLE "BlogPost" DROP COLUMN "content";

-- AlterTable
ALTER TABLE "Image" DROP COLUMN "blogPostId",
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "content" TEXT,
    "imageId" TEXT,
    "order" INTEGER NOT NULL,
    "blogPostId" TEXT NOT NULL,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentBlock_blogPostId_idx" ON "ContentBlock"("blogPostId");

-- CreateIndex
CREATE INDEX "ContentBlock_imageId_idx" ON "ContentBlock"("imageId");

-- CreateIndex
CREATE INDEX "Image_id_idx" ON "Image"("id");
