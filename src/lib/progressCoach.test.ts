import { describe, expect, it } from "vitest"
import type { CoachingTarget } from "./coachingTarget"
import type { DailyCoachingSession, FrozenRecommendation } from "./dailyCoaching"
import { filterProgressCoachTargets, progressImpactTone, projectProgressCoach } from "./progressCoach"
import type { MasteryRecord, SkillAnalysis, SkillCandidate } from "./skillEvidence"

const prescription: FrozenRecommendation = {
    id: "transition:tion", target: { kind: "gram", gram: "tion" }, metric: "ms", direction: "lower",
    baseline: 520, weaknessThreshold: 400, minimumChange: 26, impactMsPer1000: 2900,
    confidence: 0.9, sampleCount: 20, distinctTests: 3, distinctWords: 5,
    reasonCode: "gram_internal_latency_high", reason: "Slow pattern", seenWords: ["station"],
}

function record(id: string, state: MasteryRecord["state"], target = prescription.target): MasteryRecord {
    return {
        id, target, state, prescription: { ...prescription, id, target }, prescribedDate: "2026-07-14",
        lastEvidenceDate: id.endsWith("new") ? "2026-07-16" : "2026-07-15", heldColdChecks: state === "retained" ? 1 : 0,
        practicedDaysUntilDue: state === "due" ? 0 : null,
        practiceSets: 2, practiceSamples: 12,
        proof: {
            target, metric: "ms", baseline: 520, bestAcquisition: 440, transfer: 455,
            ...(state === "retained" ? { cold: 460 } : {}),
            improvedInTransfer: true, heldCold: state === "retained" ? true : null,
            sampleCounts: { baseline: 20, transfer: 8, cold: state === "retained" ? 6 : 0 },
        },
    }
}

function candidate(target: CoachingTarget = { kind: "transition", pair: "br", metric: "latency" }, impactMsPer1000 = 1_400): SkillCandidate {
    const pair = target.kind === "transition" ? target.pair : "br"
    return {
        id: JSON.stringify(target), target, metric: "ms", direction: "lower", observed: 140, baseline: 100,
        sampleCount: 20, distinctTests: 2, distinctWords: 8, frequencyPer1000: 10, confidence: 0.9,
        recencyWeight: 1, impactMsPer1000,
        reason: { code: "transition_latency_above_baseline", pair, observedMs: 140, baselineMs: 100, ratio: 1.4 },
    }
}

function analysis(mastery: MasteryRecord[], candidates: SkillCandidate[] = []): SkillAnalysis {
    return {
        quality: { status: "ready", analyzedTimelines: 2, discoveryTimelines: 2, naturalTimelines: 2, acquisitionTimelines: 0, discoveryCharacters: 1000, usableLatencySamples: 100, excludedNonPositiveGaps: 0, excludedInterruptionGaps: 0, interrupted: false },
        candidates, recommendation: candidates[0] ?? null, mastery,
        recap: { retained: mastery.filter((item) => item.state === "retained"), due: mastery.find((item) => item.state === "due") ?? null, regressed: mastery.find((item) => item.state === "regressed") ?? null },
        testFamilyCosts: [],
    }
}

