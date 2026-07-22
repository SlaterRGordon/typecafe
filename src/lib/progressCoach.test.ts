import { describe, expect, it } from "vitest"
import type { CoachingTarget } from "./coachingTarget"
import { filterProgressCoachTargets, progressImpactTone, projectProgressCoach } from "./progressCoach"
import type { SkillAnalysis, SkillCandidate } from "./skillEvidence"

function candidate(
    target: CoachingTarget = { kind: "transition", pair: "br", metric: "latency" },
    impactMsPer1000 = 1_000,
    overrides: Partial<SkillCandidate> = {},
): SkillCandidate {
    const pair = target.kind === "transition" ? target.pair : "br"
    return {
        id: `${target.kind}:${JSON.stringify(target)}`,
        target,
        metric: "ms",
        direction: "lower",
        observed: 140,
        baseline: 100,
        sampleCount: 20,
        distinctTests: 2,
        distinctWords: 4,
        frequencyPer1000: 25,
        confidence: 1,
        recencyWeight: 1,
        impactMsPer1000,
        reason: { code: "transition_latency_above_baseline", pair, observedMs: 140, baselineMs: 100, ratio: 1.4 },
        ability: { value: 140, sampleCount: 20 },
        ...overrides,
    }
}

function analysis(candidates: SkillCandidate[]): SkillAnalysis {
    return {
        quality: { status: candidates.length ? "ready" : "thin", analyzedTimelines: 2, discoveryTimelines: 2, naturalTimelines: 2, acquisitionTimelines: 0, discoveryCharacters: 1_000, usableLatencySamples: 100, excludedNonPositiveGaps: 0, excludedInterruptionGaps: 0, interrupted: false },
        candidates,
        recommendation: candidates[0] ?? null,
        testFamilyCosts: [],
        evidenceWindow: { tests: 2, fromMs: 100, toMs: 200 },
    }
}

describe("Progress Target projection", () => {
    it("uses four impact bands without making a tiny leading Target look urgent", () => {
        expect(progressImpactTone(1_500, 1_600)).toBe("urgent")
        expect(progressImpactTone(800, 1_600)).toBe("material")
        expect(progressImpactTone(350, 1_600)).toBe("moderate")
        expect(progressImpactTone(100, 100)).toBe("minor")
    })

    it("projects only current Weaknesses with natural evidence and a direct action", () => {
        const result = projectProgressCoach(analysis([candidate()]))

        expect(result.defaultTarget).toMatchObject({
            label: "b→r",
            state: "needs-work",
            statusLabel: "Needs work",
            stages: [{ key: "recent", value: "140 ms", sampleCount: 20 }],
            impactMsPer1000: 1_000,
        })
        expect(result.defaultTarget.action?.href).toContain("/practice?target=transition")
        expect(result.defaultTarget.action?.href).not.toContain("policy=")
        expect(result.evidenceWindow).toEqual({ tests: 2, fromMs: 100, toMs: 200 })
    })

    it("keeps Practice activity separate from Earlier-to-Recent natural ability", () => {
        const result = projectProgressCoach(analysis([candidate(undefined, 1_000, {
            ability: { value: 120, sampleCount: 12, split: { earlier: 160, recent: 120, earlierSamples: 8, recentSamples: 4 } },
            practice: { focusedTimeMs: 75_000, completedRuns: 2, sampleCount: 18, value: 90 },
        })]))

        expect(result.defaultTarget.stages).toEqual([
            { key: "earlier", label: "Earlier", value: "160 ms", numericValue: 160, sampleCount: 8 },
            { key: "recent", label: "Recent", value: "120 ms", numericValue: 120, sampleCount: 4 },
        ])
        expect(result.defaultTarget.practice).toEqual({ focusedTimeMs: 75_000, completedRuns: 2, sampleCount: 18, value: "90 ms" })
        expect(result.defaultTarget.impactMsPer1000).toBe(500)
        expect(result.defaultTarget.worthDelta).toEqual({ label: "1.0s", arrow: "down", outcome: "good" })
    })

    it("asks for an ordinary Test after completed Guided Practice", () => {
        const result = projectProgressCoach(analysis([candidate(undefined, 1_000, { awaitingMeasurement: true })]))

        expect(result.defaultTarget.action).toEqual({ href: "/?mode=timed&count=30", label: "Take a Test" })
        expect(result.defaultTarget.awaitingMeasurement).toBe(true)
    })

    it("names grouped movement scope and exposes several representative sequences", () => {
        const target = { kind: "movement", movement: "same-finger", anchors: ["fr", "de", "sw", "aq"] } as const
        const result = projectProgressCoach(analysis([candidate(target, 900, {
            reason: { code: "movement_latency_high", movement: "same-finger", observedMs: 170, baselineMs: 100, anchors: [...target.anchors] },
        })]))

        expect(result.defaultTarget).toMatchObject({
            label: "same-finger movement",
            typeLabel: "Movement",
            description: "same-finger movement · f→r, d→e, s→w, a→q",
            target,
        })
        expect(result.defaultTarget.action?.href).toContain("target=movement&movement=same-finger&anchors=fr,de,sw,aq")
    })

    it("keeps Impact order while surfacing a comparable supported family", () => {
        const targets = [
            candidate({ kind: "transition", pair: "br", metric: "latency" }, 1_000),
            candidate({ kind: "transition", pair: "io", metric: "latency" }, 900),
            candidate({ kind: "transition", pair: "th", metric: "latency" }, 800),
            candidate({ kind: "key", keys: ["q"], metric: "latency" }, 700, {
                reason: { code: "key_latency_above_baseline", key: "q", observedMs: 140, baselineMs: 100, ratio: 1.4 },
            }),
        ]
        const result = projectProgressCoach(analysis(targets))

        expect(result.targets.map((row) => row.label)).toEqual(["b→r", "i→o", "t→h", "q"])
        expect(filterProgressCoachTargets(result.targets, "transition")).toHaveLength(3)
        expect(filterProgressCoachTargets(result.targets, "key").map((row) => row.label)).toEqual(["q"])
    })

    it("calibrates only when current evidence names no actionable Target", () => {
        const result = projectProgressCoach(analysis([]))

        expect(result.targets).toEqual([])
        expect(result.defaultTarget).toMatchObject({ state: "calibrating", statusLabel: "Building evidence" })
    })
})
