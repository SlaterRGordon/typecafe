import { describe, expect, it } from "vitest"
import { beatRunAttemptLabel, beatRunBrag, firstDivergenceWord } from "./beatRun"

describe("beatRunBrag", () => {
    it("frames a win as a signed WPM delta", () => {
        expect(beatRunBrag(4.25)).toBe("Beat by +4.3 WPM")
    })

    it("keeps retries honest in the share brag", () => {
        expect(beatRunBrag(1, 3)).toBe("Beat by +1.0 WPM (best of 3)")
        expect(beatRunBrag(-2.4, 2)).toBe("Within 2.4 WPM (best of 2)")
    })
})

describe("beatRunAttemptLabel", () => {
    it("labels first attempts and retries distinctly", () => {
        expect(beatRunAttemptLabel(1)).toBe("First attempt")
        expect(beatRunAttemptLabel(2)).toBe("Retry 2 - first attempt stays comparable")
    })
})

describe("firstDivergenceWord", () => {
    it("returns the word containing the first wrong character", () => {
        const prompt = "steady hands type faster"
        const typedSegments = prompt.split("").map((ch, index) => ({
            ch: index === 10 ? "z" : ch,
            correct: index !== 10,
        }))

        expect(firstDivergenceWord(prompt, typedSegments)).toBe("hands")
    })

    it("returns null when the typed text matches the prompt", () => {
        const prompt = "clean run"
        const typedSegments = prompt.split("").map((ch) => ({ ch, correct: true }))

        expect(firstDivergenceWord(prompt, typedSegments)).toBeNull()
    })
})