describe("projectProgressCoach", () => {
    it("uses four impact bands without making a tiny leading Target look urgent", () => {
        expect(progressImpactTone(2_900, 2_900)).toBe("urgent")
        expect(progressImpactTone(1_400, 2_900)).toBe("material")
        expect(progressImpactTone(700, 2_900)).toBe("moderate")
        expect(progressImpactTone(100, 2_900)).toBe("minor")
        expect(progressImpactTone(100, 100)).toBe("minor")
    })

    it("groups repeated episodes while keeping drill performance out of ability stages", () => {
        const old = record("tion-old", "transferred")
        const latest = record("tion-new", "retained")
        const result = projectProgressCoach(analysis([latest, old]), null)
        expect(result.targets).toHaveLength(1)
        expect(result.targets[0]).toMatchObject({ label: "tion", state: "retained", episodeCount: 2 })
        expect(result.targets[0]!.episodes).toHaveLength(2)
        expect(result.targets[0]!.stages.map((stage) => stage.label)).toEqual(["Baseline", "Recent"])
        expect(result.targets[0]!.stages.map((stage) => stage.value)).toEqual(["520 ms", "460 ms"])
        expect(result.targets[0]!.practice).toEqual({ completedDrills: 4, sampleCount: 24, value: "440 ms" })
    })

    it("includes a supported ordinary weakness with direct practice independent of Coach", () => {
        const result = projectProgressCoach(analysis([], [candidate()]), null)
        expect(result.targets[0]).toMatchObject({ label: "b→r", state: "needs-work", statusLabel: "Needs work" })
        expect(result.targets[0]!.stages).toEqual([{ key: "recent", label: "Recent", value: "140 ms", numericValue: 140, sampleCount: 20 }])
        expect(result.targets[0]!.trend).toBeNull()
        expect(result.targets[0]!.action).toMatchObject({ label: "Practice this transition" })
        expect(result.targets[0]!.action!.href).toContain("/drill?target=transition")
        expect(result.defaultTarget).toMatchObject({ label: "b→r", statusLabel: "Needs work" })
        expect(result.defaultTarget.action!.href).toContain("/drill?target=transition")
    })

    it("keeps recent ability separate from a perfect drill result", () => {
        const accuracy = candidate({ kind: "key", keys: ["r"], metric: "accuracy" })
        accuracy.metric = "%"
        accuracy.direction = "higher"
        accuracy.observed = 92
        accuracy.baseline = 95
        accuracy.response = { context: "acquisition", value: 100, sampleCount: 18, runCount: 1 }

        const row = projectProgressCoach(analysis([], [accuracy]), null).targets[0]!

        expect(row.stages).toEqual([{ key: "recent", label: "Recent", value: "92.0%", numericValue: 92, sampleCount: 20 }])
        expect(row.practice).toEqual({ completedDrills: 1, sampleCount: 18, value: "100.0%" })
        expect(row.trend).toEqual({ label: "8.0 %", arrow: "up", outcome: "good" })
        expect(row.trendSource).toBe("practice")
    })

    it("never calibrates beside a visible actionable Target when recommendation state lags", () => {
        const lagging = analysis([], [candidate()])
        lagging.recommendation = null

        const result = projectProgressCoach(lagging, null)

        expect(result.targets).toHaveLength(1)
        expect(result.defaultTarget).toMatchObject({ label: "b→r", state: "needs-work", statusLabel: "Needs work" })
    })

    it("merges matching current weakness and coached proof into one Target row", () => {
        const current = candidate({ kind: "transition", pair: "br", metric: "latency" })
        const regressed = record("br-new", "regressed", current.target)
        const result = projectProgressCoach(analysis([regressed], [current]), null)
        expect(result.targets).toHaveLength(1)
        expect(result.targets[0]).toMatchObject({ label: "b→r", state: "regressed", episodeCount: 1 })
        expect(result.targets[0]!.stages.at(-1)).toMatchObject({ label: "Recent", value: "140 ms" })
    })

    it("orders the entire Target list by estimated worth across mastery states", () => {
        const rows = [
            record("held-new", "retained", { kind: "key", keys: ["z"], metric: "latency" }),
            record("transfer-new", "transferred", { kind: "gram", gram: "ing" }),
            record("train-new", "training", { kind: "key", keys: ["q"], metric: "latency" }),
            record("regress-new", "regressed", { kind: "transition", pair: "er", metric: "latency" }),
            record("due-new", "due"),
        ]
        rows.forEach((row, index) => {
            row.prescription = { ...row.prescription, impactMsPer1000: 1_000 + index * 1_000 }
        })
        const result = projectProgressCoach(analysis(rows, [candidate()]), null)
        expect(result.targets.map((row) => row.state)).toEqual(["due", "regressed", "training", "transferred", "needs-work", "retained"])
        expect(result.targets.map((row) => row.impactMsPer1000)).toEqual([5_000, 4_000, 3_000, 2_000, 1_400, 1_000])
    })

    it("defaults detail to the highest-ranked Target and keeps direct actions on each row", () => {
        const due = record("tion-new", "due")
        const held = record("er-new", "retained", { kind: "transition", pair: "er", metric: "latency" })
        const result = projectProgressCoach(analysis([held, due]), null)
        expect(result.defaultTarget).toMatchObject({ label: "tion", state: "due", statusLabel: "Ready to revisit" })
        expect(result.defaultTarget.action?.href).toContain("/drill?target=gram")
        expect(result.defaultTarget.action?.href).toContain("policy=acquisition")
        expect(filterProgressCoachTargets(result.targets, "transition").map((row) => row.label)).toEqual(["e→r"])
    })

    it("keeps improved Targets directly practicable", () => {
        const transferred = record("r-new", "transferred", { kind: "key", keys: ["r"], metric: "accuracy" })
        transferred.prescription = { ...transferred.prescription, metric: "%", direction: "higher", baseline: 88 }
        transferred.proof = { ...transferred.proof, metric: "%", baseline: 88, bestAcquisition: 95, transfer: 96 }
        const result = projectProgressCoach(analysis([transferred]), null)
        expect(result.defaultTarget).toMatchObject({ label: "r", state: "transferred", statusLabel: "Improved" })
        expect(result.defaultTarget.action?.href).toContain("/drill?target=key")
        expect(result.defaultTarget.headline).toBe("r improved in recent typing")
    })

    it("keeps a just-completed Target visible when current weaknesses fill the bounded list", () => {
        const target: CoachingTarget = { kind: "key", keys: ["r"], metric: "accuracy" }
        const transferred = record("r-new", "transferred", target)
        transferred.prescription = { ...transferred.prescription, target, metric: "%", direction: "higher", baseline: 88 }
        transferred.proof = { ...transferred.proof, target, metric: "%", baseline: 88, bestAcquisition: 94, transfer: 100 }
        const recommended = candidate(target, 9_000)
        const crowded = "oiutlcdbhgkwvzxq".split("").map((key, index) =>
            candidate({ kind: "key", keys: [key], metric: "accuracy" }, 8_000 - index * 100))
        const session = {
            version: 3, id: "today", dateKey: "2026-07-16", pool: "qwerty", language: "english", kind: "targeted",
            reason: "", estimatedMinutes: 6, status: "completed", currentStepIndex: 2,
            steps: [], prescription: transferred.prescription, createdAt: 1, updatedAt: 2,
        } satisfies DailyCoachingSession

        const result = projectProgressCoach(analysis([transferred], [recommended, ...crowded]), session)

        expect(result.defaultTarget.impactMsPer1000).toBe(8_000)
        expect(result.targets.find((row) => row.label === "r")).toMatchObject({ state: "training", statusLabel: "Practising" })
        expect(result.targets.filter((row) => row.state === "needs-work")).toHaveLength(12)
    })

    it("surfaces comparable Target families after the leading Impact-ranked weaknesses", () => {
        const candidates = [
            candidate({ kind: "key", keys: ["a"], metric: "accuracy" }, 1_000),
            candidate({ kind: "key", keys: ["b"], metric: "accuracy" }, 900),
            candidate({ kind: "key", keys: ["c"], metric: "accuracy" }, 800),
            candidate({ kind: "key", keys: ["d"], metric: "accuracy" }, 700),
            candidate({ kind: "transition", pair: "ab", metric: "latency" }, 350),
            candidate({ kind: "gram", gram: "tion" }, 260),
            candidate({ kind: "movement", movement: "same-finger", anchors: ["ed"] }, 100),
        ]

        const result = projectProgressCoach(analysis([], candidates), null)

        expect(result.targets.slice(0, 6).map((row) => row.label)).toEqual(["a", "b", "c", "d", "a→b", "tion"])
        expect(result.targets.findIndex((row) => row.label === "this movement"))
            .toBeGreaterThan(result.targets.findIndex((row) => row.label === "d"))
    })

    it("uses the frozen current session Target ahead of another due row", () => {
        const due = record("tion-new", "due")
        const current = record("er-new", "training", { kind: "transition", pair: "er", metric: "latency" })
        const session = {
            version: 3, id: "today", dateKey: "2026-07-16", pool: "qwerty", language: "english", kind: "targeted",
            reason: "", estimatedMinutes: 6, status: "active", currentStepIndex: 0,
            steps: [{ id: "focus", kind: "focus", context: "acquisition", title: "Acquire", detail: "", href: "/", target: current.target, sets: [] }],
            prescription: current.prescription, createdAt: 1, updatedAt: 1,
        } satisfies DailyCoachingSession
        current.prescription = { ...current.prescription, impactMsPer1000: 5_000 }
        const result = projectProgressCoach(analysis([due, current]), session)
        expect(result.defaultTarget.label).toBe("e→r")
        expect(result.targets[0]).toMatchObject({ label: "e→r", state: "training", impactMsPer1000: 5_000 })
    })

    it("formats higher-is-better Accuracy proof without reversing chronology", () => {
        const accuracy = record("r-new", "retained", { kind: "key", keys: ["r"], metric: "accuracy" })
        accuracy.prescription = { ...accuracy.prescription, metric: "%", direction: "higher", baseline: 88 }
        accuracy.proof = {
            ...accuracy.proof, metric: "%", baseline: 88, bestAcquisition: 94, transfer: 95, cold: 96,
        }
        const row = projectProgressCoach(analysis([accuracy]), null).targets[0]!
        expect(row.direction).toBe("higher")
        expect(row.stages.map((stage) => `${stage.label} ${stage.value}`)).toEqual([
            "Baseline 88.0%", "Recent 96.0%",
        ])
        expect(row.practice).toEqual({ completedDrills: 2, sampleCount: 12, value: "94.0%" })
        expect(row.trend).toEqual({ label: "8.0 %", arrow: "up", outcome: "good" })
    })

    it("projects aligned Target presentation instead of generic taxonomy labels", () => {
        const movement = candidate({ kind: "movement", movement: "same-finger", anchors: ["nm", "un", "ju", "my"] }, 800)
        movement.reason = { code: "movement_latency_high", movement: "same-finger", observedMs: 140, baselineMs: 100, anchors: ["nm", "un", "ju", "my"] }
        const correction = candidate({ kind: "correction", expected: "r", typed: "t" }, 700)
        correction.reason = { code: "correction_confusion_recurs", expected: "r", typed: "t", errors: 4, errorRatePct: 20 }

        const result = projectProgressCoach(analysis([], [movement, correction]), null)
        const movementRow = result.targets.find((row) => row.family === "movement")!
        const correctionRow = result.targets.find((row) => row.family === "correction")!

        expect(movementRow).toMatchObject({
            typeLabel: "Movement",
            description: "n→m · same-finger runs slow",
            visualKeys: ["n", "m"],
            filter: "movement",
        })
        expect(correctionRow).toMatchObject({
            typeLabel: "Correction",
            description: "t is repeatedly corrected to r",
            visualKeys: ["t", "r"],
            filter: "other",
        })
        expect(filterProgressCoachTargets(result.targets, "movement")).toEqual([movementRow])
    })
})
