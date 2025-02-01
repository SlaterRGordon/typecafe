/*
  Warnings:

  - A unique constraint covering the columns `[imageId]` on the table `BlogPost` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[imageId]` on the table `ContentBlock` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `description` to the `BlogPost` table without a default value. This is not possible if the table is not empty.

*/

-- Drop existing rows in the BlogPost table
DELETE FROM "BlogPost";

-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "imageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_imageId_key" ON "BlogPost"("imageId");

-- CreateIndex
CREATE INDEX "BlogPost_imageId_idx" ON "BlogPost"("imageId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentBlock_imageId_key" ON "ContentBlock"("imageId");
