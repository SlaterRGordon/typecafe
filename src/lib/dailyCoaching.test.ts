import { describe, expect, it } from "vitest"
import {
    clearLocalDailySessions,
    completedSetCount,
    createDailySession,
    focusProof,
    localDateKey,
    measureQualifies,
    msUntilNextLocalDate,
    parseDailySession,
    preferDailySession,
    previousDateKey,
    readLocalDailySession,
    recordDailySet,
    transferProof,
    writeLocalDailySession,
    yesterdayOutcomeFrom,
    type DailyCoachingSession,
    type YesterdayOutcome,
} from "./dailyCoaching"
import { measureDailyStepSet } from "./dailyCoachingMeasurement"
import { encodeTimeline, type TestEvidenceEvent } from "./keystrokes"
import type { SkillCandidate } from "./skillEvidence"
import type { TransitionAggregate } from "./transitions"

const context = { dateKey: "2026-07-11", pool: "qwerty", language: "english" }
const slowTransitions: TransitionAggregate[] = [
    { pair: "rt", count: 12, totalMs: 4_800, errors: 1 },
    { pair: "th", count: 12, totalMs: 1_800, errors: 0 },
]

const recommendation: SkillCandidate = {
    id: "transition:latency:br",
    target: { kind: "transition", pair: "br", metric: "latency" },
    metric: "ms",
    direction: "lower",
    observed: 400,
    baseline: 150,
    sampleCount: 40,
    distinctTests: 3,
    distinctWords: 8,
    frequencyPer1000: 100,
    confidence: 0.9,
    recencyWeight: 0.9,
    impactMsPer1000: 3_600,
    reason: { code: "transition_latency_above_baseline", pair: "br", observedMs: 400, baselineMs: 150, ratio: 400 / 150 },
}

const set = (after: number, improved = after <= 380) => ({
    netWpm: 70,
    accuracy: 96,
    completedAt: 200 + after,
    targetSamples: 12,
    targetDelta: { label: "b→r", before: 400, after, unit: "ms" as const, improved },
})

function targeted(options: { yesterday?: YesterdayOutcome, candidate?: SkillCandidate } = {}) {
    return createDailySession({
        ...context,
        attempts: new Map(),
        transitions: slowTransitions,
        recommendation: options.candidate ?? recommendation,
        yesterday: options.yesterday,
        now: 100,
    })
}

function storage(): Storage {
    const values = new Map<string, string>()
    return {
        get length() { return values.size }, clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => { values.delete(key) }, setItem: (key, value) => { values.set(key, value) },
    }
}

function transitionTimeline(occurrences: number, deltaMs: number) {
    const events: TestEvidenceEvent[] = []
    let time = 0
    for (let index = 0; index < occurrences; index += 1) {
        events.push({ key: "b", typed: "b", correct: true, t: time })
        time += deltaMs
        events.push({ key: "r", typed: "r", correct: true, t: time })
        time += deltaMs
        events.push({ key: " ", typed: " ", correct: true, t: time })
        time += deltaMs
    }
    return encodeTimeline(events)
}

