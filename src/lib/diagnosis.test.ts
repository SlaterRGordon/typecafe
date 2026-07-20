import { describe, expect, it } from "vitest"
import {
    MIN_KEYSTROKES_TO_DIAGNOSE,
    costliestTransitions,
    diagnose,
    estimateWpmCost,
    keyLabel,
    slowestKeys,
    toDrillKeys,
    toughestWords,
    withPracticeVowel,
} from "./diagnosis"
import type { KeystrokeEvent } from "./keystrokes"

// Build events from (key, gap-since-previous, correct?) tuples; the first gap is
// ignored (no predecessor). Mirrors the helper in keystrokes.test.ts.
function events(pairs: [string, number, boolean?][], startAt = 1_000_000): KeystrokeEvent[] {
    let t = startAt
    return pairs.map(([key, gap, correct = true], i) => {
        if (i > 0) t += gap
        return { key, typed: correct ? key : "?", correct, t }
    })
}

// A steady stream of `count` correct keystrokes of `key`, each `gap` ms apart.
function steady(key: string, count: number, gap: number, startAt = 1_000_000): KeystrokeEvent[] {
    return Array.from({ length: count }, (_, i) => ({ key, typed: key, correct: true, t: startAt + i * gap }))
}


describe("keyLabel", () => {
    it("names the space bar", () => {
        expect(keyLabel(" ")).toBe("space")
        expect(keyLabel("r")).toBe("r")
    })
})

describe("toDrillKeys", () => {
    it("keeps letters (capitals folded), digits and marks, de-duplicated, order preserved", () => {
        expect(toDrillKeys(["R", "t", "r", " ", ".", "B"])).toEqual(["r", "t", ".", "b"])
    })

    it("keeps the shifted drill marks and digits, drops space and non-drill glyphs", () => {
        expect(toDrillKeys([":", "?", "!", "5", " ", "'", "/", "th"])).toEqual([":", "?", "!", "5"])
    })
})

describe("symbol latency", () => {
    it("surfaces a slow punctuation key as a finding and a drill target", () => {
        // A steady 'a' rhythm at 100ms with a slow ':' (300ms) spliced in - the
        // colon must be diagnosed and kept drillable, not stripped as a non-letter.
        const evts = [
            ...steady("a", 25, 100),
            ...events([[":", 300], ["a", 100], [":", 300], ["a", 100], [":", 300], ["a", 100]], 1_002_500),
        ]
        const result = diagnose({ events: evts, baselineMeanMs: 100 })

        const slow = result.findings.find((f) => f.kind === "slow-keys")
        expect(slow?.keys).toContain(":")
        expect(result.drillKeys).toContain(":")
    })
})

describe("withPracticeVowel", () => {
    it("appends a vowel when the drill keys are all consonants", () => {
        // Practice text needs a vowel to form words; an all-consonant set froze it.
        expect(withPracticeVowel(["r", "t", "b"])).toEqual(["r", "t", "b", "e"])
    })

    it("leaves a set that already has a vowel untouched", () => {
        expect(withPracticeVowel(["r", "a", "t"])).toEqual(["r", "a", "t"])
    })

    it("leaves an empty set untouched", () => {
        expect(withPracticeVowel([])).toEqual([])
    })
})

