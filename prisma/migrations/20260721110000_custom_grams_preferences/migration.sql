-- No FK constraint: relationMode = "prisma" emulates relations client-side.
CREATE TABLE "CustomGramsPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomGramsPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomGramsPreference_userId_language_key"
ON "CustomGramsPreference"("userId", "language");

CREATE INDEX "CustomGramsPreference_userId_idx" ON "CustomGramsPreference"("userId");