describe("daily coaching Transfer loop", () => {
    it("computes local date keys and midnight rollover", () => {
        expect(msUntilNextLocalDate(new Date(2026, 6, 11, 23, 59, 30))).toBe(30_000)
        expect(previousDateKey("2026-07-01")).toBe("2026-06-30")
        expect(localDateKey(new Date(2026, 0, 2))).toBe("2026-01-02")
    })

    it("prescribes calibration only when no supported Target exists", () => {
        const session = createDailySession({ ...context, attempts: new Map(), transitions: [], now: 100 })
        expect(session.kind).toBe("calibration")
        expect(session.version).toBe(3)
        expect(session.steps.map((step) => step.context)).toEqual(["diagnostic"])
    })

    it("freezes the Impact recommendation and adds a distinct Transfer check", () => {
        const session = targeted()
        expect(session.steps.map((step) => step.context)).toEqual(["natural", "acquisition", "transfer"])
        expect(session.steps.map((step) => step.kind)).toEqual(["baseline", "focus", "transfer"])
        expect(session.prescription).toMatchObject({
            id: recommendation.id,
            target: recommendation.target,
            baseline: 400,
            weaknessThreshold: 150,
            minimumChange: 20,
            sampleCount: 40,
            reasonCode: "transition_latency_above_baseline",
        })
        expect(session.steps[1]?.href).toContain("policy=acquisition")
        expect(session.steps[2]?.href).toContain("policy=transfer")
        expect(session.estimatedMinutes).toBeGreaterThanOrEqual(5)
        expect(session.estimatedMinutes).toBeLessThanOrEqual(8)
    })

    it("puts a due Cold check first, before warm measure or acquisition", () => {
        const yesterday: YesterdayOutcome = {
            label: "q z",
            target: { kind: "key", keys: ["q", "z"], metric: "accuracy" },
            unit: "%",
            before: 82,
            after: 91,
            minimumChange: 4.1,
        }
        const session = targeted({ yesterday })
        expect(session.steps.map((step) => step.context)).toEqual(["cold", "natural", "acquisition", "transfer"])
        expect(session.steps[0]?.href).toContain("policy=cold")
        expect(session.steps[0]?.requiresTargetSample).toBe(true)
    })

    it("preserves two acquisition wins or three sets, then requires Transfer", () => {
        let session = targeted()
        session = recordDailySet(session, session.steps[0]!.id, { netWpm: 70, accuracy: 96, completedAt: 150 })
        session = recordDailySet(session, session.steps[1]!.id, set(360))
        session = recordDailySet(session, session.steps[1]!.id, set(350))
        expect(session.status).toBe("active")
        expect(session.steps[session.currentStepIndex]?.kind).toBe("transfer")
        expect(focusProof(session)?.after).toBe(350)
        expect(transferProof(session)).toBeNull()
        expect(yesterdayOutcomeFrom(session)).toBeNull()

        // A completed run without qualified target coverage cannot advance.
        const ignored = recordDailySet(session, session.steps[2]!.id, { netWpm: 75, accuracy: 99, completedAt: 500 })
        expect(ignored).toBe(session)

        session = recordDailySet(session, session.steps[2]!.id, set(410, false))
        expect(session.status).toBe("completed")
        expect(transferProof(session)?.improved).toBe(false)
        expect(yesterdayOutcomeFrom(session)).toBeNull()
    })

    it("measures Transfer against the frozen baseline and enforces six samples", () => {
        const session = targeted()
        const transfer = session.steps[2]!
        expect(measureDailyStepSet(session, transfer, { timeline: transitionTimeline(5, 100), netWpm: 70 })).toBeNull()
        expect(measureDailyStepSet(session, transfer, { timeline: transitionTimeline(6, 100), netWpm: 70 })).toMatchObject({
            targetSamples: 6,
            targetDelta: { before: 400, after: 100, unit: "ms", improved: true },
        })
    })

    it("carries higher-order and endurance Targets through the same frozen loop", () => {
        const gramCandidate: SkillCandidate = {
            ...recommendation,
            id: "gram:4:tion",
            target: { kind: "gram", gram: "tion" },
            observed: 400,
            baseline: 200,
            reason: {
                code: "gram_internal_latency_high", gram: "tion", observedMs: 400,
                baselineMs: 200, excessMs: 200, carrierWords: ["action", "station"],
            },
        }
        const gram = targeted({ candidate: gramCandidate })
        expect(gram.steps[1]?.href).toContain("target=gram")
        expect(gram.steps[2]?.href).toContain("seen=action,station")
        expect(gram.steps[2]?.href).toContain("policy=transfer")

        const enduranceCandidate: SkillCandidate = {
            ...recommendation,
            id: "endurance:30:60",
            target: { kind: "endurance", shortSeconds: 30, longSeconds: 60 },
            metric: "wpm",
            direction: "higher",
            observed: 60,
            baseline: 75,
            reason: { code: "endurance_fade", shortSeconds: 30, longSeconds: 60, shortWpm: 75, longWpm: 60, gapWpm: 15 },
        }
        const endurance = targeted({ candidate: enduranceCandidate })
        const measured = measureDailyStepSet(endurance, endurance.steps[2]!, {
            timeline: encodeTimeline([]),
            netWpm: 65,
        })
        expect(endurance.steps[2]?.href).toContain("target=endurance")
        expect(measured?.targetDelta).toMatchObject({ before: 60, after: 65, unit: "wpm", improved: true })
    })

    it("creates tomorrow's cold outcome only from improved Transfer", () => {
        let session = targeted()
        session = recordDailySet(session, session.steps[0]!.id, { netWpm: 70, accuracy: 96, completedAt: 150 })
        for (const after of [420, 410, 405]) session = recordDailySet(session, session.steps[1]!.id, set(after, false))
        session = recordDailySet(session, session.steps[2]!.id, set(350, true))
        expect(yesterdayOutcomeFrom(session)).toEqual({
            label: "b→r", target: recommendation.target, unit: "ms", before: 400, after: 350, minimumChange: 20,
        })
    })

    it("selects a regressed Target before the highest-Impact new Target", () => {
        const regressed: SkillCandidate = {
            ...recommendation,
            id: "key:accuracy:q",
            target: { kind: "key", keys: ["q"], metric: "accuracy" },
            metric: "%",
            direction: "higher",
            observed: 80,
            baseline: 95,
            reason: { code: "key_accuracy_below_threshold", key: "q", accuracyPct: 80, errorRatePct: 20 },
        }
        const session = createDailySession({
            ...context, attempts: new Map(), transitions: slowTransitions,
            recommendation, regressedRecommendation: regressed, now: 100,
        })
        expect(session.prescription?.id).toBe(regressed.id)
    })

    it("translates v2 snapshots without adding steps to an active legacy day", () => {
        const session = targeted()
        const legacy = {
            ...session,
            version: 2,
            prescription: undefined,
            steps: session.steps.slice(0, 2).map((step) => ({
                ...step,
                context: undefined,
                target: step.target?.kind === "transition" ? { kind: "transition", pair: step.target.pair } : step.target,
            })),
        }
        const parsed = parseDailySession(legacy)
        expect(parsed?.version).toBe(3)
        expect(parsed?.steps).toHaveLength(2)
        expect(parsed?.steps[1]?.target).toEqual({ kind: "transition", pair: "br", metric: "latency" })
    })

    it("round-trips scoped storage and prefers the snapshot with more work", () => {
        const store = storage()
        const session = targeted()
        writeLocalDailySession("user-a", session, store)
        expect(readLocalDailySession("user-a", context, store)).toEqual(session)
        expect(readLocalDailySession("guest", context, store)).toBeNull()
        const progressed = recordDailySet(session, session.steps[0]!.id, { netWpm: 60, accuracy: 95, completedAt: 200 })
        const newerEmpty: DailyCoachingSession = { ...session, updatedAt: 300 }
        expect(completedSetCount(progressed)).toBe(1)
        expect(preferDailySession(progressed, newerEmpty)).toBe(progressed)
        clearLocalDailySessions("user-a", store)
        expect(readLocalDailySession("user-a", context, store)).toBeNull()
    })

    it("qualifies warm measures by length, not launch path", () => {
        expect(measureQualifies("baseline", { subMode: "timed", count: 30 })).toBe(true)
        expect(measureQualifies("baseline", { subMode: "words", count: 25 })).toBe(true)
        expect(measureQualifies("calibration", { subMode: "timed", count: 60 })).toBe(true)
        expect(measureQualifies("transfer", { subMode: "timed", count: 60 })).toBe(false)
    })
})
