import { describe, expect, it } from "vitest"
import {
    aggregateKeyLatency,
    decodeTimeline,
    encodeTimeline,
    keyLatencies,
    overallMeanLatency,
    type KeystrokeEvent,
} from "./keystrokes"

// Build events from (key, gap-since-previous) pairs; the first gap is ignored.
function events(pairs: [string, number][], startAt = 1_000_000): KeystrokeEvent[] {
    let t = startAt
    return pairs.map(([key, gap], i) => {
        if (i > 0) t += gap
        return { key, correct: true, t }
    })
}

describe("encodeTimeline / decodeTimeline", () => {
    it("encodes the first keystroke with a zero delta", () => {
        const encoded = encodeTimeline([{ key: "a", correct: true, t: 5000 }])
        expect(encoded).toEqual([[97, 1, 0]])
    })

    it("stores gaps as deltas, not absolute times", () => {
        const encoded = encodeTimeline([
            { key: "a", correct: true, t: 1000 },
            { key: "b", correct: false, t: 1120 },
            { key: "c", correct: true, t: 1300 },
        ])
        expect(encoded).toEqual([
            [97, 1, 0],
            [98, 0, 120],
            [99, 1, 180],
        ])
    })

    it("round-trips correctness and inter-key gaps losslessly", () => {
        const original = [
            { key: "t", correct: true, t: 2000 },
            { key: "h", correct: true, t: 2090 },
            { key: "e", correct: false, t: 2400 },
        ]
        const decoded = decodeTimeline(encodeTimeline(original))
        expect(decoded.map((e) => e.key)).toEqual(["t", "h", "e"])
        expect(decoded.map((e) => e.correct)).toEqual([true, true, false])
        // Gaps preserved (absolute base resets to 0).
        expect(decoded.map((e) => e.t)).toEqual([0, 90, 400])
    })

    it("clamps negative gaps to zero", () => {
        const encoded = encodeTimeline([
            { key: "a", correct: true, t: 1000 },
            { key: "b", correct: true, t: 900 }, // clock went backwards
        ])
        expect(encoded[1]![2]).toBe(0)
    })

    it("handles an empty timeline", () => {
        expect(encodeTimeline([])).toEqual([])
        expect(decodeTimeline([])).toEqual([])
    })
})

describe("aggregateKeyLatency", () => {
    it("excludes the first keystroke (it has no predecessor latency)", () => {
        const map = aggregateKeyLatency(events([["a", 0], ["b", 100]]))
        expect(map.has("a")).toBe(false)
        expect(map.get("b")).toEqual({ totalMs: 100, samples: 1 })
    })

    it("sums latency per repeated key", () => {
        const map = aggregateKeyLatency(events([["a", 0], ["e", 100], ["a", 200], ["e", 300]]))
        expect(map.get("e")).toEqual({ totalMs: 400, samples: 2 })
        expect(map.get("a")).toEqual({ totalMs: 200, samples: 1 })
    })

    it("returns an empty map for 0 or 1 keystrokes", () => {
        expect(aggregateKeyLatency([]).size).toBe(0)
        expect(aggregateKeyLatency(events([["a", 0]])).size).toBe(0)
    })
})

describe("overallMeanLatency", () => {
    it("averages every measured gap", () => {
        // gaps: 100, 200, 300 -> mean 200
        expect(overallMeanLatency(events([["a", 0], ["b", 100], ["c", 200], ["d", 300]]))).toBe(200)
    })

    it("is 0 when nothing is measurable", () => {
        expect(overallMeanLatency([])).toBe(0)
        expect(overallMeanLatency(events([["a", 0]]))).toBe(0)
    })
})

describe("keyLatencies", () => {
    it("lists keys slowest first", () => {
        const result = keyLatencies(events([["a", 0], ["x", 500], ["y", 100], ["z", 300]]))
        expect(result.map((k) => k.key)).toEqual(["x", "z", "y"])
        expect(result[0]).toEqual({ key: "x", meanMs: 500, samples: 1 })
    })

    it("filters out keys below the sample threshold", () => {
        const result = keyLatencies(events([["a", 0], ["r", 400], ["r", 400], ["s", 50]]), 2)
        expect(result.map((k) => k.key)).toEqual(["r"])
    })
})
