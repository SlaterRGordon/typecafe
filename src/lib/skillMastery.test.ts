import { describe, expect, it } from "vitest"
import {
    createDailySession,
    recordDailySet,
    type DailyCoachingSession,
    type YesterdayOutcome,
} from "./dailyCoaching"
import type { TimelineEvidence } from "./evidenceNormalization"
import { encodeTimeline, type TestEvidenceEvent } from "./keystrokes"
import { analyzeTypingEvidence, deriveMastery, type SkillCandidate } from "./skillEvidence"

const candidate: SkillCandidate = {
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

const otherCandidate: SkillCandidate = {
    ...candidate,
    id: "transition:latency:io",
    target: { kind: "transition", pair: "io", metric: "latency" },
    impactMsPer1000: 1_000,
    reason: { code: "transition_latency_above_baseline", pair: "io", observedMs: 400, baselineMs: 150, ratio: 400 / 150 },
}

const delta = (after: number, improved = after <= 380) => ({
    netWpm: 70,
    accuracy: 98,
    targetSamples: 8,
    targetDelta: { label: "b→r", before: 400, after, unit: "ms" as const, improved },
})

function sessionFor(dateKey: string, recommendation: SkillCandidate = candidate, yesterday?: YesterdayOutcome): DailyCoachingSession {
    return createDailySession({
        dateKey,
        pool: "qwerty",
        language: "english",
        attempts: new Map(),
        transitions: [],
        recommendation,
        yesterday,
        now: Date.parse(`${dateKey}T12:00:00Z`),
    })
}

function transferred(dateKey: string, recommendation: SkillCandidate = candidate): DailyCoachingSession {
    let session = sessionFor(dateKey, recommendation)
    session = recordDailySet(session, session.steps[0]!.id, { netWpm: 65, accuracy: 97 })
    session = recordDailySet(session, session.steps[1]!.id, delta(370))
    session = recordDailySet(session, session.steps[1]!.id, delta(360))
    return recordDailySet(session, session.steps[2]!.id, delta(350))
}

function checked(dateKey: string, after: number, source = candidate): DailyCoachingSession {
    const yesterday: YesterdayOutcome = {
        label: "b→r",
        target: source.target,
        unit: "ms",
        before: source.observed,
        after: 350,
        minimumChange: 20,
    }
    const session = sessionFor(dateKey, otherCandidate, yesterday)
    return recordDailySet(session, session.steps[0]!.id, delta(after, after <= 380))
}

function practiced(dateKey: string): DailyCoachingSession {
    let session = createDailySession({
        dateKey,
        pool: "qwerty",
        language: "english",
        attempts: new Map(),
        transitions: [],
        now: Date.parse(`${dateKey}T12:00:00Z`),
    })
    session = recordDailySet(session, session.steps[0]!.id, { netWpm: 65, accuracy: 97 })
    return session
}

function naturalWeakness(testId: number): TimelineEvidence {
    const events: TestEvidenceEvent[] = []
    let t = 0
    for (let repeat = 0; repeat < 40; repeat += 1) {
        for (const [pair, gap] of [["th", 100], ["br", 400]] as const) {
            t += 100
            events.push({ key: pair[0]!, typed: pair[0]!, correct: true, t })
            t += gap
            events.push({ key: pair[1]!, typed: pair[1]!, correct: true, t })
            t += 100
            events.push({ key: " ", typed: " ", correct: true, t })
        }
    }
    return {
        completedAt: Date.parse(`2026-07-${String(10 + testId).padStart(2, "0")}T12:00:00Z`),
        context: "natural",
        mode: 0,
        subMode: 0,
        count: 60,
        options: "",
        punctuation: false,
        capitals: false,
        numbers: false,
        layout: "qwerty",
        pool: "qwerty",
        language: "english",
        timeline: encodeTimeline(events),
    }
}

function analyze(sessions: DailyCoachingSession[], todayDateKey: string, timelines: TimelineEvidence[] = []) {
    const current = analyzeTypingEvidence({ timelines })
    const history = deriveMastery(
        sessions.filter((session) => session.language === "english" && session.pool === "qwerty"),
        current.candidates,
        todayDateKey,
    )
    return { ...current, ...history }
}

describe("Mastery derivation", () => {
    it("requires delayed qualified evidence before retained state", () => {
        const dayOne = transferred("2026-07-01")
        expect(analyze([dayOne], "2026-07-01").mastery[0]?.state).toBe("transferred")
        expect(analyze([dayOne], "2026-07-02").recap.due?.target).toEqual(candidate.target)

        const sameDayCold = { ...checked("2026-07-02", 350), dateKey: "2026-07-01" }
        expect(analyze([dayOne, sameDayCold], "2026-07-01").mastery[0]?.state).not.toBe("retained")

        const held = checked("2026-07-02", 350)
        expect(analyze([dayOne, held], "2026-07-03").mastery.find((record) => record.target.kind === "transition" && record.target.pair === "br")).toMatchObject({
            state: "retained",
            heldColdChecks: 1,
            practicedDaysUntilDue: 2,
            proof: { heldCold: true, cold: 350 },
        })
    })

    it("uses practiced days for 3-day and 7-day checks, so vacations do not accrue debt", () => {
        const first = transferred("2026-07-01")
        const firstHeld = checked("2026-07-02", 350)
        expect(analyze([first, firstHeld], "2026-08-20").recap.due).toBeNull()

        const beforeSecond = [first, firstHeld, practiced("2026-07-03"), practiced("2026-07-04")]
        expect(analyze(beforeSecond, "2026-07-05").recap.due?.target).toEqual(candidate.target)

        const secondHeld = checked("2026-07-05", 340)
        const sixPracticeDays = [6, 7, 8, 9, 10, 11].map((day) => practiced(`2026-07-${String(day).padStart(2, "0")}`))
        const twiceHeld = analyze([...beforeSecond, secondHeld, ...sixPracticeDays], "2026-07-12")
            .mastery.find((record) => record.target.kind === "transition" && record.target.pair === "br")
        expect(twiceHeld).toMatchObject({ state: "due", heldColdChecks: 2, practicedDaysUntilDue: 0 })
    })

    it("re-ranks a missed Cold check and qualifying natural regression", () => {
        const first = transferred("2026-07-01")
        const missed = checked("2026-07-02", 395)
        expect(analyze([first, missed], "2026-07-03").recap.regressed).toMatchObject({
            target: candidate.target,
            state: "regressed",
            proof: { heldCold: false, cold: 395 },
        })

        const held = checked("2026-07-02", 350)
        const natural = analyze([first, held], "2026-07-03", [naturalWeakness(1), naturalWeakness(2)])
        expect(natural.candidates.some((item) => item.id === candidate.id)).toBe(true)
        expect(natural.recap.regressed?.target).toEqual(candidate.target)
    })

    it("keeps repeated episodes and ignores other language or layout pools", () => {
        const first = transferred("2026-07-01")
        const missed = checked("2026-07-02", 395)
        const repeated = transferred("2026-07-03")
        const foreign = {
            ...transferred("2026-07-04"),
            id: "foreign",
            language: "french",
            pool: "colemak",
        }
        const result = analyze([first, missed, repeated, foreign], "2026-07-04")
        const targetEpisodes = result.mastery.filter((record) => recordTarget(record) === "br")

        expect(targetEpisodes).toHaveLength(2)
        expect(targetEpisodes.map((record) => record.state)).toEqual(["due", "regressed"])
        expect(result.mastery.some((record) => record.id.startsWith("foreign"))).toBe(false)
    })
})

function recordTarget(record: { target: SkillCandidate["target"] }): string | null {
    return record.target.kind === "transition" ? record.target.pair : null
}
