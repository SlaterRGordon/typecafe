import { describe, expect, it } from "vitest"
import { targetAction, type CoachingTarget, type GuidedTargetEvidence } from "./coachingTarget"
import { compileCustomGramsPractice } from "./customGramsPractice"
import { compileCustomKeysPractice } from "./customKeysPractice"
import {
    compileGuidedPractice,
    completeGuidedPractice,
    focusMatchesPrescription,
    guidedFocusForTarget,
    guidedPracticeRecord,
    guidedPracticeSetup,
    measuredGramSuggestions,
    measureGuidedTarget,
} from "./guidedPractice"
import { encodeTimeline, type KeystrokeEvent } from "./keystrokes"

const corpus = ["question", "quiet", "action", "station", "motion", "from", "dream", "swing", "aqua", "quick", "the", "and", "home"]

function events(text: string, dt = 100): KeystrokeEvent[] {
    return [...text].map((key, index) => ({ key, typed: key, correct: true, t: index * dt }))
}

describe("Guided Practice policy", () => {
    const matrix: Array<[CoachingTarget, "keys" | "grams" | null, string[]]> = [
        [{ kind: "key", keys: ["q"], metric: "accuracy" }, "keys", ["q"]],
        [{ kind: "transition", pair: "ti", metric: "latency" }, "grams", ["ti"]],
        [{ kind: "gram", gram: "tion" }, "grams", ["tion"]],
        [{ kind: "word", words: ["quick", "quiet"], sharedGram: "qui" }, "grams", ["qui"]],
        [{ kind: "movement", movement: "row-reach", anchors: ["fr", "dr", "sw", "aq"] }, "grams", ["fr", "dr", "sw", "aq"]],
        [{ kind: "correction", expected: "q", typed: "x" }, "keys", ["q", "x"]],
        [{ kind: "endurance", shortSeconds: 30, longSeconds: 60 }, null, []],
    ]

    it.each(matrix)("maps $kind to one concrete editor focus", (target, kind, items) => {
        expect(guidedFocusForTarget(target)).toEqual(kind ? { kind, items } : null)
        if (target.kind === "endurance") expect(targetAction(target).href).toBe("/?mode=timed&count=60&coaching=endurance&target=endurance&shortSeconds=30&longSeconds=60&policy=acquisition")
        else expect(targetAction(target).href).toContain("/practice?target=")
    })

    it("keeps attribution for duration/style only and converts on any prescribed focus edit", () => {
        const target: CoachingTarget = { kind: "movement", movement: "row-reach", anchors: ["fr", "dr", "sw", "aq"] }
        const setup = guidedPracticeSetup(target)!
        expect(focusMatchesPrescription(setup.focus, target)).toBe(true)
        expect(focusMatchesPrescription({ ...setup.focus, items: [...setup.focus.items, "ti"] }, target)).toBe(false)
        expect(focusMatchesPrescription({ ...setup.focus, items: setup.focus.items.slice(1) }, target)).toBe(false)
        expect(guidedPracticeRecord({ ...setup, durationSeconds: 240, textStyle: "pseudo" }, 0, false)).toMatchObject({ kind: "guided", target, durationSeconds: 240, textStyle: "pseudo" })
    })

    it.each(matrix.slice(0, -1))("compiles target-dense varied and pseudo runs for $kind", (target) => {
        const setup = guidedPracticeSetup(target)!
        const varied = compileGuidedPractice({ setup, corpus, language: "english", seed: 7, wordCount: 24 })
        const pseudo = compileGuidedPractice({ setup: { ...setup, textStyle: "pseudo" }, corpus, language: "english", seed: 7, wordCount: 24 })
        expect(varied.split(" ").length).toBeGreaterThanOrEqual(20)
        expect(pseudo.split(" ").length).toBeGreaterThanOrEqual(20)
        expect(varied).not.toMatch(/\b(tion ){4}tion\b/)
    })

    it.each([
        { target: { kind: "key", keys: ["q"], metric: "accuracy" } as const, kind: "keys" as const },
        { target: { kind: "gram", gram: "tion" } as const, kind: "grams" as const },
    ])("routes Guided $kind Pseudo through the corresponding Custom policy", ({ target, kind }) => {
        const setup = { ...guidedPracticeSetup(target)!, textStyle: "pseudo" as const }
        const input = { corpus, language: "english", seed: 13, wordCount: 24 }
        const guided = compileGuidedPractice({ setup, ...input })
        const custom = kind === "keys"
            ? compileCustomKeysPractice({ keys: setup.focus.items, textStyle: "pseudo", ...input })
            : compileCustomGramsPractice({ grams: setup.focus.items, textStyle: "pseudo", ...input })

        expect(guided).toBe(custom)
    })

    it("measures the Target metric and leads recap with Practice Delta plus a separate natural reference", () => {
        const target: CoachingTarget = { kind: "transition", pair: "th", metric: "latency" }
        const setup = guidedPracticeSetup(target)!
        const priorEvents = events("the the", 140)
        const currentEvents = events("the the", 100)
        const prior = { id: "prior", completedAt: 1, practice: guidedPracticeRecord(setup, 60_000, true), timeline: encodeTimeline(priorEvents) }
        const current = { id: "current", completedAt: 2, practice: guidedPracticeRecord(setup, 60_000, true), timeline: encodeTimeline(currentEvents) }
        const naturalReference: GuidedTargetEvidence = { metric: "ms", baseline: 90, observed: 180, sampleCount: 8, reason: "Recent Tests measured this transition slowly." }
        const recap = completeGuidedPractice({ current, history: [prior], naturalReference })

        expect(measureGuidedTarget(target, currentEvents)).toMatchObject({ label: "Transition latency", value: 100, unit: "ms", attempts: 2 })
        expect(recap.metric).toMatchObject({ value: 100, attempts: 2 })
        expect(recap.practiceBaseline).toEqual({ value: 140, attempts: 2, runs: 1 })
        expect(recap.practiceDelta).toBe(40)
        expect(recap.naturalReference).toEqual(naturalReference)
    })

    it("keeps mixed measured Targets Custom and therefore attributes no Target", () => {
        const target: CoachingTarget = { kind: "gram", gram: "tion" }
        const setup = guidedPracticeSetup(target)!
        const mixed = { ...setup.focus, items: [...setup.focus.items, "ing"] }
        expect(focusMatchesPrescription(mixed, target)).toBe(false)
        expect(guidedPracticeRecord(setup, 1_000, true)).toMatchObject({ kind: "guided", target })
    })

    it("offers only directly measured Gram Targets separately from common material", () => {
        const base = {
            metric: "ms" as const, direction: "lower" as const, observed: 186, baseline: 110,
            sampleCount: 12, distinctTests: 2, distinctWords: 4, frequencyPer1000: 10,
            confidence: 1, recencyWeight: 1, impactMsPer1000: 760,
        }
        const candidates = [
            { ...base, id: "gram:tion", target: { kind: "gram" as const, gram: "tion" }, reason: { code: "gram_internal_latency_high" as const, gram: "tion", observedMs: 186, baselineMs: 110, excessMs: 76, carrierWords: ["action"] } },
            { ...base, id: "key:t", target: { kind: "key" as const, keys: ["t"], metric: "latency" as const }, reason: { code: "key_latency_above_baseline" as const, key: "t", observedMs: 186, baselineMs: 110, ratio: 1.69 } },
            { ...base, id: "word:action", target: { kind: "word" as const, words: ["action"], sharedGram: "tion" }, reason: { code: "word_internal_latency_high" as const, words: ["action"], observedMs: 186, baselineMs: 110, sharedGram: "tion" } },
        ]
        expect(measuredGramSuggestions(candidates)).toMatchObject([{ id: "gram:tion", gram: "tion" }])
    })
})
