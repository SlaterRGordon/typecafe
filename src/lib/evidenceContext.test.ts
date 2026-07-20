import { describe, expect, it } from "vitest"
import type { CoachingTarget } from "./coachingTarget"
import {
    completedRunProvesMastery,
    completedRunProvesTransfer,
    completedRunUpdatesTargetResponse,
    discoversWeakness,
    EVIDENCE_CONTEXTS,
    evidenceContextForCoachingStep,
    evidenceContextForRun,
    evidenceContextForStoredTest,
    parsePracticeRecord,
    practiceComparisonWindow,
    practiceRecordMatchesEvidence,
    provesMastery,
    provesTransfer,
    updatesTargetResponse,
} from "./evidenceContext"

const guidedTarget: CoachingTarget = { kind: "transition", pair: "th", metric: "latency" }

const guided = parsePracticeRecord({
    v: 1,
    kind: "guided",
    focus: { kind: "grams", items: ["th"] },
    textStyle: "varied",
    durationSeconds: 60,
    elapsedActivityMs: 61_200,
    completed: true,
    target: guidedTarget,
})!

const custom = parsePracticeRecord({
    v: 1,
    kind: "custom",
    focus: { kind: "grams", items: ["th", "ing"] },
    textStyle: "pseudo",
    durationSeconds: 30,
    elapsedActivityMs: 12_000,
    completed: false,
})!

describe("evidence context", () => {
    it("translates existing typing surfaces without changing Test mode ids", () => {
        expect(evidenceContextForRun({ surface: "test", mode: 0 })).toBe("natural")
        expect(evidenceContextForRun({ surface: "test", mode: 2 })).toBe("grams")
        expect(evidenceContextForRun({ surface: "drill", mode: 0 })).toBe("acquisition")
        expect(evidenceContextForRun({ surface: "train", mode: 0 })).toBe("train")
    })

    it("freezes known Coaching steps into their honest contexts", () => {
        expect(evidenceContextForCoachingStep("baseline")).toBe("natural")
        expect(evidenceContextForCoachingStep("calibration")).toBe("diagnostic")
        expect(evidenceContextForCoachingStep("focus")).toBe("acquisition")
        expect(evidenceContextForCoachingStep("recheck")).toBe("cold")
    })

    it("classifies only legacy ranked normal Tests as natural", () => {
        expect(evidenceContextForStoredTest({ storedContext: null, ranked: true, mode: 0 })).toBe("natural")
        expect(evidenceContextForStoredTest({ storedContext: null, ranked: false, mode: 0 })).toBeNull()
        expect(evidenceContextForStoredTest({ storedContext: null, ranked: true, mode: 4 })).toBeNull()
        expect(evidenceContextForStoredTest({ storedContext: "broken", ranked: true, mode: 0 })).toBeNull()
        expect(evidenceContextForStoredTest({ storedContext: "transfer", ranked: false, mode: 0 })).toBe("transfer")
    })

    it("keeps discovery, response, Transfer, and Mastery proof distinct", () => {
        expect(EVIDENCE_CONTEXTS.filter(discoveriesWeakness)).toEqual(["natural", "diagnostic"])
        expect(EVIDENCE_CONTEXTS.filter(updatesTargetResponse)).toEqual(["acquisition", "transfer", "cold"])
        expect(provesTransfer("transfer")).toBe(true)
        expect(provesMastery("transfer")).toBe(false)
        expect(provesMastery("cold")).toBe(true)
        expect(provesMastery(null)).toBe(false)
        expect(discoversWeakness("custom-practice")).toBe(false)
        expect(updatesTargetResponse("custom-practice")).toBe(false)
        expect(provesTransfer("custom-practice")).toBe(false)
        expect(provesMastery("custom-practice")).toBe(false)
    })

    it("parses versioned Guided and Custom Practice records conservatively", () => {
        expect(guided).toMatchObject({ kind: "guided", focus: { kind: "grams", items: ["th"] } })
        expect(custom).toMatchObject({ kind: "custom", completed: false, elapsedActivityMs: 12_000 })
        expect(parsePracticeRecord({ ...custom, v: 2 })).toBeNull()
        expect(parsePracticeRecord({ ...custom, target: guidedTarget })).toBeNull()
        expect(parsePracticeRecord({ ...guided, target: undefined })).toBeNull()
        expect(parsePracticeRecord({ ...guided, durationSeconds: 45 })).toBeNull()
        expect(practiceRecordMatchesEvidence(guided, "acquisition", guidedTarget)).toBe(true)
        expect(practiceRecordMatchesEvidence(guided, "custom-practice", guidedTarget)).toBe(false)
        expect(practiceRecordMatchesEvidence(custom, "custom-practice", null)).toBe(true)
        expect(practiceRecordMatchesEvidence(custom, "acquisition", null)).toBe(false)
        expect(practiceRecordMatchesEvidence(null, "custom-practice", null)).toBe(false)
        expect(practiceRecordMatchesEvidence(null, "acquisition", null)).toBe(true)
        expect(completedRunUpdatesTargetResponse("acquisition", { ...guided, completed: false })).toBe(false)
        expect(completedRunProvesTransfer("transfer", { ...guided, completed: false })).toBe(false)
        expect(completedRunProvesMastery("cold", { ...guided, completed: false })).toBe(false)
    })

    it("uses the previous ten completed same-cohort runs without duration or activity bias", () => {
        const current = { id: "current", completedAt: 100, practice: guided }
        const prior = Array.from({ length: 12 }, (_, index) => ({
            id: `prior-${index}`,
            completedAt: 80 - index,
            practice: {
                ...guided,
                durationSeconds: index % 2 === 0 ? 30 as const : 240 as const,
                elapsedActivityMs: 500 + index,
            },
        }))
        const excluded = [
            { id: "incomplete", completedAt: 99, practice: { ...guided, completed: false } },
            { id: "wrong-style", completedAt: 98, practice: { ...guided, textStyle: "pseudo" as const } },
            { id: "wrong-target", completedAt: 97, practice: { ...guided, target: { kind: "transition" as const, pair: "he", metric: "latency" as const } } },
        ]

        const cohort = practiceComparisonWindow([current, ...prior, ...excluded], current)

        expect(cohort).toHaveLength(10)
        expect(cohort.map((run) => run.id)).toEqual(prior.slice(0, 10).map((run) => run.id))
    })

    it("cohorts Custom Practice by item and style while allowing one prior run", () => {
        const current = { id: "current", completedAt: 10, practice: { ...custom, completed: true } }
        const matching = { id: "matching", completedAt: 9, practice: { ...custom, completed: true, durationSeconds: 240 as const } }
        const otherItem = { id: "other", completedAt: 8, practice: { ...custom, completed: true, focus: { kind: "grams" as const, items: ["er"] } } }

        expect(practiceComparisonWindow([current, matching, otherItem], current, "th")).toEqual([matching])
        expect(practiceComparisonWindow([current, matching], current)).toEqual([])
    })
})

function discoveriesWeakness(context: typeof EVIDENCE_CONTEXTS[number]) {
    return discoversWeakness(context)
}
