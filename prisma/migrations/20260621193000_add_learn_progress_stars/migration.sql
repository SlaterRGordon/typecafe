ALTER TABLE "LearnProgress" ADD COLUMN "stars" INTEGER NOT NULL DEFAULT 0;

-- Learn now stores canonical net WPM in the existing speed column.
UPDATE "LearnProgress"
SET "speed" = GREATEST(0, "speed" * (2 * "accuracy" / 100 - 1));

UPDATE "LearnProgress"
SET "stars" = CASE
    WHEN "difficulty" = 'hard' AND "speed" >= 156 AND "accuracy" >= 97 THEN 3
    WHEN "difficulty" = 'hard' AND "speed" >= 138 AND "accuracy" >= 90 THEN 2
    WHEN "difficulty" = 'hard' AND "speed" >= 120 AND "accuracy" >= 90 THEN 1
    WHEN "difficulty" = 'medium' AND "speed" >= 104 AND "accuracy" >= 97 THEN 3
    WHEN "difficulty" = 'medium' AND "speed" >= 92 AND "accuracy" >= 90 THEN 2
    WHEN "difficulty" = 'medium' AND "speed" >= 80 AND "accuracy" >= 90 THEN 1
    WHEN "speed" >= 52 AND "accuracy" >= 97 THEN 3
    WHEN "speed" >= 46 AND "accuracy" >= 90 THEN 2
    WHEN "speed" >= 40 AND "accuracy" >= 90 THEN 1
    ELSE 0
END;
