import { describe, expect, it } from "vitest";
import { trainProfileSummary, type TrainProfileRow } from "./trainProfile";

function row(difficulty: string, level: number, stars: number): TrainProfileRow {
    return {
        difficulty,
        options: `Level ${level}`,
        speed: 80,
        accuracy: 98,
        stars,
    };
}

describe("trainProfileSummary", () => {
    it("summarizes level and star completion for every difficulty", () => {
        const summary = trainProfileSummary([
            row("easy", 1, 3),
            row("easy", 2, 2),
            row("medium", 1, 1),
        ]);

        expect(summary.difficulties.find((item) => item.difficulty === "easy")).toMatchObject({
            levelsCompleted: 2,
            totalLevels: 100,
            starsEarned: 5,
            totalStars: 300,
            highestLevel: 2,
        });
        expect(summary.difficulties.find((item) => item.difficulty === "medium")).toMatchObject({
            levelsCompleted: 1,
            starsEarned: 1,
            highestLevel: 1,
        });
        expect(summary.difficulties.find((item) => item.difficulty === "hard")).toMatchObject({
            levelsCompleted: 0,
            starsEarned: 0,
            highestLevel: null,
        });
    });

    it("chooses the hardest difficulty with a clear as the headline", () => {
        const summary = trainProfileSummary([
            row("easy", 50, 3),
            row("hard", 4, 1),
            row("medium", 20, 2),
        ]);

        expect(summary.hardestClear).toEqual({
            difficulty: "hard",
            label: "Hard",
            level: 4,
        });
    });
});
