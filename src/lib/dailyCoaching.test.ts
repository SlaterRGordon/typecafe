import { describe, expect, it } from "vitest"
import {
    clearLocalDailySessions,
    coldCheck,
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
    writeLocalDailySession,
    yesterdayOutcomeFrom,
    type DailyCoachingSession,
    type YesterdayOutcome,
} from "./dailyCoaching"
import type { TransitionAggregate } from "./transitions"

const context = { dateKey: "2026-07-11", pool: "qwerty", language: "english" }

// r→t is 400ms vs th 150ms - a stable slow transition finding.
const slowTransitions: TransitionAggregate[] = [
    { pair: "rt", count: 12, totalMs: 4800, errors: 1 },
    { pair: "th", count: 12, totalMs: 1800, errors: 0 },
]

const improvedSet = (after: number) => ({
    netWpm: 70,
    accuracy: 96,
    completedAt: 200,
    targetDelta: { label: "r→t", before: 400, after, unit: "ms" as const, improved: after < 400 },
})

function targeted(yesterday?: YesterdayOutcome) {
    return createDailySession({ ...context, attempts: new Map(), transitions: slowTransitions, yesterday, now: 100 })
}

function storage(): Storage {
    const values = new Map<string, string>()
    return {
        get length() { return values.size },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        removeItem: (key) => { values.delete(key) },
        setItem: (key, value) => { values.set(key, value) },
    }
}

