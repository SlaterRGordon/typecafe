import { describe, expect, it } from "vitest"
import { encodeTimeline, type TestEvidenceEvent } from "./keystrokes"
import {
    compileCustomGramsPractice,
    completeCustomGramsPractice,
    customGramsPracticeRecord,
    normalizeCustomGram,
    parseCustomGramsPracticePreferences,
    rankCommonGrams,
    type CustomGramsPracticeRun,
} from "./customGramsPractice"

const corpus = ["there", "their", "other", "rather", "gather", "thing", "nothing", "action", "station", "café", "caféteria"]

function timeline(sequence: Array<{ key: string, correct?: boolean, dt?: number }>) {
    let t = 0
    const events: TestEvidenceEvent[] = sequence.map((item) => {
        t += item.dt ?? 100
        return { key: item.key, typed: item.correct === false ? "x" : item.key, correct: item.correct !== false, t }
    })
    return encodeTimeline(events)
}

function run(input: {
    id: string
    completedAt: number
    grams: string[]
    style?: "varied" | "pseudo"
    duration?: 30 | 60 | 120 | 240
    completed?: boolean
    events: Array<{ key: string, correct?: boolean, dt?: number }>
}): CustomGramsPracticeRun {
    const preferences = {
        grams: input.grams,
        durationSeconds: input.duration ?? 60,
        textStyle: input.style ?? "varied",
    } as const
    return {
        id: input.id,
        completedAt: input.completedAt,
        practice: customGramsPracticeRecord(preferences, 30_000, input.completed ?? true),
        timeline: timeline(input.events),
    }
}

function count(text: string, gram: string): number {
    return text.split(" ").reduce((total, token) => {
        const points = [...token]
        const target = [...gram]
        return total + points.reduce((matches, _, index) =>
            matches + (target.every((character, offset) => points[index + offset] === character) ? 1 : 0), 0)
    }, 0)
}

describe("rankCommonGrams", () => {
    it("frequency-ranks mixed lengths from active-language words using Unicode code points", () => {
        const french = rankCommonGrams(["été", "étée", "café", "café"], 2)
        expect(french.map((item) => [item.gram, item.length])).toEqual([
            ["ét", 2], ["été", 3], ["étée", 4],
            ["té", 2], ["tée", 3], ["café", 4],
        ])
        expect(french[0]!.frequency).toBe(2)
    })
})

describe("compileCustomGramsPractice", () => {
    it("keeps seeded varied carrier order stable while balancing Gram slots", () => {
        expect(compileCustomGramsPractice({ grams: ["th", "tion"], corpus, language: "english", textStyle: "varied", seed: 11, wordCount: 8 }))
            .toBe("rather station gather action nothing station there station")
    })

    it("balances mixed 2/3/4-character carrier slots and keeps varied text target-dense", () => {
        const text = compileCustomGramsPractice({ grams: ["th", "the", "tion"], corpus, language: "english", textStyle: "varied", seed: 11, wordCount: 15 })
        expect(text.split(" ")).toHaveLength(15)
        expect(count(text, "th")).toBeGreaterThanOrEqual(5)
        expect(count(text, "the")).toBeGreaterThanOrEqual(5)
        expect(count(text, "tion")).toBeGreaterThanOrEqual(5)
        expect(text.split(" ").every((token) => !["th", "the", "tion"].includes(token))).toBe(true)
    })

    it("counts overlaps, preserves word boundaries, and handles Unicode targets", () => {
        const text = compileCustomGramsPractice({ grams: ["été", "tété"], corpus: ["tétée", "été", "café"], language: "french", textStyle: "varied", seed: 2, wordCount: 8 })
        expect(count(text, "été")).toBeGreaterThanOrEqual(4)
        expect(count(text, "tété")).toBeGreaterThanOrEqual(4)
        expect(count("t hé", "th")).toBe(0)
    })

    it("generates deterministic pseudo-only tokens and terminates with sparse carriers", () => {
        const request = { grams: ["xy", "zzzz"], corpus: ["alpha", "beta"], language: "english", textStyle: "pseudo" as const, seed: 7, wordCount: 10 }
        const one = compileCustomGramsPractice(request)
        const two = compileCustomGramsPractice(request)
        const tokens = one.split(" ")
        expect(one).toBe(two)
        expect(tokens).toHaveLength(10)
        expect(tokens.every((token) => token !== "xy" && token !== "zzzz" && !request.corpus.includes(token))).toBe(true)
        tokens.forEach((token, index) => {
            const gram = request.grams[index % request.grams.length]!
            expect(token).toContain(gram)
            expect([...token.replace(gram, "")].length).toBeGreaterThanOrEqual(3)
        })
        expect(count(one, "xy")).toBeGreaterThanOrEqual(5)
        expect(count(one, "zzzz")).toBeGreaterThanOrEqual(5)
    })

    it("keeps one-word sparse Gram fallbacks seed-sensitive and non-repeating", () => {
        const request = { grams: ["xy"], corpus: ["ab"], language: "english", textStyle: "pseudo" as const, wordCount: 12 }
        const first = compileCustomGramsPractice({ ...request, seed: 1 }).split(" ")
        const fresh = compileCustomGramsPractice({ ...request, seed: 2 }).split(" ")

        expect(fresh).not.toEqual(first)
        expect(new Set(first).size).toBeGreaterThan(1)
        expect(first.every((token) => [...token.replace("xy", "")].some((character) => !"ab".includes(character)))).toBe(true)
        first.forEach((token, index) => {
            expect(token).toContain("xy")
            expect([...token.replace("xy", "")].length).toBeGreaterThanOrEqual(3)
            if (index > 0) expect(token).not.toBe(first[index - 1])
        })
    })

    it("keeps carrier diversity without repeating the selected Grams as naked tokens", () => {
        const text = compileCustomGramsPractice({ grams: ["th", "tion"], corpus, language: "english", textStyle: "pseudo", seed: 31, wordCount: 20 })
        const tokens = text.split(" ")
        expect(new Set(tokens).size).toBeGreaterThanOrEqual(6)
        expect(new Set(tokens.slice(0, 9)).size).toBe(9)
        expect(tokens.every((token, index) => index === 0 || token !== tokens[index - 1])).toBe(true)
        expect(tokens.every((token) => token !== "th" && token !== "tion" && /^\p{L}+$/u.test(token))).toBe(true)
    })

    it("keeps Pseudo Gram carriers on active-language spelling transitions", () => {
        const grams = ["th", "the", "tion"]
        const tokens = compileCustomGramsPractice({ grams, corpus, language: "english", textStyle: "pseudo", seed: 31, wordCount: 18 }).split(" ")
        const attestedBigrams = new Set(corpus.flatMap((word) => [...word].slice(1)
            .map((character, index) => `${[...word][index]}${character}`)))

        tokens.forEach((token, index) => {
            expect(token).toContain(grams[index % grams.length])
            expect([...token].slice(1).every((character, offset) => attestedBigrams.has(`${[...token][offset]}${character}`))).toBe(true)
        })
    })

    it("balances mixed Unicode Grams as complete internal sequences", () => {
        const frenchCorpus = ["théorie", "été", "tétée", "caféteria", "station", "action"]
        const grams = ["té", "été", "tété", "tion"]
        const tokens = compileCustomGramsPractice({ grams, corpus: frenchCorpus, language: "french", textStyle: "pseudo", seed: 4, wordCount: 20 }).split(" ")

        tokens.forEach((token, index) => {
            const gram = grams[index % grams.length]!
            const start = [...token].join("").indexOf(gram)
            expect(start).toBeGreaterThan(0)
            expect(start + [...gram].length).toBeLessThan([...token].length)
        })
        grams.forEach((gram) => expect(count(tokens.join(" "), gram)).toBeGreaterThanOrEqual(5))
    })

    it.each(["varied", "pseudo"] as const)("changes deterministic %s output with the run seed", (textStyle) => {
        const base = { grams: ["th", "the"], corpus, language: "english", textStyle, wordCount: 16 }
        expect(compileCustomGramsPractice({ ...base, seed: 1 })).not.toBe(compileCustomGramsPractice({ ...base, seed: 2 }))
    })
})

