import { describe, expect, it } from "vitest"
import { encodeTimeline, type TestEvidenceEvent } from "./keystrokes"
import {
    compileCustomKeysPractice,
    completeCustomKeysPractice,
    customKeysPracticeRecord,
    parseCustomKeysPracticePreferences,
    type CustomKeysPracticeRun,
} from "./customKeysPractice"

const corpus = ["there", "their", "other", "ready", "river", "café", "often", "around", "quiet", "stone", "under", "after"]

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

    it("generates word-shaped pseudo text from the supporting alphabet", () => {
        const text = compileCustomKeysPractice({ keys: ["r"], corpus, language: "english", textStyle: "pseudo", seed: 9, wordCount: 8 })
        expect(text.split(" ")).toHaveLength(8)
        expect(text.split(" ").every((word) => /^\p{L}{2,}$/u.test(word))).toBe(true)
        expect(text).toContain("r")
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
            .toEqual({ keys: ["e", "r"], durationSeconds: 60, textStyle: "varied" })
    })
})
