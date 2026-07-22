import { describe, expect, it } from "vitest"
import dutch10k from "~/components/typer/languages/dutch10k.json"
import english10k from "~/components/typer/languages/english10k.json"
import french10k from "~/components/typer/languages/french10k.json"
import german10k from "~/components/typer/languages/german10k.json"
import italian10k from "~/components/typer/languages/italian10k.json"
import polish10k from "~/components/typer/languages/polish10k.json"
import portuguese10k from "~/components/typer/languages/portuguese10k.json"
import spanish10k from "~/components/typer/languages/spanish10k.json"
import { ALL_DIGITS, DRILL_MARKS } from "./drillCharacters"
import { encodeTimeline, type TestEvidenceEvent } from "./keystrokes"
import {
    compileCustomKeysPractice,
    completeCustomKeysPractice,
    customKeysPracticeRecord,
    parseCustomKeysPracticePreferences,
    type CustomKeysPracticeRun,
} from "./customKeysPractice"

const corpus = ["there", "their", "other", "ready", "river", "café", "often", "around", "quiet", "stone", "under", "after"]

const languageFixtures = [
    { language: "english", focus: "z", words: english10k.words },
    { language: "french", focus: "é", words: french10k.words },
    { language: "spanish", focus: "ñ", words: spanish10k.words },
    { language: "german", focus: "ü", words: german10k.words },
    { language: "italian", focus: "è", words: italian10k.words },
    { language: "portuguese", focus: "ã", words: portuguese10k.words },
    { language: "dutch", focus: "ë", words: dutch10k.words },
    { language: "polish", focus: "ł", words: polish10k.words },
] as const

function timeline(sequence: Array<{ key: string, correct?: boolean, dt?: number }>) {
    let t = 0
    const events: TestEvidenceEvent[] = sequence.map((item) => {
        t += item.dt ?? 100
        return { key: item.key, typed: item.correct === false ? "x" : item.key, correct: item.correct !== false, t }
    })
    return encodeTimeline(events)
}

function run(id: string, completedAt: number, keys: string[], style: "varied" | "pseudo", completed: boolean, events: Array<{ key: string, correct?: boolean, dt?: number }>): CustomKeysPracticeRun {
    return {
        id,
        completedAt,
        practice: customKeysPracticeRecord({ keys, durationSeconds: id === "current" ? 30 : 240, textStyle: style }, 30_000, completed),
        timeline: timeline(events),
    }
}