describe("completeCustomGramsPractice", () => {
    it("reports overlapping selected Grams, excludes boundaries, and pools mixed-duration same-style history", () => {
        const current = run({ id: "current", completedAt: 20, grams: ["th", "the", "hi"], duration: 30, events: [
            { key: "t" }, { key: "h", dt: 100 }, { key: "e", correct: false, dt: 200 }, { key: " " }, { key: "i" },
        ] })
        const prior = run({ id: "prior", completedAt: 19, grams: ["the"], duration: 240, events: [
            { key: "t" }, { key: "h", dt: 200 }, { key: "e", dt: 200 },
        ] })
        const wrongStyle = run({ id: "pseudo", completedAt: 18, grams: ["the"], style: "pseudo", events: [
            { key: "t" }, { key: "h", dt: 10 }, { key: "e", dt: 10 },
        ] })
        const recap = completeCustomGramsPractice({ current, history: [prior, wrongStyle] })

        expect(recap.grams.map((row) => row.gram)).toEqual(["th", "the"])
        expect(recap.grams[0]).toMatchObject({ attempts: 1, accuracy: 100, latencyMs: 100 })
        expect(recap.grams[1]).toMatchObject({ attempts: 1, accuracy: 0, latencyMs: 150 })
        expect(recap.grams[1]!.baseline).toMatchObject({ runs: 1, attempts: 1, accuracy: 100, latencyMs: 200 })
        expect(recap.grams[1]!.delta).toMatchObject({ accuracyPoints: -100, latencyMs: 50 })
    })

    it("handles Unicode, one prior run, no attempt floor, and excludes interrupted runs", () => {
        const current = run({ id: "current", completedAt: 3, grams: ["été"], events: [{ key: "é" }, { key: "t" }, { key: "é" }] })
        const stopped = run({ id: "stopped", completedAt: 2, grams: ["été"], completed: false, events: [{ key: "é" }, { key: "t" }, { key: "é" }] })
        const prior = run({ id: "prior", completedAt: 1, grams: ["été"], events: [{ key: "é" }, { key: "t" }, { key: "é", correct: false }] })
        const recap = completeCustomGramsPractice({ current, history: [stopped, prior] })
        expect(recap.grams[0]!.baseline).toMatchObject({ runs: 1, attempts: 1, accuracy: 0 })
        expect(recap.baselineReady).toBe(true)
    })
})

describe("Custom Grams preferences", () => {
    it("accepts direct mixed Unicode Grams and repairs invalid storage independently", () => {
        expect(normalizeCustomGram(" ÉTé ")).toBe("été")
        expect(normalizeCustomGram("a")).toBeNull()
        expect(normalizeCustomGram("abcde")).toBeNull()
        expect(normalizeCustomGram("a b")).toBeNull()
        expect(parseCustomGramsPracticePreferences({ grams: ["TH", "été", "tion"], durationSeconds: 120, textStyle: "pseudo" }))
            .toEqual({ grams: ["th", "été", "tion"], durationSeconds: 120, textStyle: "pseudo" })
        expect(parseCustomGramsPracticePreferences({ grams: ["x"], durationSeconds: 45, textStyle: "dense" }))
            .toEqual({ grams: ["th", "the", "tion"], durationSeconds: 60, textStyle: "varied" })
    })
})
