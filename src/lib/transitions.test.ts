import { describe, expect, it } from "vitest"
import { aggregateTransitions, mergeTransitions, overallTransitionMeanMs, worstTransitions } from "./transitions"
import type { KeystrokeEvent } from "./keystrokes"

// Build a timeline from (key, gap-since-previous, correct?) tuples.
function events(pairs: [string, number, boolean?][]): KeystrokeEvent[] {
    let t = 0
    return pairs.map(([key, gap, correct = true], i) => {
        if (i > 0) t += gap
        return { key, correct, t }
    })
}

describe("aggregateTransitions", () => {
    it("sums latency, count, and errors per letter pair", () => {
        // t-h-e-t-h-e : the pair "th" occurs twice, "he" twice, "et" once.
        const evts = events([["t", 0], ["h", 200], ["e", 100], ["t", 150], ["h", 300, false], ["e", 120]])
        const aggs = aggregateTransitions(evts)
        const th = aggs.find((a) => a.pair === "th")!
        expect(th.count).toBe(2)
        expect(th.totalMs).toBe(500) // 200 + 300
        expect(th.errors).toBe(1) // second "h" was wrong
    })

    it("drops non-letter transitions (space, punctuation)", () => {
        const evts = events([["a", 0], [" ", 100], ["b", 100], [".", 100], ["c", 100]])
        expect(aggregateTransitions(evts)).toEqual([])
    })
})

describe("overallTransitionMeanMs", () => {
    it("is total latency over total count", () => {
        const aggs = [
            { pair: "th", count: 2, totalMs: 500, errors: 0 },
            { pair: "he", count: 2, totalMs: 300, errors: 0 },
        ]
        expect(overallTransitionMeanMs(aggs)).toBe(200) // 800 / 4
    })

    it("is zero with no data", () => {
        expect(overallTransitionMeanMs([])).toBe(0)
    })
})

describe("worstTransitions", () => {
    it("flags pairs slower than the overall pace, slowest first", () => {
        const aggs = [
            { pair: "br", count: 10, totalMs: 4000, errors: 2 }, // 400ms mean
            { pair: "th", count: 10, totalMs: 1000, errors: 0 }, // 100ms
            { pair: "he", count: 10, totalMs: 1200, errors: 0 }, // 120ms
            { pair: "io", count: 10, totalMs: 3200, errors: 1 }, // 320ms
        ]
        // overall mean = 9400 / 40 = 235ms; br (1.70×) and io (1.36×) clear 1.3.
        const worst = worstTransitions(aggs)
        expect(worst.map((t) => t.pair)).toEqual(["br", "io"])
        expect(worst[0]!.ratio).toBeCloseTo(400 / 235, 2)
        expect(worst[0]!.errorRate).toBeCloseTo(0.2, 3)
    })

    it("ignores pairs below the recurrence floor", () => {
        const aggs = [
            { pair: "qz", count: 2, totalMs: 4000, errors: 0 }, // very slow but rare
            { pair: "th", count: 20, totalMs: 2000, errors: 0 },
            { pair: "he", count: 20, totalMs: 2000, errors: 0 },
        ]
        expect(worstTransitions(aggs).find((t) => t.pair === "qz")).toBeUndefined()
    })

    it("returns nothing with no data", () => {
        expect(worstTransitions([])).toEqual([])
    })
})

describe("mergeTransitions", () => {
    it("sums aggregates by pair", () => {
        const merged = mergeTransitions(
            [{ pair: "th", count: 2, totalMs: 400, errors: 1 }],
            [{ pair: "th", count: 3, totalMs: 600, errors: 0 }, { pair: "he", count: 1, totalMs: 100, errors: 0 }],
        )
        const th = merged.find((a) => a.pair === "th")!
        expect(th).toMatchObject({ count: 5, totalMs: 1000, errors: 1 })
        expect(merged.find((a) => a.pair === "he")!.count).toBe(1)
    })
})
