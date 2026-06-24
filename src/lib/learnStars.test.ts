import { describe, expect, it } from "vitest"
import { learnStarCriteria, starsFor } from "./learnStars"

const requirement = { wpm: 40, accuracy: 90 }

describe("starsFor", () => {
    it("returns 0 when net WPM misses the level requirement", () => {
        expect(starsFor({ netWpm: 39.9 }, requirement)).toBe(0)
    })

    it("awards 1 star for meeting the requirement", () => {
        expect(starsFor({ netWpm: 40 }, requirement)).toBe(1)
    })

    it("does not separately gate on accuracy because net WPM already includes errors", () => {
        expect(starsFor({ netWpm: 80 }, requirement)).toBe(3)
    })

    it("awards 2 stars for 15 percent net WPM headroom", () => {
        expect(starsFor({ netWpm: 46 }, requirement)).toBe(2)
    })

    it("awards 3 stars for 30 percent net WPM headroom", () => {
        expect(starsFor({ netWpm: 52 }, requirement)).toBe(3)
    })
})

describe("learnStarCriteria", () => {
    it("derives visible thresholds from the level requirement", () => {
        expect(learnStarCriteria(requirement)).toEqual({
            oneStarNetWpm: 40,
            twoStarNetWpm: 46,
            threeStarNetWpm: 52,
        })
    })
})
