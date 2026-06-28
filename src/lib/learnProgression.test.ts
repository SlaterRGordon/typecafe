import { describe, expect, it } from "vitest"
import { levels } from "~/components/typer/learn/levels"
import {
    fromLevelProgress,
    gradeResult,
    ladderState,
    mergeProgress,
    nextLevel,
    resumeLevel,
    toLevelProgress,
    type LevelProgress,
} from "./learnProgression"

const cleared = (levelName: string, netWpm: number, stars: 0 | 1 | 2 | 3 = 1): LevelProgress => ({
    levelName,
    netWpm,
    accuracy: 95,
    stars,
})

describe("toLevelProgress / fromLevelProgress", () => {
    it("renames options/speed to the domain shape and defaults stars", () => {
        expect(toLevelProgress({ options: "Level 3", speed: 55, accuracy: 92 })).toEqual({
            levelName: "Level 3",
            netWpm: 55,
            accuracy: 92,
            stars: 0,
        })
    })

    it("round-trips back to the persisted shape", () => {
        const entry = cleared("Level 2", 48, 2)
        expect(fromLevelProgress(entry)).toEqual({ options: "Level 2", speed: 48, accuracy: 95, stars: 2 })
    })
})

describe("mergeProgress", () => {
    it("appends a level not seen before", () => {
        expect(mergeProgress([], cleared("Level 1", 42))).toEqual([cleared("Level 1", 42)])
    })

    it("keeps the best of each metric for a repeated level", () => {
        const prior = [{ levelName: "Level 1", netWpm: 50, accuracy: 99, stars: 3 as const }]
        const merged = mergeProgress(prior, { levelName: "Level 1", netWpm: 45, accuracy: 90, stars: 1 })
        expect(merged).toEqual([{ levelName: "Level 1", netWpm: 50, accuracy: 99, stars: 3 }])
    })

    it("takes the higher netWpm when the new attempt is faster", () => {
        const prior = [cleared("Level 1", 40, 1)]
        const merged = mergeProgress(prior, cleared("Level 1", 60, 3))
        expect(merged[0]).toEqual(cleared("Level 1", 60, 3))
    })
})

describe("ladderState", () => {
    it("unlocks only Level 1 with no progress", () => {
        const ladder = ladderState([], "easy")
        expect(ladder[0]!.unlocked).toBe(true)
        expect(ladder.slice(1).every((s) => !s.unlocked)).toBe(true)
    })

    it("unlocks the next level once the prior level meets its net-WPM requirement", () => {
        // Easy Level 1 requires 40 net WPM.
        const ladder = ladderState([cleared("Level 1", 40)], "easy")
        expect(ladder[1]!.unlocked).toBe(true)
        expect(ladder[2]!.unlocked).toBe(false)
    })

    it("keeps the next level locked when the prior level falls short", () => {
        const ladder = ladderState([cleared("Level 1", 39)], "easy")
        expect(ladder[1]!.unlocked).toBe(false)
    })

    it("does not gate on accuracy — fast but inaccurate still unlocks", () => {
        const ladder = ladderState([{ levelName: "Level 1", netWpm: 80, accuracy: 1, stars: 1 }], "easy")
        expect(ladder[1]!.unlocked).toBe(true)
    })

    it("uses the difficulty's requirement (hard needs 120)", () => {
        expect(ladderState([cleared("Level 1", 80)], "hard")[1]!.unlocked).toBe(false)
        expect(ladderState([cleared("Level 1", 120)], "hard")[1]!.unlocked).toBe(true)
    })

    it("surfaces the stored stars per level", () => {
        expect(ladderState([cleared("Level 1", 50, 2)], "easy")[0]!.stars).toBe(2)
    })
})

describe("resumeLevel", () => {
    it("returns Level 1 with no progress", () => {
        expect(resumeLevel([], "easy").name).toBe("Level 1")
    })

    it("returns the last unlocked level (one past the cleared run)", () => {
        expect(resumeLevel([cleared("Level 1", 40)], "easy").name).toBe("Level 2")
    })

    it("returns the final level once every level is cleared", () => {
        const all = levels.map((l) => cleared(l.name, 999, 3))
        expect(resumeLevel(all, "easy").name).toBe(levels[levels.length - 1]!.name)
    })
})

describe("nextLevel", () => {
    it("returns the next level when clearing unlocks it", () => {
        expect(nextLevel([cleared("Level 1", 40)], "Level 1", "easy")?.name).toBe("Level 2")
    })

    it("returns null when the next level is still locked", () => {
        expect(nextLevel([cleared("Level 1", 39)], "Level 1", "easy")).toBeNull()
    })

    it("returns null at the end of the ladder", () => {
        const last = levels[levels.length - 1]!.name
        expect(nextLevel([], last, "easy")).toBeNull()
    })
})

describe("gradeResult", () => {
    const level1 = levels[0]!

    it("awards stars on the 1x / 1.15x / 1.3x net-WPM thresholds (easy req 40)", () => {
        expect(gradeResult(level1, "easy", { netWpm: 39, accuracy: 95 }).stars).toBe(0)
        expect(gradeResult(level1, "easy", { netWpm: 40, accuracy: 95 }).stars).toBe(1)
        expect(gradeResult(level1, "easy", { netWpm: 46, accuracy: 95 }).stars).toBe(2)
        expect(gradeResult(level1, "easy", { netWpm: 52, accuracy: 95 }).stars).toBe(3)
    })

    it("returns the difficulty's requirement and a saveable entry", () => {
        const graded = gradeResult(level1, "easy", { netWpm: 50, accuracy: 93 })
        expect(graded.requirement).toEqual({ wpm: 40, accuracy: 90 })
        expect(graded.entry).toEqual({ levelName: "Level 1", netWpm: 50, accuracy: 93, stars: 2 })
    })
})
