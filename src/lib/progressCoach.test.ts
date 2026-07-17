import { describe, expect, it } from "vitest"
import type { DailyCoachingSession, FrozenRecommendation } from "./dailyCoaching"
import { filterProgressCoachHistory, projectProgressCoach } from "./progressCoach"
import type { MasteryRecord, SkillAnalysis } from "./skillEvidence"

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
        proof: {
            target, metric: "ms", baseline: 520, bestAcquisition: 440, transfer: 455,
            ...(state === "retained" ? { cold: 460 } : {}),
            improvedInTransfer: true, heldCold: state === "retained" ? true : null,
            sampleCounts: { baseline: 20, transfer: 8, cold: state === "retained" ? 6 : 0 },
        },
    }
}

function analysis(mastery: MasteryRecord[]): SkillAnalysis {
    return {
        quality: { status: "ready", analyzedTimelines: 2, discoveryTimelines: 2, naturalTimelines: 2, acquisitionTimelines: 0, discoveryCharacters: 1000, usableLatencySamples: 100, excludedNonPositiveGaps: 0, excludedInterruptionGaps: 0, interrupted: false },
        candidates: [], recommendation: null, mastery,
        recap: { retained: mastery.filter((item) => item.state === "retained"), due: mastery.find((item) => item.state === "due") ?? null, regressed: mastery.find((item) => item.state === "regressed") ?? null },
        testFamilyCosts: [],
    }
}

describe("projectProgressCoach", () => {
    it("groups repeated episodes and keeps proof in chronological stage order", () => {
        const old = record("tion-old", "transferred")
        const latest = record("tion-new", "retained")
        const result = projectProgressCoach(analysis([latest, old]), null)
        expect(result.history).toHaveLength(1)
        expect(result.history[0]).toMatchObject({ label: "tion", state: "retained", episodeCount: 2 })
        expect(result.history[0]!.episodes).toHaveLength(2)
        expect(result.history[0]!.stages.map((stage) => stage.label)).toEqual(["Baseline", "Practice", "Transfer", "Cold"])
        expect(result.history[0]!.stages.map((stage) => stage.value)).toEqual(["520 ms", "440 ms", "455 ms", "460 ms"])
    })

    it("selects a due Target as the next action without changing history priority", () => {
        const due = record("tion-new", "due")
        const held = record("er-new", "retained", { kind: "transition", pair: "er", metric: "latency" })
        const result = projectProgressCoach(analysis([held, due]), null)
        expect(result.nextAction).toMatchObject({ label: "tion", state: "due", isNextAction: true })
        expect(result.nextAction.action).toEqual({ href: "/plan", label: "Start Cold check" })
        expect(filterProgressCoachHistory(result.history, "held").map((row) => row.label)).toEqual(["e→r"])
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
        const result = projectProgressCoach(analysis([due, current]), session)
        expect(result.nextAction.label).toBe("e→r")
        expect(result.history.find((row) => row.label === "tion")?.isNextAction).toBe(false)
    })

    it("formats higher-is-better Accuracy proof without reversing chronology", () => {
        const accuracy = record("r-new", "retained", { kind: "key", keys: ["r"], metric: "accuracy" })
        accuracy.prescription = { ...accuracy.prescription, metric: "%", direction: "higher", baseline: 88 }
        accuracy.proof = {
            ...accuracy.proof, metric: "%", baseline: 88, bestAcquisition: 94, transfer: 95, cold: 96,
        }
        const row = projectProgressCoach(analysis([accuracy]), null).history[0]!
        expect(row.direction).toBe("higher")
        expect(row.stages.map((stage) => `${stage.label} ${stage.value}`)).toEqual([
            "Baseline 88.0%", "Practice 94.0%", "Transfer 95.0%", "Cold 96.0%",
        ])
    })
})