describe("daily coaching session", () => {
    it("computes local date keys and midnight rollover", () => {
        expect(msUntilNextLocalDate(new Date(2026, 6, 11, 23, 59, 30))).toBe(30_000)
        expect(previousDateKey("2026-07-01")).toBe("2026-06-30")
        expect(localDateKey(new Date(2026, 0, 2))).toBe("2026-01-02")
    })

    it("prescribes a single calibration Test when evidence is thin", () => {
        const session = createDailySession({ ...context, attempts: new Map(), transitions: [], now: 100 })
        expect(session.kind).toBe("calibration")
        expect(session.steps).toHaveLength(1)
        expect(session.steps[0]?.kind).toBe("calibration")
        expect(session.steps[0]?.context).toBe("diagnostic")
        expect(session.steps[0]?.href).toBe("/?mode=timed&count=60")
    })

    it("prescribes warm-up plus focus sets for a stable slow transition", () => {
        const session = targeted()
        expect(session.kind).toBe("targeted")
        expect(session.reason).toContain("r→t")
        expect(session.steps.map((step) => step.kind)).toEqual(["baseline", "focus"])
        expect(session.steps.map((step) => step.context)).toEqual(["natural", "acquisition"])
        expect(session.steps[0]?.href).toBe("/?mode=timed&count=30")
        expect(session.steps[1]?.target).toEqual({ kind: "transition", pair: "rt" })
    })

    it("adds a worst-two-keys step after a transition focus", () => {
        const attempts = new Map([
            ["q", { attempts: 12, correct: 8 }], // 66.7% - worst
            ["z", { attempts: 10, correct: 8 }], // 80% - second worst
            ["p", { attempts: 10, correct: 9 }], // 90% - third, cut by the two-key cap
            ["e", { attempts: 40, correct: 40 }], // perfect - never a target
        ])
        const session = createDailySession({ ...context, attempts, transitions: slowTransitions, now: 100 })
        expect(session.steps.map((step) => step.kind)).toEqual(["baseline", "focus", "focus"])
        expect(session.steps[1]?.target).toEqual({ kind: "transition", pair: "rt" })
        expect(session.steps[2]?.target).toEqual({ kind: "keys", keys: ["q", "z"] })
        expect(session.steps[2]?.href).toBe("/drill?keys=q,z&length=30")

        // Both focus steps must finish before the day completes; the headline
        // proof still comes from the primary (transition) focus.
        let run = recordDailySet(session, session.steps[0]!.id, { netWpm: 70, accuracy: 96, completedAt: 200 })
        run = recordDailySet(run, run.steps[1]!.id, improvedSet(320))
        run = recordDailySet(run, run.steps[1]!.id, improvedSet(310))
        expect(run.status).toBe("active")
        expect(run.currentStepIndex).toBe(2)
        const keysSet = {
            netWpm: 60, accuracy: 92, completedAt: 300,
            targetDelta: { label: "q z", before: 72, after: 90, unit: "%" as const, improved: true },
        }
        run = recordDailySet(run, run.steps[2]!.id, keysSet)
        run = recordDailySet(run, run.steps[2]!.id, { ...keysSet, completedAt: 310 })
        expect(run.status).toBe("completed")
        expect(focusProof(run)?.label).toBe("r→t")
    })

    it("keeps a keys-only day to a single focus step", () => {
        const attempts = new Map([
            ["q", { attempts: 12, correct: 8 }],
            ["z", { attempts: 10, correct: 8 }],
        ])
        const session = createDailySession({ ...context, attempts, transitions: [], now: 100 })
        expect(session.steps.filter((step) => step.kind === "focus")).toHaveLength(1)
    })

    it("qualifies measures by length, not launch path", () => {
        expect(measureQualifies("baseline", { subMode: "timed", count: 30 })).toBe(true)
        expect(measureQualifies("baseline", { subMode: "timed", count: 15 })).toBe(false)
        expect(measureQualifies("baseline", { subMode: "words", count: 25 })).toBe(true)
        expect(measureQualifies("calibration", { subMode: "timed", count: 60 })).toBe(true)
        expect(measureQualifies("calibration", { subMode: "timed", count: 30 })).toBe(false)
        expect(measureQualifies("focus", { subMode: "timed", count: 60 })).toBe(false)
    })

    it("records only the active step and completes the baseline in one set", () => {
        const session = targeted()
        const ignored = recordDailySet(session, session.steps[1]!.id, { netWpm: 70, accuracy: 96, completedAt: 200 })
        expect(ignored).toBe(session)

        const next = recordDailySet(session, session.steps[0]!.id, { netWpm: 70, accuracy: 96, completedAt: 200 })
        expect(next.currentStepIndex).toBe(1)
        expect(next.steps[0]?.sets).toHaveLength(1)
    })

    it("ends the focus step at two improved sets", () => {
        let session = targeted()
        session = recordDailySet(session, session.steps[0]!.id, { netWpm: 70, accuracy: 96, completedAt: 200 })
        const focusId = session.steps[1]!.id
        session = recordDailySet(session, focusId, improvedSet(320))
        expect(session.status).toBe("active")
        session = recordDailySet(session, focusId, improvedSet(310))
        expect(session.status).toBe("completed")
        expect(focusProof(session)?.after).toBe(310)
    })

    it("caps an unimproving focus step at three sets", () => {
        let session = targeted()
        session = recordDailySet(session, session.steps[0]!.id, { netWpm: 70, accuracy: 96, completedAt: 200 })
        const focusId = session.steps[1]!.id
        for (const after of [420, 430, 410]) session = recordDailySet(session, focusId, improvedSet(after))
        expect(session.status).toBe("completed")
        // Best set is still slower than the 400ms baseline - never claim a win.
        expect(focusProof(session)?.improved).toBe(false)
    })

    it("summarizes a finished day for tomorrow and cold-checks a continued target", () => {
        let session = targeted()
        session = recordDailySet(session, session.steps[0]!.id, { netWpm: 70, accuracy: 96, completedAt: 200 })
        const focusId = session.steps[1]!.id
        session = recordDailySet(session, focusId, improvedSet(320))
        session = recordDailySet(session, focusId, improvedSet(310))

        const yesterday = yesterdayOutcomeFrom(session)
        expect(yesterday).toEqual({ label: "r→t", target: { kind: "transition", pair: "rt" }, unit: "ms", before: 400, after: 310 })

        // Same target still worst → no recheck step; first focus set is the cold check.
        let today = targeted(yesterday!)
        expect(today.steps.map((step) => step.kind)).toEqual(["baseline", "focus"])
        expect(today.reason).toContain("did it stick")
        today = recordDailySet(today, today.steps[0]!.id, { netWpm: 70, accuracy: 96, completedAt: 300 })
        today = recordDailySet(today, today.steps[1]!.id, improvedSet(350))
        expect(coldCheck(today)).toMatchObject({ value: 350, held: true })
    })

    it("adds a cold-check step when yesterday's target moved on", () => {
        const yesterday: YesterdayOutcome = {
            label: "q z", target: { kind: "keys", keys: ["q", "z"] }, unit: "%", before: 82, after: 91,
        }
        let session = targeted(yesterday)
        expect(session.steps.map((step) => step.kind)).toEqual(["baseline", "recheck", "focus"])
        expect(session.steps.map((step) => step.context)).toEqual(["natural", "cold", "acquisition"])
        expect(session.steps[1]?.target).toEqual(yesterday.target)

        session = recordDailySet(session, session.steps[0]!.id, { netWpm: 70, accuracy: 96, completedAt: 300 })
        session = recordDailySet(session, session.steps[1]!.id, {
            netWpm: 70, accuracy: 96, completedAt: 310,
            targetDelta: { label: "q z", before: 91, after: 79, unit: "%", improved: false },
        })
        // 79% is below yesterday's 82% starting point - the gain slipped.
        expect(coldCheck(session)).toMatchObject({ value: 79, held: false })
    })

    it("round-trips storage per scope and never leaks across scopes", () => {
        const store = storage()
        const session = targeted()
        writeLocalDailySession("user-a", session, store)
        expect(readLocalDailySession("user-a", context, store)).toEqual(session)
        expect(readLocalDailySession("guest", context, store)).toBeNull()
        clearLocalDailySessions("user-a", store)
        expect(readLocalDailySession("user-a", context, store)).toBeNull()
    })

    it("rejects corrupt and oversized snapshots", () => {
        const session = targeted()
        expect(parseDailySession(session)).toEqual(session)
        expect(parseDailySession({ ...session, status: "completed" })).toBeNull()
        expect(parseDailySession({ ...session, reason: "x".repeat(500) })).toBeNull()
        const bloated = { ...session, steps: Array.from({ length: 12 }, () => session.steps[0]) }
        expect(parseDailySession(bloated)).toBeNull()
    })

    it("normalizes known legacy steps while rejecting a corrupt stored context", () => {
        const session = targeted()
        const legacy = {
            ...session,
            steps: session.steps.map(({ context: _context, ...step }) => step),
        }
        expect(parseDailySession(legacy)?.steps.map((step) => step.context)).toEqual(["natural", "acquisition"])
        expect(parseDailySession({
            ...session,
            steps: session.steps.map((step, index) => index === 0 ? { ...step, context: "unknown" } : step),
        })).toBeNull()
    })

    it("prefers the snapshot with more completed work over a newer empty copy", () => {
        const base = targeted()
        const progressed = recordDailySet(base, base.steps[0]!.id, { netWpm: 60, accuracy: 95, completedAt: 200 })
        const newerEmpty: DailyCoachingSession = { ...base, updatedAt: 300 }
        expect(completedSetCount(progressed)).toBe(1)
        expect(preferDailySession(progressed, newerEmpty)).toBe(progressed)
    })
})
