import { describe, expect, it } from "vitest"
import { CHALLENGE_WORD_COUNT, challengeDateKey, challengeText } from "./challenge"

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
