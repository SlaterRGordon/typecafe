UPDATE "LearnProgress"
SET "stars" = CASE
    WHEN "difficulty" = 'hard' AND "speed" >= 156 THEN 3
    WHEN "difficulty" = 'hard' AND "speed" >= 138 THEN 2
    WHEN "difficulty" = 'hard' AND "speed" >= 120 THEN 1
    WHEN "difficulty" = 'medium' AND "speed" >= 104 THEN 3
    WHEN "difficulty" = 'medium' AND "speed" >= 92 THEN 2
    WHEN "difficulty" = 'medium' AND "speed" >= 80 THEN 1
    WHEN "speed" >= 52 THEN 3
    WHEN "speed" >= 46 THEN 2
    WHEN "speed" >= 40 THEN 1
    ELSE 0
END;
