import { describe, expect, it } from "vitest"
import {
    buildWpmSamples,
    charsAtElapsed,
    computeStats,
    consistencyFromSamples,
    instantaneousWpm,
    isRankableSample,
    isReliableWpmSample,
    shouldHeroNetWpm,
    worstKeysFromAttempts,
    wpmImprovement,
    WPM_SAMPLE_TARGET_POINTS,
    type Keystroke,
} from "./stats"

// Build a steady timeline: one keystroke every `intervalMs`, chars counting up.
function steadyTimeline(strokes: number, intervalMs: number, startAt = 1_000_000): Keystroke[] {
    return Array.from({ length: strokes }, (_, i) => ({
        t: startAt + i * intervalMs,
        chars: i + 1,
    }))
}

describe("charsAtElapsed", () => {
    it("returns 0 for an empty timeline", () => {
        expect(charsAtElapsed([], 0, 10)).toBe(0)
    })

    it("returns the net chars at or before the elapsed time", () => {
        const timeline = steadyTimeline(10, 1000)
        expect(charsAtElapsed(timeline, timeline[0]!.t, 0)).toBe(1)
        expect(charsAtElapsed(timeline, timeline[0]!.t, 4)).toBe(5)
        expect(charsAtElapsed(timeline, timeline[0]!.t, 100)).toBe(10)
    })

    it("reflects backspaces lowering the count", () => {
        const t0 = 1_000_000
        const timeline: Keystroke[] = [
            { t: t0, chars: 1 },
            { t: t0 + 1000, chars: 2 },
            { t: t0 + 2000, chars: 1 }, // backspace
        ]
        expect(charsAtElapsed(timeline, t0, 2)).toBe(1)
    })
})

describe("instantaneousWpm", () => {
    it("returns 0 when no chars are in the window", () => {
        expect(instantaneousWpm([], 0, 5)).toBe(0)
    })

    it("matches the steady rate for an even timeline", () => {
        // 1 char per 200ms = 5 chars/sec = 1 word/sec = 60 WPM
        const timeline = steadyTimeline(50, 200)
        const wpm = instantaneousWpm(timeline, timeline[0]!.t, 5)
        expect(wpm).toBeCloseTo(60, 0)
    })

    it("does not extrapolate a lone early keystroke to an unbounded spike", () => {
        const timeline: Keystroke[] = [{ t: 1_000_000, chars: 1 }]
        // Window is clamped to at least 0.2s, so max is (1/5)/(0.2/60) = 60.
        expect(instantaneousWpm(timeline, 1_000_000, 0.01)).toBeLessThanOrEqual(60)
    })
})

describe("buildWpmSamples", () => {
    it("returns [] for an empty timeline", () => {
        expect(buildWpmSamples([])).toEqual([])
    })

    it("returns a single zero sample for a single keystroke", () => {
        expect(buildWpmSamples([{ t: 1_000_000, chars: 1 }])).toEqual([{ elapsedSeconds: 0, wpm: 0 }])
    })

    it("produces roughly the target number of samples for a long test", () => {
        const timeline = steadyTimeline(300, 100) // 30s test
        const samples = buildWpmSamples(timeline)
        expect(samples.length).toBeGreaterThan(WPM_SAMPLE_TARGET_POINTS - 5)
        expect(samples.length).toBeLessThanOrEqual(WPM_SAMPLE_TARGET_POINTS + 1)
    })

    it("ends exactly at the last keystroke's elapsed time", () => {
        const timeline = steadyTimeline(20, 500)
        const samples = buildWpmSamples(timeline)
        expect(samples[samples.length - 1]!.elapsedSeconds).toBeCloseTo(9.5, 5)
    })

    it("never yields negative or non-finite WPM", () => {
        const timeline = steadyTimeline(20, 50) // 1s, sub-second steps
        for (const sample of buildWpmSamples(timeline)) {
            expect(Number.isFinite(sample.wpm)).toBe(true)
            expect(sample.wpm).toBeGreaterThanOrEqual(0)
        }
    })

    it("shows pauses as zero-speed windows instead of smoothing them away", () => {
        const timeline: Keystroke[] = [
            { t: 0, chars: 1 },
            { t: 100, chars: 2 },
            { t: 200, chars: 3 },
            { t: 3_000, chars: 4 },
        ]

        expect(instantaneousWpm(timeline, 0, 2)).toBe(0)
        expect(buildWpmSamples(timeline).some((sample) => sample.wpm === 0)).toBe(true)
    })
})

