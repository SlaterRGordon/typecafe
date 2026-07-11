-- Test.score is the indexed/sortable canonical ranking value: net WPM.
UPDATE "Test"
SET "score" = GREATEST(0, "speed" * (2 * "accuracy" / 100.0 - 1));

-- Version 1 rollups stored average raw WPM + average accuracy, which cannot be
-- converted exactly because averaging loses their covariance. Preserve those
-- rows as v1. Upgrade only rows whose entire aggregate can be rebuilt exactly
-- from ranked Test rows; new writes default to v2.
ALTER TABLE "DailyUserStat"
ADD COLUMN "metricVersion" INTEGER NOT NULL DEFAULT 1;

WITH exact AS (
    SELECT
        "userId",
        "summaryDate" AS date,
        COUNT(*)::INTEGER AS tests,
        MAX(GREATEST(0, "speed" * (2 * "accuracy" / 100.0 - 1))) AS "bestWpm",
        AVG(GREATEST(0, "speed" * (2 * "accuracy" / 100.0 - 1))) AS "avgWpm",
        AVG("accuracy") AS "avgAccuracy",
        AVG("consistency") AS "avgConsistency",
        COUNT("consistency")::INTEGER AS "consistencySamples"
    FROM "Test"
    WHERE "ranked" = true
    GROUP BY "userId", "summaryDate"
)
UPDATE "DailyUserStat" AS daily
SET
    "bestWpm" = exact."bestWpm",
    "avgWpm" = exact."avgWpm",
    "avgAccuracy" = exact."avgAccuracy",
    "avgConsistency" = exact."avgConsistency",
    "consistencySamples" = exact."consistencySamples",
    "metricVersion" = 2
FROM exact
WHERE daily."userId" = exact."userId"
  AND daily."date" = exact.date
  AND daily.tests = exact.tests;

ALTER TABLE "DailyUserStat"
ALTER COLUMN "metricVersion" SET DEFAULT 2;