describe("compileCustomKeysPractice", () => {
    it("keeps seeded varied carrier order stable while balancing focus slots", () => {
        expect(compileCustomKeysPractice({ keys: ["r", "é"], corpus, language: "english", textStyle: "varied", seed: 4, wordCount: 8 }))
            .toBe("after café their café other café there café")
    })

    it("uses selected letters as balanced focus while retaining supporting characters", () => {
        const text = compileCustomKeysPractice({ keys: ["r", "é"], corpus, language: "english", textStyle: "varied", seed: 4, wordCount: 12 })
        expect(text).toContain("r")
        expect(text).toContain("é")
        expect(text).toMatch(/[thoady]/)
        expect(Math.abs([...text].filter((key) => key === "r").length - [...text].filter((key) => key === "é").length)).toBeLessThanOrEqual(8)
        expect(text).not.toMatch(/(?:^|\s)(.)\1{2,}(?:\s|$)/u)
    })

    it("makes fresh deterministic runs and embeds digits and marks in carriers", () => {
        const one = compileCustomKeysPractice({ keys: ["5", ";"], corpus, language: "english", textStyle: "varied", seed: 1, wordCount: 12 })
        const two = compileCustomKeysPractice({ keys: ["5", ";"], corpus, language: "english", textStyle: "varied", seed: 2, wordCount: 12 })
        expect(one).not.toBe(two)
        expect(one).toContain("5")
        expect(one).toContain(";")
        expect(one.split(" ").some((token) => /\p{L}/u.test(token))).toBe(true)
    })

    it("schedules every focus key inside a novel language-shaped Pseudo token", () => {
        const sparseCorpus = ["paper", "maker", "later", "river", "quiet"]
        const keys = ["r", "z"]
        const tokens = compileCustomKeysPractice({ keys, corpus: sparseCorpus, language: "english", textStyle: "pseudo", seed: 9, wordCount: 12 }).split(" ")

        expect(tokens).toHaveLength(12)
        expect(tokens.every((token) => /^\p{L}{3,}$/u.test(token))).toBe(true)
        expect(tokens.every((token) => !sparseCorpus.includes(token))).toBe(true)
        tokens.forEach((token, index) => expect(token).toContain(keys[index % keys.length]))
        expect(tokens.some((token) => [...token].some((character) => !keys.includes(character)))).toBe(true)
    })

    it("keeps seeded Pseudo runs deterministic, fresh, and diverse across the recent window", () => {
        const request = { keys: ["r", "é"], corpus, language: "english", textStyle: "pseudo" as const, wordCount: 24 }
        const first = compileCustomKeysPractice({ ...request, seed: 41 })
        const repeat = compileCustomKeysPractice({ ...request, seed: 41 })
        const fresh = compileCustomKeysPractice({ ...request, seed: 42 })
        const tokens = first.split(" ")

        expect(repeat).toBe(first)
        expect(fresh).not.toBe(first)
        expect(new Set(tokens.slice(0, 9)).size).toBe(9)
        tokens.forEach((token, index) => {
            if (index > 0) expect(token).not.toBe(tokens[index - 1])
        })
    })

    it("keeps one-word sparse fallbacks seed-sensitive and non-repeating", () => {
        const request = { keys: ["a"], corpus: ["aa"], language: "english", textStyle: "pseudo" as const, wordCount: 12 }
        const first = compileCustomKeysPractice({ ...request, seed: 1 }).split(" ")
        const fresh = compileCustomKeysPractice({ ...request, seed: 2 }).split(" ")

        expect(fresh).not.toEqual(first)
        expect(new Set(first).size).toBeGreaterThan(1)
        expect(first.every((token) => [...token].some((character) => character !== "a"))).toBe(true)
        first.forEach((token, index) => {
            expect(token).toContain("a")
            if (index > 0) expect(token).not.toBe(first[index - 1])
        })
    })

    it.each(languageFixtures)("builds whole scheduled $language tokens, including supported accents", ({ language, focus, words }) => {
        const dictionary = new Set(words.map((word) => word.toLowerCase().normalize("NFC")))
        const tokens = compileCustomKeysPractice({
            keys: [focus, "r"],
            corpus: words,
            language,
            textStyle: "pseudo",
            seed: 173,
            wordCount: 20,
        }).split(" ")

        expect(tokens).toHaveLength(20)
        tokens.forEach((token, index) => {
            expect(token).toMatch(/^\p{L}{3,10}$/u)
            expect(dictionary.has(token)).toBe(false)
            expect(token).toContain(index % 2 === 0 ? focus : "r")
        })
        expect(tokens.filter((token) => [...token].length <= 7).length).toBeGreaterThanOrEqual(16)
    })

    it("never edits, clips, extends, or concatenates dictionary carriers", () => {
        const carriers = ["international", "paper", "maker"]
        const focus = "n"
        const corruptions = new Set<string>(["nnternational"])
        for (const carrier of carriers) {
            const points = [...carrier]
            corruptions.add(points.slice(1).join(""))
            corruptions.add(points.slice(0, -1).join(""))
            corruptions.add(`${focus}${carrier}`)
            corruptions.add(`${carrier}${focus}`)
            corruptions.add(carrier.repeat(2))
            for (let index = 0; index <= points.length; index += 1) {
                corruptions.add([...points.slice(0, index), focus, ...points.slice(index)].join(""))
            }
            for (let index = 0; index < points.length; index += 1) {
                corruptions.add([...points.slice(0, index), focus, ...points.slice(index + 1)].join(""))
            }
        }
        for (const left of carriers) for (const right of carriers) corruptions.add(`${left}${right}`)

        const tokens = compileCustomKeysPractice({
            keys: [focus], corpus: carriers, language: "english", textStyle: "pseudo", seed: 19, wordCount: 32,
        }).split(" ")

        expect(tokens).toHaveLength(32)
        expect(tokens).not.toContain("nnternational")
        expect(tokens.filter((token) => corruptions.has(token))).toEqual([])
        expect(tokens.every((token) => [...token].length >= 3 && [...token].length <= 10)).toBe(true)
    })

    it("reuses valid sparse material only outside the novelty window", () => {
        const tokens = compileCustomKeysPractice({
            keys: ["a"], corpus: ["aa"], language: "english", textStyle: "pseudo", seed: 23, wordCount: 40,
        }).split(" ")
        const lastSeen = new Map<string, number>()

        tokens.forEach((token, index) => {
            const previous = lastSeen.get(token)
            if (previous !== undefined) expect(index - previous).toBeGreaterThan(8)
            lastSeen.set(token, index)
        })
        expect(new Set(tokens).size).toBeLessThan(tokens.length)
    })

    it("gives every supported digit a balanced one-to-four-digit Pseudo token", () => {
        const request = {
            keys: ALL_DIGITS, corpus, language: "english", textStyle: "pseudo" as const, seed: 175, wordCount: 40,
        }
        const first = compileCustomKeysPractice(request)
        const tokens = first.split(" ")

        expect(compileCustomKeysPractice(request)).toBe(first)
        expect(tokens).toHaveLength(40)
        tokens.forEach((token, index) => {
            expect(token).toMatch(/^\d{1,4}$/)
            expect(token).toContain(ALL_DIGITS[index % ALL_DIGITS.length])
        })
        ALL_DIGITS.forEach((digit) => expect(tokens.filter((_, index) => ALL_DIGITS[index % ALL_DIGITS.length] === digit)).toHaveLength(4))
    })

    it("puts every supported Practice mark in its natural Pseudo token shape", () => {
        const tokens = compileCustomKeysPractice({
            keys: DRILL_MARKS, corpus, language: "english", textStyle: "pseudo", seed: 81, wordCount: 28,
        }).split(" ")

        expect(tokens).toHaveLength(28)
        tokens.forEach((token, index) => {
            const mark = DRILL_MARKS[index % DRILL_MARKS.length]!
            if (mark === "-") {
                expect(token).toMatch(/^\p{L}{3,10}-\p{L}{3,10}$/u)
            } else {
                expect(token).toMatch(/^\p{L}{3,10}[.,?!;:]$/u)
                expect(token.endsWith(mark)).toBe(true)
                expect(token.slice(0, -1)).not.toContain(mark)
            }
        })
        DRILL_MARKS.forEach((mark) => expect(tokens.filter((_, index) => DRILL_MARKS[index % DRILL_MARKS.length] === mark)).toHaveLength(4))
    })

    it("keeps mixed letter, digit, and punctuation focus balanced in sparse Pseudo material", () => {
        const keys = ["r", "5", ";", "-"]
        const request = { keys, corpus: ["aa"], language: "english", textStyle: "pseudo" as const, seed: 33, wordCount: 24 }
        const first = compileCustomKeysPractice(request)
        const tokens = first.split(" ")

        expect(compileCustomKeysPractice(request)).toBe(first)
        expect(tokens).toHaveLength(24)
        tokens.forEach((token, index) => {
            const focus = keys[index % keys.length]!
            if (focus === "r") expect(token).toMatch(/^\p{L}{3,10}$/u)
            if (focus === "5") expect(token).toMatch(/^\d{1,4}$/)
            if (focus === ";") expect(token).toMatch(/^\p{L}{3,10};$/u)
            if (focus === "-") expect(token).toMatch(/^\p{L}{3,10}-\p{L}{3,10}$/u)
            expect(token).toContain(focus)
        })
    })

    it("leaves Varied decoration and unsupported Pseudo characters unchanged", () => {
        expect(compileCustomKeysPractice({ keys: ["5", ";"], corpus, language: "english", textStyle: "varied", seed: 1, wordCount: 12 }))
            .toBe("around 5 ;there often 5 ;after under 5 ;other café 5 ;quiet ready 5 ;stone their 5 ;river")
        expect(compileCustomKeysPractice({ keys: ["@"], corpus, language: "english", textStyle: "pseudo", seed: 1, wordCount: 12 }))
            .toBe("")
    })
})