describe("computeStats", () => {
    it("computes raw/net WPM and accuracy for a known timeline", () => {
        // 100 chars over exactly 60s => 20 raw WPM; 10 incorrect => 90% accuracy,
        // net = ((90 - 10) / 5) / 1min = 16.
        const timeline: Keystroke[] = [
            { t: 0, chars: 1 },
            { t: 60_000, chars: 100 },
        ]
        const stats = computeStats({
            timeline,
            characterCount: 100,
            incorrectCount: 10,
            isTimed: false,
            timedDurationSeconds: 0,
            fallbackStartTime: 0,
        })
        expect(stats.rawWpm).toBeCloseTo(20)
        expect(stats.speed).toBeCloseTo(20)
        expect(stats.accuracy).toBeCloseTo(90)
        expect(stats.netWpm).toBeCloseTo(16)
        expect(stats.durationSeconds).toBeCloseTo(60)
    })

    it("uses the configured duration for timed tests regardless of timeline span", () => {
        const timeline: Keystroke[] = [
            { t: 0, chars: 1 },
            { t: 10_000, chars: 50 },
        ]
        const stats = computeStats({
            timeline,
            characterCount: 50,
            incorrectCount: 0,
            isTimed: true,
            timedDurationSeconds: 30,
            fallbackStartTime: 0,
        })
        expect(stats.durationSeconds).toBe(30)
        expect(stats.rawWpm).toBeCloseTo((50 / 5) / (30 / 60))
    })

    it("handles a zero-keystroke test without NaN or Infinity", () => {
        const stats = computeStats({
            timeline: [],
            characterCount: 0,
            incorrectCount: 0,
            isTimed: false,
            timedDurationSeconds: 0,
            fallbackStartTime: 1_000_000,
            now: 1_000_000,
        })
        expect(stats.rawWpm).toBe(0)
        expect(stats.netWpm).toBe(0)
        expect(stats.accuracy).toBe(0)
        expect(stats.durationSeconds).toBe(0)
    })

    it("never returns a negative net WPM for very inaccurate tests", () => {
        const timeline: Keystroke[] = [
            { t: 0, chars: 1 },
            { t: 60_000, chars: 100 },
        ]
        const stats = computeStats({
            timeline,
            characterCount: 100,
            incorrectCount: 90,
            isTimed: false,
            timedDurationSeconds: 0,
            fallbackStartTime: 0,
        })
        expect(stats.netWpm).toBe(0)
    })

    it("defines all-wrong input as 0% accuracy and 0 net WPM", () => {
        const timeline: Keystroke[] = [
            { t: 0, chars: 1 },
            { t: 30_000, chars: 50 },
        ]
        const stats = computeStats({
            timeline,
            characterCount: 50,
            incorrectCount: 50,
            isTimed: false,
            timedDurationSeconds: 0,
            fallbackStartTime: 0,
        })

        expect(stats.rawWpm).toBeCloseTo(20)
        expect(stats.accuracy).toBe(0)
        expect(stats.netWpm).toBe(0)
    })

    it("does not blow up on a sub-second test", () => {
        const timeline: Keystroke[] = [
            { t: 0, chars: 1 },
            { t: 500, chars: 10 },
        ]
        const stats = computeStats({
            timeline,
            characterCount: 10,
            incorrectCount: 0,
            isTimed: false,
            timedDurationSeconds: 0,
            fallbackStartTime: 0,
        })
        expect(Number.isFinite(stats.rawWpm)).toBe(true)
        expect(stats.durationSeconds).toBeCloseTo(0.5)
    })
})

describe("worstKeysFromAttempts", () => {
    const attemptsMap = (entries: [string, number, number][]) =>
        new Map(entries.map(([key, attempts, correct]) => [key, { attempts, correct }]))

    it("returns the least accurate keys first", () => {
        const result = worstKeysFromAttempts(attemptsMap([
            ["a", 10, 9],
            ["b", 10, 5],
            ["c", 10, 7],
        ]))
        expect(result.map((entry) => entry.key)).toEqual(["b", "c", "a"])
    })

    it("skips keys with too few attempts", () => {
        const result = worstKeysFromAttempts(attemptsMap([
            ["a", 2, 0],
            ["b", 10, 8],
        ]))
        expect(result.map((entry) => entry.key)).toEqual(["b"])
    })

    it("skips keys typed perfectly", () => {
        const result = worstKeysFromAttempts(attemptsMap([
            ["a", 10, 10],
            ["b", 10, 9],
        ]))
        expect(result.map((entry) => entry.key)).toEqual(["b"])
    })

    it("respects the limit", () => {
        const result = worstKeysFromAttempts(attemptsMap([
            ["a", 10, 1],
            ["b", 10, 2],
            ["c", 10, 3],
            ["d", 10, 4],
        ]), 2)
        expect(result).toHaveLength(2)
    })

    it("returns [] for an empty map", () => {
        expect(worstKeysFromAttempts(new Map())).toEqual([])
    })
})

