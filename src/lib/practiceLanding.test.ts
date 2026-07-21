import { describe, expect, it } from "vitest"
import type { CoachingTarget } from "./coachingTarget"
import { projectPracticeLanding } from "./practiceLanding"
import { projectProgressCoach } from "./progressCoach"
import type { SkillAnalysis, SkillCandidate } from "./skillEvidence"

function candidate(target: CoachingTarget, impactMsPer1000: number, awaitingMeasurement = false): SkillCandidate {
    const pair = target.kind === "transition" ? target.pair : "br"
    return {
        id: JSON.stringify(target), target, metric: "ms", direction: "lower", observed: 140, baseline: 100,
        sampleCount: 20, distinctTests: 2, distinctWords: 8, frequencyPer1000: 10, confidence: 0.9,
        recencyWeight: 1, impactMsPer1000, awaitingMeasurement,
        reason: { code: "transition_latency_above_baseline", pair, observedMs: 140, baselineMs: 100, ratio: 1.4 },
    }
}

function analysis(candidates: SkillCandidate[]): SkillAnalysis {
    return {
        quality: { status: "ready", analyzedTimelines: 2, discoveryTimelines: 2, naturalTimelines: 2, acquisitionTimelines: 0, discoveryCharacters: 1000, usableLatencySamples: 100, excludedNonPositiveGaps: 0, excludedInterruptionGaps: 0, interrupted: false },
        candidates, recommendation: candidates[0] ?? null, mastery: [],
        recap: { retained: [], due: null, regressed: null }, testFamilyCosts: [], evidenceWindow: null,
    }
}

const keys = { keys: ["q", "r"], durationSeconds: 30, textStyle: "pseudo" } as const
const grams = { grams: ["th", "tion"], durationSeconds: 120, textStyle: "varied" } as const

describe("projectPracticeLanding", () => {
    it("presents the exact default Target already chosen by Progress", () => {
        const progress = projectProgressCoach(analysis([
            candidate({ kind: "transition", pair: "io", metric: "latency" }, 800),
            candidate({ kind: "transition", pair: "br", metric: "latency" }, 1_400),
        ]))
        const landing = projectPracticeLanding({ progress, keys, grams })

        expect(landing.recommendation).toMatchObject({
            id: progress.defaultTarget.id,
            label: progress.defaultTarget.label,
            visualKeys: ["b", "r"],
            arrows: true,
            reason: progress.defaultTarget.detail,
            primaryAction: progress.defaultTarget.action,
        })
        expect(landing.recommendation?.primaryAction.href).toContain("/practice?target=transition")
    })

    it("keeps measurement primary and Guided available for an awaiting Target", () => {
        const progress = projectProgressCoach(analysis([
            candidate({ kind: "transition", pair: "br", metric: "latency" }, 1_400, true),
        ]))
        const landing = projectPracticeLanding({ progress, keys, grams })

        expect(landing.recommendation).toMatchObject({
            statusLabel: "practised · awaiting Test",
            awaitingMeasurement: true,
            primaryAction: { href: "/?mode=timed&count=30", label: "Take a Test" },
            secondaryAction: { label: "Practise again" },
        })
        expect(landing.recommendation?.secondaryAction?.href).toContain("/practice?target=transition")
    })

    it("uses a normal Test empty state instead of inventing a Target", () => {
        const progress = projectProgressCoach(analysis([]))
        const landing = projectPracticeLanding({ progress, keys, grams })

        expect(landing.recommendation).toBeNull()
        expect(landing.emptyAction).toEqual({ href: "/?mode=timed&count=60", label: "Take a Test" })
    })

    it("keeps Keys and Grams continuation material, duration, and style separate", () => {
        const landing = projectPracticeLanding({ progress: projectProgressCoach(analysis([])), keys, grams })

        expect(landing.customPaths).toEqual([
            { kind: "keys", title: "Keys", href: "/practice?custom=keys", focus: "q · r", settings: "30s · Pseudo" },
            { kind: "grams", title: "Grams", href: "/practice?custom=grams", focus: "th · tion", settings: "120s · Varied" },
        ])
    })
})
