import { describe, expect, it } from "vitest"
import {
    aggregateKeyLatency,
    decodeEvidenceTimeline,
    decodeTimeline,
    encodeTimeline,
    keyLatencies,
    overallMeanLatency,
    timelineDurationMs,
    type EncodedTimelineV1,
    type KeystrokeEvent,
    type TestEvidenceEvent,
} from "./keystrokes"

// Build events from (key, gap-since-previous) pairs; the first gap is ignored.
function events(pairs: [string, number][], startAt = 1_000_000): KeystrokeEvent[] {
    let t = startAt
    return pairs.map(([key, gap], i) => {
        if (i > 0) t += gap
        return { key, typed: key, correct: true, t }
    })
}

describe("timelineDurationMs", () => {
    it("sums inter-key gaps for v2", () => {
        expect(timelineDurationMs(encodeTimeline(events([["a", 0], ["b", 120], ["c", 80]])))).toBe(200)
    })

    it("keeps v1 duration behavior and clamps impossible negative gaps", () => {
        const legacy: EncodedTimelineV1 = [[97, 1, 50], [98, 1, -30], [99, 1, 20]]
        expect(timelineDurationMs(legacy)).toBe(70)
    })

    it("is 0 for an empty or single-keystroke timeline", () => {
        expect(timelineDurationMs([])).toBe(0)
        expect(timelineDurationMs(encodeTimeline(events([["a", 0]])))).toBe(0)
    })
})

describe("encodeTimeline / decodeTimeline", () => {
    it("writes v2 and keeps correct attempts compact", () => {
        expect(encodeTimeline([{ key: "a", typed: "a", correct: true, t: 5000 }])).toEqual({
            v: 2,
            events: [[97, 0, 1, 0]],
        })
    })

    it("stores only incorrect actual characters and gaps", () => {
        const encoded = encodeTimeline([
            { key: "a", typed: "a", correct: true, t: 1000 },
            { key: "b", typed: "x", correct: false, t: 1120 },
            { key: "c", typed: "c", correct: true, t: 1300 },
        ])
        expect(encoded).toEqual({
            v: 2,
            events: [[97, 0, 1, 0], [98, 120, 0, 120], [99, 0, 1, 180]],
        })
    })

    it("round-trips expected, typed, correctness, and inter-key gaps", () => {
        const original: TestEvidenceEvent[] = [
            { key: "t", typed: "t", correct: true, t: 2000 },
            { key: "h", typed: "h", correct: true, t: 2090 },
            { key: "e", typed: "é", correct: false, t: 2400 },
        ]
        expect(decodeTimeline(encodeTimeline(original))).toEqual([
            { key: "t", typed: "t", correct: true, t: 0 },
            { key: "h", typed: "h", correct: true, t: 90 },
            { key: "e", typed: "é", correct: false, t: 400 },
        ])
    })

    it("uses Unicode code points rather than splitting surrogate pairs", () => {
        const encoded = encodeTimeline([{ key: "é", typed: "😀", correct: false, t: 10 }])
        expect(encoded.events[0]).toEqual([233, 0x1f600, 0, 0])
        expect(decodeTimeline(encoded)[0]).toMatchObject({ key: "é", typed: "😀" })
    })

    it("persists backspaces for replay while hiding them from forward analytics", () => {
        const encoded = encodeTimeline([
            { key: "a", typed: "x", correct: false, t: 1000 },
            { action: "backspace", t: 1100 },
            { key: "a", typed: "a", correct: true, t: 1250 },
        ])

        expect(encoded).toEqual({ v: 2, events: [[97, 120, 0, 0], [0, 0, 2, 100], [97, 0, 1, 150]] })
        expect(decodeEvidenceTimeline(encoded)).toEqual([
            { key: "a", typed: "x", correct: false, t: 0 },
            { action: "backspace", t: 100 },
            { key: "a", typed: "a", correct: true, t: 250 },
        ])
        expect(decodeTimeline(encoded).map((event) => event.key)).toEqual(["a", "a"])
    })

    it("decodes legacy incorrect characters as unknown without changing expected text", () => {
        const legacy: EncodedTimelineV1 = [[97, 0, 0], [8, 2, 100], [97, 1, 150]]
        expect(decodeEvidenceTimeline(legacy)).toEqual([
            { key: "a", typed: null, correct: false, t: 0 },
            { action: "backspace", t: 100 },
            { key: "a", typed: "a", correct: true, t: 250 },
        ])
    })

    it("clamps backwards clocks and rejects an unrepresentable missing typed character", () => {
        const encoded = encodeTimeline([
            { key: "a", typed: "a", correct: true, t: 1000 },
            { key: "b", typed: "b", correct: true, t: 900 },
        ])
        expect(encoded.events[1]![3]).toBe(0)
        expect(() => encodeTimeline([{ key: "a", typed: null, correct: false, t: 0 }])).toThrow()
    })

    it("handles empty v1 and v2 timelines", () => {
        expect(encodeTimeline([])).toEqual({ v: 2, events: [] })
        expect(decodeTimeline([])).toEqual([])
        expect(decodeTimeline({ v: 2, events: [] })).toEqual([])
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
        expect(result.map((key) => key.key)).toEqual(["x", "z", "y"])
        expect(result[0]).toEqual({ key: "x", meanMs: 500, samples: 1 })
    })

    it("filters out keys below the sample threshold", () => {
        const result = keyLatencies(events([["a", 0], ["r", 400], ["r", 400], ["s", 50]]), 2)
        expect(result.map((key) => key.key)).toEqual(["r"])
    })
})