describe("toughestWords", () => {
    it("ranks error words first, then the slowest, and rebuilds the intended word", () => {
        // "cat" typed cleanly at baseline, "dog" with a wrong keystroke, "fly" slow.
        const evts = events([
            ["c", 100], ["a", 100], ["t", 100], [" ", 100],
            ["d", 100], ["o", 100], ["g", 100, false], [" ", 100],
            ["f", 300], ["l", 300], ["y", 300], [" ", 100],
        ])
        const tough = toughestWords(evts, 100)
        // "cat" is clean and on-pace → excluded; error word leads, slow word follows.
        expect(tough.map((w) => w.word)).toEqual(["dog", "fly"])
        expect(tough[0]!.errors).toBe(1)
    })

    it("skips single-character runs as noise", () => {
        const evts = events([["a", 100], [" ", 100], ["b", 100, false]])
        expect(toughestWords(evts, 100)).toEqual([])
    })

    it("excludes a fast, accurate word fragment left incomplete at Test end", () => {
        const evts = events([
            ["c", 100], ["a", 100], ["t", 100], [" ", 100],
            ["p", 100], ["a", 100],
        ])

        expect(toughestWords(evts, 50)).toEqual([])
    })

    it("excludes an inaccurate word fragment left incomplete at Test end", () => {
        const evts = events([
            ["c", 100], ["a", 100], ["t", 100], [" ", 100],
            ["p", 100], ["a", 100, false],
        ])

        expect(toughestWords(evts, 100)).toEqual([])
    })

    it("keeps completed evidence for a weak word when a later attempt is partial", () => {
        const evts = events([
            ["p", 100], ["a", 100], ["p", 100], ["e", 100], ["r", 100, false], [" ", 100],
            ["p", 100], ["a", 100],
        ])

        expect(toughestWords(evts, 100).map((word) => word.word)).toEqual(["paper"])
    })
})

describe("slowestKeys", () => {
    it("flags keys at or above 1.5x the baseline with enough samples", () => {
        // Baseline rhythm 100ms; 'r' lands at 300ms three times (3x baseline).
        const evts = [
            ...steady("a", 6, 100),
            ...events([["r", 300], ["a", 100], ["r", 300], ["a", 100], ["r", 300]], 1_000_600),
        ]
        const slow = slowestKeys(evts, 100)
        expect(slow.map((k) => k.key)).toContain("r")
        const r = slow.find((k) => k.key === "r")!
        expect(r.samples).toBe(3)
        // First 'r' inherits the preceding steady-'a' gap (100ms); the other two
        // land at 300ms - mean 233ms, i.e. ~2.3x the 100ms baseline.
        expect(r.meanMs).toBeCloseTo(700 / 3, 5)
        expect(r.ratio).toBeGreaterThanOrEqual(2)
    })

    it("ignores keys below the sample threshold", () => {
        // 'z' is very slow but only typed twice (< SLOW_KEY_MIN_SAMPLES).
        const evts = [...steady("a", 8, 100), ...events([["z", 800], ["a", 100], ["z", 800]], 1_000_800)]
        expect(slowestKeys(evts, 100).some((k) => k.key === "z")).toBe(false)
    })

    it("ignores keys that are only slightly slow", () => {
        // 'b' at 130ms is under the 1.5x bar against a 100ms baseline.
        const evts = [...steady("a", 6, 100), ...events([["b", 130], ["a", 100], ["b", 130], ["a", 100], ["b", 130]], 1_000_600)]
        expect(slowestKeys(evts, 100).some((k) => k.key === "b")).toBe(false)
    })

    it("falls back to this test's own mean when no baseline is given", () => {
        const evts = [...steady("a", 10, 100), ...events([["q", 400], ["a", 100], ["q", 400], ["a", 100], ["q", 400]], 1_001_000)]
        expect(slowestKeys(evts).some((k) => k.key === "q")).toBe(true)
    })
})

describe("estimateWpmCost", () => {
    it("is zero when there are no slow keys", () => {
        expect(estimateWpmCost(steady("a", 20, 120), [], 120)).toBe(0)
    })

    it("reports a positive gain when slow keys are clamped to baseline", () => {
        const evts = [...steady("a", 10, 100), ...events([["r", 500], ["a", 100], ["r", 500], ["a", 100], ["r", 500]], 1_001_000)]
        const slow = slowestKeys(evts, 100)
        const cost = estimateWpmCost(evts, slow, 100)
        expect(cost).toBeGreaterThan(0)
    })

    it("never goes negative even if a 'slow' key is actually faster than baseline", () => {
        // Clamping only pulls above-baseline latencies down, so cost stays >= 0.
        const evts = steady("a", 20, 100)
        const fakeSlow = [{ key: "a", meanMs: 50, samples: 19, ratio: 0.5 }]
        expect(estimateWpmCost(evts, fakeSlow, 100)).toBe(0)
    })
})

