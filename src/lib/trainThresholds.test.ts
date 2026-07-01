import { describe, expect, it } from "vitest"
import {
    DIFFICULTIES,
    starThresholds,
    starsForWpm,
    targetWpm,
} from "./trainThresholds"

describe("targetWpm", () => {
    it("pins the easy-1★ spine at the ladder ends", () => {
        expect(targetWpm(1, "easy", 1)).toBe(22)
        expect(targetWpm(100, "easy", 1)).toBe(70)
    })

    it("reaches the top-1% range at the hardest tiers (L100)", () => {
        expect(targetWpm(100, "extreme", 3)).toBe(178)
        expect(targetWpm(100, "insane", 3)).toBe(226)
    })

    it("climbs monotonically with level, difficulty and star", () => {
        expect(targetWpm(5, "easy", 1)).toBeLessThan(targetWpm(50, "easy", 1))
        expect(targetWpm(50, "easy", 1)).toBeLessThan(targetWpm(50, "hard", 1))
        expect(targetWpm(50, "hard", 1)).toBeLessThan(targetWpm(50, "hard", 3))
    })
})

describe("starsForWpm", () => {
    it("returns 0 below the 1★ target", () => {
        expect(starsForWpm(21, 1, "easy")).toBe(0)
    })

    it("awards stars on the 1★ / 2★ / 3★ targets (L1 easy = 22 / 25 / 28)", () => {
        expect(starsForWpm(22, 1, "easy")).toBe(1)
        expect(starsForWpm(25, 1, "easy")).toBe(2)
        expect(starsForWpm(28, 1, "easy")).toBe(3)
    })

    it("does not separately gate on accuracy — net WPM already includes errors", () => {
        expect(starsForWpm(999, 1, "easy")).toBe(3)
    })
})

describe("starThresholds", () => {
    it("exposes the three visible net-WPM thresholds", () => {
        expect(starThresholds(1, "easy")).toEqual({
            oneStarNetWpm: 22,
            twoStarNetWpm: 25,
            threeStarNetWpm: 28,
        })
    })
})

describe("DIFFICULTIES", () => {
    it("lists five tiers easiest→hardest", () => {
        expect(DIFFICULTIES).toEqual(["easy", "medium", "hard", "extreme", "insane"])
    })
})
