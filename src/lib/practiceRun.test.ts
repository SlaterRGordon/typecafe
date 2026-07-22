import { describe, expect, it } from "vitest"
import { guidedPracticeSetup } from "./guidedPractice"
import { compilePracticeText, INFINITE_PRACTICE_CHUNK_WORDS, planPracticeRun, practiceStreamSeed } from "./practiceRun"

const corpus = ["the", "their", "thing", "other", "action", "station", "working", "typing"]

describe("Practice run planning", () => {
    it("separates finite evidence runs from ephemeral infinity", () => {
        expect(planPracticeRun({ durationSeconds: 47 })).toEqual({ kind: "finite", count: 47, wordCount: 275, persists: true })
        expect(planPracticeRun({ durationSeconds: 47, infinite: true })).toEqual({ kind: "infinite", count: 0, wordCount: INFINITE_PRACTICE_CHUNK_WORDS, persists: false })
    })

    it.each(["varied", "pseudo"] as const)("streams whole Guided Words in balanced %s chunks", (textStyle) => {
        const setup = guidedPracticeSetup({ kind: "word", words: ["action", "station"], sharedGram: "tion" })!
        const configuration = { kind: "guided" as const, setup: { ...setup, textStyle }, corpus, language: "english" }
        const first = compilePracticeText(configuration, practiceStreamSeed(7, 0), 20).split(" ")
        const second = compilePracticeText(configuration, practiceStreamSeed(7, 1), 20).split(" ")

        for (const chunk of [first, second]) {
            expect(chunk).toHaveLength(20)
            expect(chunk.every((word) => word === "action" || word === "station")).toBe(true)
            expect(chunk.filter((word) => word === "action")).toHaveLength(10)
            expect(chunk.filter((word) => word === "station")).toHaveLength(10)
        }
    })

    it("keeps every selected Gram contiguous across distinct stream chunks", () => {
        const configuration = {
            kind: "grams" as const,
            preferences: { grams: ["ab", "xy"], durationSeconds: 60, textStyle: "varied" as const },
            corpus: ["about", "cabin", "xylophone", "proxy"],
            language: "english",
        }
        const first = compilePracticeText(configuration, practiceStreamSeed(11, 0), 20)
        const second = compilePracticeText(configuration, practiceStreamSeed(11, 1), 20)
        for (const chunk of [first, second]) {
            const words = chunk.split(" ")
            expect(words).toHaveLength(20)
            expect(words.filter((word) => word.includes("ab"))).toHaveLength(10)
            expect(words.filter((word) => word.includes("xy"))).toHaveLength(10)
        }
        expect(second).not.toBe(first)
    })
})
