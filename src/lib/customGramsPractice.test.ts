import { describe, expect, it } from "vitest"
import dutch10k from "~/components/typer/languages/dutch10k.json"
import english10k from "~/components/typer/languages/english10k.json"
import french10k from "~/components/typer/languages/french10k.json"
import german10k from "~/components/typer/languages/german10k.json"
import italian10k from "~/components/typer/languages/italian10k.json"
import polish10k from "~/components/typer/languages/polish10k.json"
import portuguese10k from "~/components/typer/languages/portuguese10k.json"
import spanish10k from "~/components/typer/languages/spanish10k.json"
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

const languageFixtures = [
    { language: "english", focus: "th", words: english10k.words },
    { language: "french", focus: "ét", words: french10k.words },
    { language: "spanish", focus: "ñu", words: spanish10k.words },
    { language: "german", focus: "üb", words: german10k.words },
    { language: "italian", focus: "èr", words: italian10k.words },
    { language: "portuguese", focus: "ão", words: portuguese10k.words },
    { language: "dutch", focus: "ië", words: dutch10k.words },
    { language: "polish", focus: "łó", words: polish10k.words },
] as const

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
            expect([...token.replace(gram, "")].length).toBeGreaterThanOrEqual(2)
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
            expect([...token.replace("xy", "")].length).toBeGreaterThanOrEqual(2)
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

    it("places scheduled Pseudo Grams at generated beginnings, middles, and endings", () => {
        const grams = ["th", "the", "tion"]
        const tokens = compileCustomGramsPractice({ grams, corpus, language: "english", textStyle: "pseudo", seed: 31, wordCount: 18 }).split(" ")

        tokens.forEach((token, index) => {
            const gram = grams[index % grams.length]!
            const cycle = Math.floor(index / grams.length) % 3
            const start = token.indexOf(gram)
            expect(start).toBeGreaterThanOrEqual(0)
            if (cycle === 0) expect(start).toBe(0)
            if (cycle === 1) {
                expect(start).toBeGreaterThan(0)
                expect(start + gram.length).toBeLessThan(token.length)
            }
            if (cycle === 2) expect(start + gram.length).toBe(token.length)
            expect(token).toMatch(/^\p{L}{3,10}$/u)
        })
    })

    it("balances mixed Unicode Grams as complete internal sequences", () => {
        const frenchCorpus = ["théorie", "été", "tétée", "caféteria", "station", "action"]
        const grams = ["té", "été", "tété", "tion"]
        const tokens = compileCustomGramsPractice({ grams, corpus: frenchCorpus, language: "french", textStyle: "pseudo", seed: 4, wordCount: 20 }).split(" ")

        tokens.forEach((token, index) => {
            const gram = grams[index % grams.length]!
            const start = [...token].join("").indexOf(gram)
            const cycle = Math.floor(index / grams.length) % 3
            if (cycle === 0) expect(start).toBe(0)
            if (cycle === 1) {
                expect(start).toBeGreaterThan(0)
                expect(start + [...gram].length).toBeLessThan([...token].length)
            }
            if (cycle === 2) expect(start + [...gram].length).toBe([...token].length)
        })
        grams.forEach((gram) => expect(count(tokens.join(" "), gram)).toBeGreaterThanOrEqual(5))
    })

    it.each(languageFixtures)("generates balanced whole $language tokens for mixed Gram lengths", ({ language, focus, words }) => {
        const grams = [focus, "tra", "tion"]
        const dictionary = new Set(words.map((word) => word.toLowerCase().normalize("NFC")))
        const tokens = compileCustomGramsPractice({
            grams, corpus: words, language, textStyle: "pseudo", seed: 174, wordCount: 18,
        }).split(" ")

        expect(tokens).toHaveLength(18)
        tokens.forEach((token, index) => {
            expect(token).toMatch(/^\p{L}{3,10}$/u)
            expect(dictionary.has(token)).toBe(false)
            expect(token).toContain(grams[index % grams.length])
        })
        grams.forEach((gram) => expect(tokens.filter((token, index) => token.includes(gram) && index % grams.length === grams.indexOf(gram))).toHaveLength(6))
    })

    it("never mutates, clips, extends, concatenates, or nakedly repeats Gram carriers", () => {
        const carriers = ["international", "constitutional", "institutional"]
        const gram = "tion"
        const alphabet = [...new Set(carriers.join(""))]
        const corruptions = new Set<string>([gram, gram.repeat(2), gram.repeat(3), "nnternational"])
        for (const carrier of carriers) {
            corruptions.add(carrier.slice(1))
            corruptions.add(carrier.slice(0, -1))
            for (const supporting of alphabet) {
                corruptions.add(`${supporting}${carrier}`)
                corruptions.add(`${carrier}${supporting}`)
                for (let index = 0; index < carrier.indexOf(gram); index += 1) {
                    corruptions.add(`${carrier.slice(0, index)}${supporting}${carrier.slice(index + 1)}`)
                }
            }
        }
        for (const left of carriers) for (const right of carriers) corruptions.add(`${left}${right}`)

        const tokens = compileCustomGramsPractice({
            grams: [gram], corpus: carriers, language: "english", textStyle: "pseudo", seed: 29, wordCount: 36,
        }).split(" ")

        expect(tokens).toHaveLength(36)
        expect(tokens.filter((token) => corruptions.has(token))).toEqual([])
        expect(tokens.every((token) => token.includes(gram) && token !== gram && token !== gram.repeat(2))).toBe(true)
    })

    it("reuses rare whole-token Gram material only outside the novelty window", () => {
        const tokens = compileCustomGramsPractice({
            grams: ["xy"], corpus: ["ab"], language: "english", textStyle: "pseudo", seed: 13, wordCount: 48,
        }).split(" ")
        const lastSeen = new Map<string, number>()

        tokens.forEach((token, index) => {
            const previous = lastSeen.get(token)
            if (previous !== undefined) expect(index - previous).toBeGreaterThan(8)
            lastSeen.set(token, index)
        })
        expect(new Set(tokens).size).toBeLessThan(tokens.length)
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