describe("costliestTransitions", () => {
    it("ranks recurring pairs slowest first", () => {
        // 't'->'h' is slow (300ms) and recurs; 'a'->'b' is fast (80ms) and recurs.
        const evts = events([
            ["a", 0], ["b", 80], ["a", 80], ["b", 80],
            ["t", 80], ["h", 300], ["t", 80], ["h", 300],
        ])
        const transitions = costliestTransitions(evts)
        expect(transitions[0]).toMatchObject({ from: "t", to: "h", occurrences: 2 })
        expect(transitions[0]!.meanMs).toBeCloseTo(300, 5)
    })

    it("ignores pairs that occur only once", () => {
        const evts = events([["q", 0], ["z", 900], ["a", 100], ["b", 100]])
        expect(costliestTransitions(evts)).toEqual([])
    })
})

describe("diagnose", () => {
    it("refuses to diagnose tests under the keystroke floor", () => {
        const result = diagnose({ events: steady("a", 10, 100) })
        expect(result.tooShort).toBe(true)
        expect(result.keystrokes).toBe(10)
        expect(result.findings).toEqual([])
        expect(result.drillKeys).toEqual([])
    })

    it("produces slow-key, accuracy, and transition findings with drillable keys", () => {
        // 40 keystrokes: an 'a' rhythm at 100ms with slow 'r' (300ms) spliced in,
        // plus an inaccurate 'e' from the attempts map.
        const evts = [
            ...steady("a", 25, 100),
            ...events([["r", 300], ["a", 100], ["r", 300], ["a", 100], ["r", 300], ["a", 100],
                ["e", 100], ["a", 100], ["e", 100], ["a", 100], ["e", 100], ["a", 100],
                ["t", 100], ["h", 250], ["t", 100], ["h", 250]], 1_002_500),
        ]
        expect(evts.length).toBeGreaterThanOrEqual(MIN_KEYSTROKES_TO_DIAGNOSE)

        const result = diagnose({
            events: evts,
            // 'e' was the least-accurate key this test (2 of 5 correct = 40%).
            worstKeys: [{ key: "e", accuracy: 40, attempts: 5 }],
            baselineMeanMs: 100,
        })

        expect(result.tooShort).toBe(false)
        const kinds = result.findings.map((f) => f.kind)
        expect(kinds).toContain("slow-keys")
        expect(kinds).toContain("inaccurate-keys")
        expect(kinds).toContain("slow-transitions")
        // Slow keys lead the order (the headline WPM story).
        expect(kinds[0]).toBe("slow-keys")
        // Drill target unions the findings, slow keys first, only drillable letters.
        expect(result.drillKeys).toContain("r")
        expect(result.drillKeys).toContain("e")
        expect(result.drillKeys.every((k) => /^[a-z]$/.test(k))).toBe(true)
    })

    it("phrases the slow-key finding as a WPM loss when the cost rounds to >= 1", () => {
        const evts = [...steady("a", 25, 100), ...events([["r", 500], ["a", 100], ["r", 500], ["a", 100], ["r", 500]], 1_002_500)]
        const result = diagnose({ events: evts, baselineMeanMs: 100 })
        const slow = result.findings.find((f) => f.kind === "slow-keys")!
        expect(slow.summary).toMatch(/lost ~\d+ WPM/)
    })

    it("omits findings that have no signal", () => {
        // Perfectly steady, perfectly accurate (no worst keys), no slow pair.
        const result = diagnose({
            events: steady("a", 40, 100),
            worstKeys: [],
            baselineMeanMs: 100,
        })
        expect(result.tooShort).toBe(false)
        expect(result.findings.some((f) => f.kind === "slow-keys")).toBe(false)
        expect(result.findings.some((f) => f.kind === "inaccurate-keys")).toBe(false)
    })
})
