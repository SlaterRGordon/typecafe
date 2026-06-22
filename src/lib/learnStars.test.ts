import { describe, expect, it } from "vitest"
import { learnStarCriteria, starsFor } from "./learnStars"

const requirement = { wpm: 40, accuracy: 90 }

describe("starsFor", () => {
    it("returns 0 when net WPM misses the level requirement", () => {
        expect(starsFor({ netWpm: 39.9, accuracy: 100 }, requirement)).toBe(0)
    })

    it("returns 0 when accuracy misses the level requirement", () => {
        expect(starsFor({ netWpm: 80, accuracy: 89.9 }, requirement)).toBe(0)
    })

    it("awards 1 star for meeting the requirement", () => {
        expect(starsFor({ netWpm: 40, accuracy: 90 }, requirement)).toBe(1)
    })

    it("awards 2 stars for 15 percent speed headroom at required accuracy", () => {
        expect(starsFor({ netWpm: 46, accuracy: 90 }, requirement)).toBe(2)
    })

    it("keeps 3 stars behind both speed headroom and high accuracy", () => {
        expect(starsFor({ netWpm: 52, accuracy: 96.9 }, requirement)).toBe(2)
        expect(starsFor({ netWpm: 52, accuracy: 97 }, requirement)).toBe(3)
    })
})

describe("learnStarCriteria", () => {
    it("derives visible thresholds from the level requirement", () => {
        expect(learnStarCriteria(requirement)).toEqual({
            oneStarNetWpm: 40,
            twoStarNetWpm: 46,
            threeStarNetWpm: 52,
            oneStarAccuracy: 90,
            twoStarAccuracy: 90,
            threeStarAccuracy: 97,
        })
    })
})
