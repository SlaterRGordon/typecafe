CREATE TABLE "PublicWriteQuota" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicWriteQuota_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "PublicWriteQuota_expiresAt_idx" ON "PublicWriteQuota"("expiresAt");
