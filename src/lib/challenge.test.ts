import { describe, expect, it } from "vitest"
import { CHALLENGE_WORD_COUNT, challengeDateKey, challengeStreakFromDateKeys, challengeText, shiftChallengeDateKey } from "./challenge"

const WORDS = "the quick brown fox jumps over a lazy dog and then runs far away home".split(" ")

describe("challengeText", () => {
    it("is byte-identical for the same day and corpus (zero network)", () => {
        const a = challengeText(WORDS, "2026-06-16")
        const b = challengeText(WORDS, "2026-06-16")
        expect(a).toBe(b)
    })

    it("differs across days", () => {
        expect(challengeText(WORDS, "2026-06-16")).not.toBe(challengeText(WORDS, "2026-06-17"))
    })

    it("produces the requested number of words", () => {
        expect(challengeText(WORDS, "2026-06-16", 30).split(" ")).toHaveLength(30)
        expect(challengeText(WORDS, "2026-06-16").split(" ")).toHaveLength(CHALLENGE_WORD_COUNT)
    })

    it("only uses words from the corpus", () => {
        const corpus = new Set(WORDS)
        for (const word of challengeText(WORDS, "2026-06-16", 50).split(" ")) {
            expect(corpus.has(word)).toBe(true)
        }
    })

    it("returns empty for an empty corpus", () => {
        expect(challengeText([], "2026-06-16")).toBe("")
    })
})

describe("challengeDateKey (timezone day boundary)", () => {
    it("keeps 23:50 and 00:10 local on different days", () => {
        const offset = -300 // UTC-5
        const late = new Date("2026-06-16T04:50:00.000Z") // 23:50 local on the 15th
        const early = new Date("2026-06-16T05:10:00.000Z") // 00:10 local on the 16th
        expect(challengeDateKey(late, offset)).toBe("2026-06-15")
        expect(challengeDateKey(early, offset)).toBe("2026-06-16")
        // Different days → different challenge text.
        expect(challengeText(WORDS, challengeDateKey(late, offset)))
            .not.toBe(challengeText(WORDS, challengeDateKey(early, offset)))
    })
})

describe("challenge streak helpers", () => {
    it("shifts date keys by whole UTC calendar days", () => {
        expect(shiftChallengeDateKey("2026-06-16", -1)).toBe("2026-06-15")
        expect(shiftChallengeDateKey("2026-01-01", -1)).toBe("2025-12-31")
        expect(shiftChallengeDateKey("2026-12-31", 1)).toBe("2027-01-01")
    })

    it("counts only consecutive daily challenge completions ending today", () => {
        expect(challengeStreakFromDateKeys(["2026-06-14", "2026-06-15", "2026-06-16"], "2026-06-16")).toBe(3)
        expect(challengeStreakFromDateKeys(["2026-06-14", "2026-06-16"], "2026-06-16")).toBe(1)
        expect(challengeStreakFromDateKeys(["2026-06-14", "2026-06-15"], "2026-06-16")).toBe(0)
    })
})
