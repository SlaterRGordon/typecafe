import { describe, expect, it } from "vitest"
import { levels } from "~/components/typer/train/levels"
import {
    fromLevelProgress,
    gradeLevel,
    ladderState,
    mergeProgress,
    nextLevel,
    resumeLevel,
    toLevelProgress,
    type LevelProgress,
} from "./trainProgression"

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

    it("unlocks the next level once the prior level meets its 1★ net-WPM target", () => {
        // Easy Level 1's 1★ target is 22 net WPM.
        const ladder = ladderState([cleared("Level 1", 22)], "easy")
        expect(ladder[1]!.unlocked).toBe(true)
        expect(ladder[2]!.unlocked).toBe(false)
    })

    it("keeps the next level locked when the prior level falls short", () => {
        const ladder = ladderState([cleared("Level 1", 21)], "easy")
        expect(ladder[1]!.unlocked).toBe(false)
    })

    it("does not gate on accuracy - fast but inaccurate still unlocks", () => {
        const ladder = ladderState([{ levelName: "Level 1", netWpm: 80, accuracy: 1, stars: 1 }], "easy")
        expect(ladder[1]!.unlocked).toBe(true)
    })

    it("uses the difficulty's target (hard Level 1 needs 36)", () => {
        expect(ladderState([cleared("Level 1", 35)], "hard")[1]!.unlocked).toBe(false)
        expect(ladderState([cleared("Level 1", 36)], "hard")[1]!.unlocked).toBe(true)
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
        expect(nextLevel([cleared("Level 1", 21)], "Level 1", "easy")).toBeNull()
    })

    it("returns null at the end of the ladder", () => {
        const last = levels[levels.length - 1]!.name
        expect(nextLevel([], last, "easy")).toBeNull()
    })
})

describe("gradeLevel", () => {
    const level1 = levels[0]!

    it("awards stars on the formula thresholds (easy Level 1 = 22 / 25 / 28)", () => {
        expect(gradeLevel(level1, "easy", { netWpm: 21, accuracy: 95 }).stars).toBe(0)
        expect(gradeLevel(level1, "easy", { netWpm: 22, accuracy: 95 }).stars).toBe(1)
        expect(gradeLevel(level1, "easy", { netWpm: 25, accuracy: 95 }).stars).toBe(2)
        expect(gradeLevel(level1, "easy", { netWpm: 28, accuracy: 95 }).stars).toBe(3)
    })

    it("returns the visible star thresholds and a saveable entry", () => {
        const graded = gradeLevel(level1, "easy", { netWpm: 26, accuracy: 93 })
        expect(graded.thresholds).toEqual({ oneStarNetWpm: 22, twoStarNetWpm: 25, threeStarNetWpm: 28 })
        expect(graded.entry).toEqual({ levelName: "Level 1", netWpm: 26, accuracy: 93, stars: 2 })
    })

    it("fails a no-miss level on any error, but grades by WPM at 100%", () => {
        const noMiss = levels.find((l) => l.kind === "noMiss")!
        expect(gradeLevel(noMiss, "easy", { netWpm: 999, accuracy: 99.9 }).stars).toBe(0)
        expect(gradeLevel(noMiss, "easy", { netWpm: 999, accuracy: 100 }).stars).toBe(3)
    })
})
