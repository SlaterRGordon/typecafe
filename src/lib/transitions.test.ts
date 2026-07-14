import { describe, expect, it } from "vitest"
import { aggregateTransitions, keySpeedBars, keySpeedFromTransitions, mergeTransitions, overallTransitionMeanMs, worstTransitions, KEY_WPM_NUMERATOR, TRANSITION_SAMPLE_CAP } from "./transitions"
import { HEATMAP_CONFIG } from "./heatmap"
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

    it("tracks space pairs (word boundaries) but drops punctuation/digits", () => {
        // a-space-b-.-c-1-d : "a "/" b" are tracked; "b."/".c"/"c1"/"1d" are not.
        const evts = events([["a", 0], [" ", 100], ["b", 120], [".", 100], ["c", 100], ["1", 100], ["d", 100]])
        const aggs = aggregateTransitions(evts)
        expect(aggs.find((a) => a.pair === "a ")).toMatchObject({ pair: "a ", count: 1, totalMs: 100 })
        expect(aggs.find((a) => a.pair === " b")).toMatchObject({ pair: " b", count: 1, totalMs: 120 })
        expect(aggs.map((a) => a.pair).sort()).toEqual([" b", "a "])
    })

    it("drops letter pairs that cannot be drilled with real transition words", () => {
        const evts = events([["x", 0], ["i", 240], ["b", 120], ["r", 300]])
        const aggs = aggregateTransitions(evts)

        expect(aggs.find((a) => a.pair === "xi")).toBeUndefined()
        expect(aggs.find((a) => a.pair === "br")).toMatchObject({ pair: "br", count: 1, totalMs: 300 })
    })
})