describe("completeCustomKeysPractice", () => {
    it("reports every selected key that occurred and pools mixed durations from up to ten completed same-style runs", () => {
        const current = run("current", 100, ["r", "t", "x"], "varied", true, [
            { key: "a" }, { key: "r", dt: 100 }, { key: "r", correct: false, dt: 100 }, { key: "t", dt: 200 },
        ])
        const priors = Array.from({ length: 12 }, (_, index) => run(`prior-${index}`, 99 - index, [index % 2 ? "r" : "t", "a"], "varied", index !== 3, [
            { key: "a" }, { key: index % 2 ? "r" : "t", dt: 200 },
        ]))
        const wrongStyle = run("pseudo", 98, ["r"], "pseudo", true, [{ key: "a" }, { key: "r", dt: 20 }])
        const recap = completeCustomKeysPractice({ current, history: [...priors, wrongStyle] })

        expect(recap.keys.map((row) => row.key)).toEqual(["r", "t"])
        expect(recap.keys[0]).toMatchObject({ attempts: 2, accuracy: 50 })
        expect(recap.keys[0]!.baseline?.runs).toBe(5)
        expect(recap.keys[0]!.baseline?.speedWpm).toBe(60)
        expect(recap.keys[0]!.delta?.speedWpm).toBe(60)
        expect(recap.baselineReady).toBe(true)
    })

    it("builds a baseline after one prior run and excludes stopped/current activity", () => {
        const current = run("current", 3, ["é"], "varied", true, [{ key: "a" }, { key: "é", dt: 100 }])
        const stopped = run("stopped", 2, ["é"], "varied", false, [{ key: "a" }, { key: "é", dt: 5 }])
        const prior = run("prior", 1, ["é"], "varied", true, [{ key: "a" }, { key: "é", correct: false, dt: 200 }])
        const recap = completeCustomKeysPractice({ current, history: [current, stopped, prior] })
        expect(recap.keys[0]!.baseline).toMatchObject({ runs: 1, attempts: 1, accuracy: 0 })
    })

    it("returns baseline-building copy state when no eligible prior item exists", () => {
        const current = run("current", 2, ["r"], "varied", true, [{ key: "r" }])
        expect(completeCustomKeysPractice({ current, history: [] })).toMatchObject({ baselineReady: false })
    })
})

describe("parseCustomKeysPracticePreferences", () => {
    it("restores valid choices and repairs corrupt storage to the 60s varied default", () => {
        expect(parseCustomKeysPracticePreferences({ keys: ["é", "5"], durationSeconds: 120, textStyle: "pseudo" }))
            .toEqual({ keys: ["é", "5"], durationSeconds: 120, textStyle: "pseudo" })
        expect(parseCustomKeysPracticePreferences({ durationSeconds: 45, textStyle: "dense" }))
            .toEqual({ keys: [], durationSeconds: 45, textStyle: "varied" })
        expect(parseCustomKeysPracticePreferences({ durationSeconds: 3_601 }))
            .toEqual({ keys: [], durationSeconds: 60, textStyle: "varied" })
    })
})
