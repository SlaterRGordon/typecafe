import { describe, expect, it } from "vitest"
import { CALIBRATION_DAYS, PLAN_LENGTH_DAYS, generatePlan, type PlanInput } from "./plan"
import type { KeyAccuracy } from "./stats"
import type { SlowTransition } from "./transitions"

function key(k: string): KeyAccuracy {
    return { key: k, accuracy: 80, attempts: 50 }
}
function transition(from: string, to: string): SlowTransition {
    return { pair: from + to, from, to, meanMs: 300, count: 10, ratio: 1.8, errorRate: 0.1 }
}

const benchmark = { subMode: "timed" as const, count: 60 }

const targetedInput: PlanInput = {
    worstKeys: [key("r"), key("t"), key("b"), key("c"), key("v")],
    worstTransitions: [transition("b", "r"), transition("i", "o")],
    benchmark,
    historyDays: 30,
}

describe("generatePlan — calibration", () => {
    it("returns a calibration week with too little history", () => {
        const plan = generatePlan({ ...targetedInput, historyDays: 3 })
        expect(plan.kind).toBe("calibration")
        expect(plan.days).toHaveLength(CALIBRATION_DAYS)
    })

    it("returns a calibration week when no weaknesses surfaced", () => {
        const plan = generatePlan({ worstKeys: [], worstTransitions: [], benchmark, historyDays: 30 })
        expect(plan.kind).toBe("calibration")
    })

    it("benchmarks on the final calibration day", () => {
        const plan = generatePlan({ ...targetedInput, historyDays: 2 })
        const last = plan.days[plan.days.length - 1]!
        expect(last.isBenchmark).toBe(true)
        expect(last.steps.some((s) => s.kind === "benchmark")).toBe(true)
    })
})

describe("generatePlan — targeted", () => {
    const plan = generatePlan(targetedInput)

    it("is a 30-day targeted plan", () => {
        expect(plan.kind).toBe("targeted")
        expect(plan.days).toHaveLength(PLAN_LENGTH_DAYS)
    })

    it("starts each day with a warm-up and gives two targeted drills", () => {
        const day1 = plan.days[0]!
        expect(day1.steps[0]!.kind).toBe("warmup")
        const drills = day1.steps.filter((s) => s.kind === "keys" || s.kind === "transition")
        expect(drills.length).toBe(2)
        // Warm-up/benchmark hit the home page; targeted drills hit /drill.
        expect(day1.steps[0]!.href.startsWith("/?mode=")).toBe(true)
        expect(drills.every((s) => s.href.startsWith("/drill?"))).toBe(true)
    })

    it("benchmarks weekly in the user's config", () => {
        expect(plan.days[6]!.isBenchmark).toBe(true)
        const bench = plan.days[6]!.steps.find((s) => s.kind === "benchmark")!
        expect(bench.href).toBe("/?mode=timed&count=60")
        expect(plan.days[0]!.isBenchmark).toBe(false)
        expect(plan.days.filter((d) => d.isBenchmark)).toHaveLength(4) // days 7,14,21,28
    })

    it("rotates which keys and transitions it targets across days", () => {
        const keyHref = (day: number) => plan.days[day]!.steps.find((s) => s.kind === "keys")!.href
        const transHref = (day: number) => plan.days[day]!.steps.find((s) => s.kind === "transition")!.href
        // 5 worst keys → chunks [r,t,b] and [c,v]; alternate by day.
        expect(keyHref(0)).toContain("keys=r,t,b")
        expect(keyHref(1)).toContain("keys=c,v")
        // 2 transitions alternate.
        expect(transHref(0)).toContain("transitions=br")
        expect(transHref(1)).toContain("transitions=io")
    })

    it("still fills two drills when only one weakness source exists", () => {
        const keysOnly = generatePlan({ ...targetedInput, worstTransitions: [] })
        const drills = keysOnly.days[0]!.steps.filter((s) => s.kind === "keys")
        expect(drills.length).toBe(2)
    })
})
