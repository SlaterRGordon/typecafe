import { beforeAll, describe, expect, it } from "vitest"
import english10k from "~/components/typer/languages/english10k.json"
import { compileCustomGramsPractice } from "./customGramsPractice"
import { compileCustomKeysPractice } from "./customKeysPractice"
import { practiceWordCapacity } from "./practiceCapacity"

describe("practiceWordCapacity", () => {
    beforeAll(() => {
        compileCustomKeysPractice({ keys: ["e", "r"], corpus: english10k.words, language: "english", textStyle: "pseudo", seed: 1, wordCount: 1 })
        compileCustomGramsPractice({ grams: ["th", "the", "tion"], corpus: english10k.words, language: "english", textStyle: "pseudo", seed: 1, wordCount: 1 })
    })

    it.each([
        [30, 175],
        [60, 350],
        [120, 700],
        [240, 1_400],
        [3_600, 21_000],
    ] as const)("budgets enough deterministic prompt material for a %d-second run", (durationSeconds, words) => {
        expect(practiceWordCapacity(durationSeconds)).toBe(words)
    })

    it.each([30, 60, 120, 240] as const)("keeps %d-second Pseudo compiler buffers inside the interaction budget", (durationSeconds) => {
        const wordCount = practiceWordCapacity(durationSeconds)
        const keysStarted = performance.now()
        const keys = compileCustomKeysPractice({ keys: ["e", "r"], corpus: english10k.words, language: "english", textStyle: "pseudo", seed: 17, wordCount })
        const keysElapsed = performance.now() - keysStarted
        const gramsStarted = performance.now()
        const grams = compileCustomGramsPractice({ grams: ["th", "the", "tion"], corpus: english10k.words, language: "english", textStyle: "pseudo", seed: 17, wordCount })
        const gramsElapsed = performance.now() - gramsStarted

        expect(keys.split(" ")).toHaveLength(wordCount)
        expect(grams.split(" ")).toHaveLength(wordCount)
        expect(keysElapsed).toBeLessThan(750)
        expect(gramsElapsed).toBeLessThan(750)
    })
})