describe("overallTransitionMeanMs", () => {
    it("is total latency over total count", () => {
        const aggs = [
            { pair: "th", count: 2, totalMs: 500, errors: 0 },
            { pair: "he", count: 2, totalMs: 300, errors: 0 },
            { pair: "xi", count: 10, totalMs: 10_000, errors: 0 },
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

    it("ignores stale untrackable pairs even when they are recurring and slow", () => {
        const aggs = [
            { pair: "xi", count: 20, totalMs: 20_000, errors: 0 },
            { pair: "br", count: 10, totalMs: 4000, errors: 0 },
            { pair: "th", count: 10, totalMs: 1000, errors: 0 },
            { pair: "he", count: 10, totalMs: 1200, errors: 0 },
        ]

        expect(worstTransitions(aggs).map((t) => t.pair)).toEqual(["br"])
    })

    it("returns nothing with no data", () => {
        expect(worstTransitions([])).toEqual([])
    })
})

describe("keySpeedFromTransitions", () => {
    it("attributes latency to the key pressed, count-weighted (not mean-of-means)", () => {
        // Two ways to land on 'r': after 'b' (rare, slow) and after 't' (common, fast).
        const aggs = [
            { pair: "br", count: 2, totalMs: 800, errors: 0 },   // 400ms mean, 2 hits
            { pair: "tr", count: 18, totalMs: 1800, errors: 0 }, // 100ms mean, 18 hits
        ]
        const r = keySpeedFromTransitions(aggs).find((k) => k.key === "r")!
        // Correct: 2600ms / 20 = 130ms. Mean-of-means (the bug) would be 250ms.
        expect(r.count).toBe(20)
        expect(r.meanMs).toBe(130)
    })

    it("includes word-initial keys via space→k and surfaces the space bar itself", () => {
        const aggs = [
            { pair: " t", count: 5, totalMs: 1000, errors: 1 }, // word-initial t
            { pair: "th", count: 5, totalMs: 500, errors: 0 },
            { pair: "e ", count: 4, totalMs: 1600, errors: 0 }, // hitting space after 'e'
        ]
        const byKey = new Map(keySpeedFromTransitions(aggs).map((k) => [k.key, k]))
        expect(byKey.get("t")!.meanMs).toBe(200) // 1000 / 5, the word-initial t
        expect(byKey.get("t")!.errorRate).toBeCloseTo(0.2, 3)
        expect(byKey.get(" ")!.meanMs).toBe(400) // space-bar launch rhythm, 1600 / 4
        expect(byKey.get("h")!.count).toBe(5)
    })

    it("returns slowest key first and ignores empty aggregates", () => {
        const aggs = [
            { pair: "th", count: 4, totalMs: 400, errors: 0 }, // h: 100ms
            { pair: "br", count: 4, totalMs: 1200, errors: 0 }, // r: 300ms
            { pair: "he", count: 0, totalMs: 0, errors: 0 },
        ]
        expect(keySpeedFromTransitions(aggs).map((k) => k.key)).toEqual(["r", "h"])
    })
})

describe("keySpeedBars", () => {
    const min = HEATMAP_CONFIG.minSpeedSamples

    it("fills a key at or above the average pace and scales slower keys down", () => {
        // Overall mean is 200ms. r sits at avg (full), h is faster (full/clamped),
        // b is 2x slower (half).
        const aggs = [
            { pair: "tr", count: min, totalMs: 200 * min, errors: 0 }, // r: 200ms == avg
            { pair: "th", count: min, totalMs: 100 * min, errors: 0 }, // h: 100ms, fast
            { pair: "ob", count: min, totalMs: 400 * min, errors: 0 }, // b: 400ms, 2x slow
        ]
        const bars = keySpeedBars(aggs)
        // Average = (200+100+400)/3 weighted = 233ms; r (200) is above avg → full.
        expect(bars.get("r")!.fraction).toBe(1)
        expect(bars.get("h")!.fraction).toBe(1)          // faster than avg, clamped
        expect(bars.get("b")!.fraction).toBeLessThan(1)  // slower than avg, partial
        expect(bars.get("b")!.fraction).toBeGreaterThan(0)
    })

    it("reports effective WPM per key (12000 / meanMs)", () => {
        const aggs = [{ pair: "tr", count: min, totalMs: 240 * min, errors: 0 }] // r: 240ms
        expect(keySpeedBars(aggs).get("r")!.wpm).toBe(Math.round(KEY_WPM_NUMERATOR / 240))
    })

    it("clamps fraction to [0,1] at both extremes", () => {
        const aggs = [
            { pair: "th", count: min, totalMs: 50 * min, errors: 0 },   // very fast
            { pair: "ob", count: min, totalMs: 5000 * min, errors: 0 }, // very slow
        ]
        for (const bar of keySpeedBars(aggs).values()) {
            expect(bar.fraction).toBeGreaterThanOrEqual(0)
            expect(bar.fraction).toBeLessThanOrEqual(1)
        }
    })

    it("omits keys below the sample floor rather than drawing a misleading bar", () => {
        const aggs = [
            { pair: "tr", count: min, totalMs: 200 * min, errors: 0 },
            { pair: "ob", count: min - 1, totalMs: 200 * (min - 1), errors: 0 }, // too thin
        ]
        const bars = keySpeedBars(aggs)
        expect(bars.has("r")).toBe(true)
        expect(bars.has("b")).toBe(false)
    })

    it("is empty with no data (divide-by-zero guard)", () => {
        expect(keySpeedBars([]).size).toBe(0)
    })
})

describe("mergeTransitions", () => {
    it("sums aggregates by pair", () => {
        const merged = mergeTransitions(
            [{ pair: "th", count: 2, totalMs: 400, errors: 1 }, { pair: "xi", count: 8, totalMs: 8000, errors: 0 }],
            [{ pair: "th", count: 3, totalMs: 600, errors: 0 }, { pair: "he", count: 1, totalMs: 100, errors: 0 }],
        )
        const th = merged.find((a) => a.pair === "th")!
        expect(th).toMatchObject({ count: 5, totalMs: 1000, errors: 1 })
        expect(merged.find((a) => a.pair === "he")!.count).toBe(1)
        expect(merged.find((a) => a.pair === "xi")).toBeUndefined()
    })

    it("caps a pair at the rolling window, preserving mean and error rate (ADR-0005)", () => {
        const merged = mergeTransitions(
            [{ pair: "th", count: 180, totalMs: 72000, errors: 18 }], // 400ms mean, 10% errors
            [{ pair: "th", count: 40, totalMs: 16000, errors: 4 }],
        )
        const th = merged.find((a) => a.pair === "th")!
        expect(th.count).toBe(TRANSITION_SAMPLE_CAP)
        // Uncapped sum would be 220 count / 88000ms / 22 errors; the scale
        // factor 200/220 keeps the 400ms mean and 10% error rate intact.
        expect(th.totalMs / th.count).toBeCloseTo(400, 0)
        expect(th.errors / th.count).toBeCloseTo(0.1, 2)
        expect(th.errors).toBeLessThanOrEqual(th.count)
    })

    it("leaves under-cap pairs as exact sums", () => {
        const merged = mergeTransitions(
            [{ pair: "th", count: TRANSITION_SAMPLE_CAP - 10, totalMs: 38000, errors: 2 }],
            [{ pair: "th", count: 10, totalMs: 2000, errors: 1 }],
        )
        expect(merged.find((a) => a.pair === "th")).toMatchObject({
            count: TRANSITION_SAMPLE_CAP, totalMs: 40000, errors: 3,
        })
    })
})
