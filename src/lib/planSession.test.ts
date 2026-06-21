import { describe, expect, it } from "vitest"
import { generatePlan, type Plan } from "./plan"
import { completeStep, initialSession, nextDay, parseSession, reconcile } from "./planSession"

const benchmark = { subMode: "timed" as const, count: 60 }

// A 30-day targeted plan: each day is [warm-up, keys, transition] (+ benchmark on
// day 7/14/…). Days have 3–4 steps.
const targeted: Plan = generatePlan({
    worstKeys: [
        { key: "r", accuracy: 70, attempts: 100 },
        { key: "t", accuracy: 72, attempts: 100 },
        { key: "b", accuracy: 74, attempts: 100 },
    ],
    worstTransitions: [{ pair: "br", from: "b", to: "r", meanMs: 400, ratio: 2, errorRate: 0.1, count: 10 }],
    benchmark,
    historyDays: 30,
})

describe("planSession reducer", () => {
    it("starts at day 1, step 0, active", () => {
        expect(initialSession()).toEqual({ day: 1, stepIndex: 0, status: "active" })
    })

    it("completeStep advances through a day's steps, then marks the day done", () => {
        const steps = targeted.days[0]!.steps.length
        let s = initialSession()
        for (let i = 1; i < steps; i++) {
            s = completeStep(s, targeted)
            expect(s).toEqual({ day: 1, stepIndex: i, status: "active" })
        }
        s = completeStep(s, targeted)
        expect(s).toEqual({ day: 1, stepIndex: steps - 1, status: "day-done" })
    })

    it("completeStep is a no-op once the day is done", () => {
        const done = { day: 1, stepIndex: 2, status: "day-done" as const }
        expect(completeStep(done, targeted)).toBe(done)
    })

    it("nextDay moves to the next day at step 0, active", () => {
        const done = { day: 1, stepIndex: 2, status: "day-done" as const }
        expect(nextDay(done, targeted)).toEqual({ day: 2, stepIndex: 0, status: "active" })
    })

    it("nextDay after the final day completes the plan", () => {
        const last = targeted.days.length
        expect(nextDay({ day: last, stepIndex: 0, status: "day-done" }, targeted)).toEqual({ day: last, stepIndex: 0, status: "plan-done" })
    })

    it("reconcile clamps an out-of-range stored session to the plan", () => {
        // A session pointing past the plan (e.g. plan shrank to calibration).
        const calibration = generatePlan({ worstKeys: [], worstTransitions: [], benchmark, historyDays: 1 })
        const out = reconcile({ day: 99, stepIndex: 99, status: "active" }, calibration)
        expect(out.day).toBe(calibration.days.length)
        expect(out.stepIndex).toBeLessThan(calibration.days[out.day - 1]!.steps.length)
        expect(out.stepIndex).toBeGreaterThanOrEqual(0)
    })

    it("parseSession accepts valid shapes and rejects junk", () => {
        expect(parseSession(JSON.stringify({ day: 3, stepIndex: 1, status: "active" }))).toEqual({ day: 3, stepIndex: 1, status: "active" })
        expect(parseSession(null)).toBeNull()
        expect(parseSession("not json")).toBeNull()
        expect(parseSession(JSON.stringify({ day: 3 }))).toBeNull()
        expect(parseSession(JSON.stringify({ day: 3, stepIndex: 1, status: "bogus" }))).toBeNull()
    })
})