describe("isReliableWpmSample", () => {
    it("rejects a tiny grams sample (2 chars in a fraction of a second)", () => {
        // The "500 wpm after a 2-char level" case.
        expect(isReliableWpmSample(0.2, 2)).toBe(false)
    })

    it("rejects samples that clear only one of the two bars", () => {
        expect(isReliableWpmSample(5, 2)).toBe(false) // enough time, too few keystrokes
        expect(isReliableWpmSample(0.5, 50)).toBe(false) // enough keystrokes, too little time
    })

    it("requires both at least 1s and at least 5 keystrokes", () => {
        expect(isReliableWpmSample(0.99, 100)).toBe(false)
        expect(isReliableWpmSample(1, 4)).toBe(false)
        expect(isReliableWpmSample(1, 5)).toBe(true)
    })

    it("accepts a comfortably large sample", () => {
        expect(isReliableWpmSample(30, 250)).toBe(true)
    })
})

describe("isRankableSample", () => {
    it("rejects a stray 1–3 keystroke tap", () => {
        // The "1-keystroke test still got a percentile brag" case.
        expect(isRankableSample(0.5, 1)).toBe(false)
        expect(isRankableSample(10, 3)).toBe(false) // plenty of time, far too few keys
    })

    it("rejects a sample that clears only one bar", () => {
        expect(isRankableSample(2.9, 50)).toBe(false) // enough keys, too short
        expect(isRankableSample(30, 9)).toBe(false) // long enough, too few keys
    })

    it("requires both at least 3s and at least 10 keystrokes", () => {
        expect(isRankableSample(3, 9)).toBe(false)
        expect(isRankableSample(2.99, 10)).toBe(false)
        expect(isRankableSample(3, 10)).toBe(true)
    })

    it("is a firmer bar than the WPM-display floor", () => {
        // A sample can be display-reliable yet not substantial enough to rank.
        expect(isReliableWpmSample(1, 5)).toBe(true)
        expect(isRankableSample(1, 5)).toBe(false)
    })

    it("accepts a normal test", () => {
        expect(isRankableSample(15, 120)).toBe(true)
    })
})

describe("shouldHeroNetWpm", () => {
    it("leads with net WPM when accuracy collapses", () => {
        expect(shouldHeroNetWpm(0)).toBe(true)
        expect(shouldHeroNetWpm(49.9)).toBe(true)
    })

    it("keeps raw WPM as the hero for normal runs", () => {
        expect(shouldHeroNetWpm(50)).toBe(false)
        expect(shouldHeroNetWpm(96.5)).toBe(false)
        expect(shouldHeroNetWpm(100)).toBe(false)
    })
})

describe("consistencyFromSamples", () => {
    it("returns 0 for fewer than two samples", () => {
        expect(consistencyFromSamples([])).toBe(0)
        expect(consistencyFromSamples([{ elapsedSeconds: 1, wpm: 60 }])).toBe(0)
    })

    it("returns 100 for a perfectly even pace", () => {
        const samples = Array.from({ length: 10 }, (_, i) => ({ elapsedSeconds: i + 1, wpm: 60 }))
        expect(consistencyFromSamples(samples)).toBe(100)
    })

    it("returns a lower value for bursty typing", () => {
        const even = Array.from({ length: 10 }, (_, i) => ({ elapsedSeconds: i + 1, wpm: 60 }))
        const bursty = Array.from({ length: 10 }, (_, i) => ({ elapsedSeconds: i + 1, wpm: i % 2 === 0 ? 100 : 20 }))
        expect(consistencyFromSamples(bursty)).toBeLessThan(consistencyFromSamples(even))
    })

    it("stays within [0, 100]", () => {
        const wild = [
            { elapsedSeconds: 1, wpm: 0 },
            { elapsedSeconds: 2, wpm: 300 },
            { elapsedSeconds: 3, wpm: 0 },
        ]
        const value = consistencyFromSamples(wild)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
    })
})

describe("wpmImprovement", () => {
    it("reports a positive delta as an improvement", () => {
        expect(wpmImprovement(71, 76)).toEqual({ delta: 5, improved: true })
    })

    it("reports a regression without claiming a win", () => {
        expect(wpmImprovement(80, 74)).toEqual({ delta: -6, improved: false })
    })

    it("treats a flat result as a non-improvement", () => {
        expect(wpmImprovement(90, 90)).toEqual({ delta: 0, improved: false })
    })
})
