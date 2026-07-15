-- Preserve evidence context and make guest Timeline imports idempotent.
ALTER TABLE "Test"
ADD COLUMN "evidenceContext" TEXT,
ADD COLUMN "guestLocalId" TEXT;

-- Legacy rows only earn a context when their old ranking contract proves they
-- were ordinary normal Tests. Unranked/other-mode rows remain unclassified.
UPDATE "Test" AS test
SET "evidenceContext" = 'natural'
FROM "TestType" AS type
WHERE test."typeId" = type."id"
  AND test."ranked" = TRUE
  AND type."mode" = 0;

CREATE UNIQUE INDEX "Test_userId_guestLocalId_key" ON "Test"("userId", "guestLocalId");
