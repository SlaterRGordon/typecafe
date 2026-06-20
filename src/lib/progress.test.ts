import { describe, expect, it } from "vitest"
import {
    PROGRESS_PERIODS,
    averageAccuracy,
    averageConsistency,
    averageWpm,
    bestWpm,
    currentStreak,
    dailyRollups,
    dayKey,
    defaultRollingWindow,
    filterByPeriod,
    filterProgressRecords,
    headlineDelta,
    isoWeekStart,
    periodStart,
    personalRecords,
    rankImprovementLeague,
    rollingAverage,
    selfLeagueSummary,
    trendSeries,
    type ProgressRecord,
} from "./progress"

const NOW = new Date("2026-06-14T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

// A record `daysAgo` before NOW with the given wpm (and optional accuracy/consistency).
function rec(daysAgo: number, wpm: number, accuracy = 95, consistency?: number): ProgressRecord {
    return { wpm, accuracy, consistency, createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS) }
}

describe("periodStart", () => {
    it("is null for all-time (no lower bound)", () => {
        expect(periodStart("all", NOW)).toBeNull()
    })

    it("subtracts the period's days from now", () => {
        expect(periodStart(30, NOW)!.getTime()).toBe(NOW.getTime() - 30 * DAY_MS)
        expect(periodStart(7, NOW)!.getTime()).toBe(NOW.getTime() - 7 * DAY_MS)
    })
})

describe("filterProgressRecords", () => {
    const records: ProgressRecord[] = [
        { ...rec(1, 70), mode: 0, subMode: 0, count: 30 },
        { ...rec(2, 76), mode: 0, subMode: 1, count: 25 },
        { ...rec(3, 65), mode: 1, subMode: 0, count: 60 },
        { ...rec(4, 55), mode: 2, subMode: 0, count: 0 },
        { ...rec(5, 45), mode: 3, subMode: 0, count: 0 },
        rec(6, 80),
    ]

    it("keeps every record for all filters", () => {
        expect(filterProgressRecords(records, { mode: "all", count: "all" })).toHaveLength(records.length)
    })

    it("maps normal timed and words submodes to separate top-level filters", () => {
        expect(filterProgressRecords(records, { mode: "timed", count: "all" }).map((r) => r.wpm)).toEqual([70])
        expect(filterProgressRecords(records, { mode: "words", count: "all" }).map((r) => r.wpm)).toEqual([76])
    })

    it("filters practice, grams, and relaxed modes", () => {
        expect(filterProgressRecords(records, { mode: "practice", count: "all" }).map((r) => r.wpm)).toEqual([65])
        expect(filterProgressRecords(records, { mode: "grams", count: "all" }).map((r) => r.wpm)).toEqual([55])
        expect(filterProgressRecords(records, { mode: "relaxed", count: "all" }).map((r) => r.wpm)).toEqual([45])
    })

    it("filters by count after mode", () => {
        expect(filterProgressRecords(records, { mode: "all", count: 25 }).map((r) => r.wpm)).toEqual([76])
        expect(filterProgressRecords(records, { mode: "timed", count: 25 })).toEqual([])
    })
})

describe("filterByPeriod", () => {
    const records = [rec(1, 60), rec(10, 70), rec(40, 80), rec(100, 90)]

    it("keeps only records inside the window", () => {
        expect(filterByPeriod(records, 7, NOW)).toHaveLength(1)
        expect(filterByPeriod(records, 30, NOW)).toHaveLength(2)
        expect(filterByPeriod(records, 90, NOW)).toHaveLength(3)
    })

    it("keeps everything for all-time", () => {
        expect(filterByPeriod(records, "all", NOW)).toHaveLength(4)
    })

    it("excludes future-dated records (clock skew guard)", () => {
        const withFuture = [...records, rec(-2, 999)]
        expect(filterByPeriod(withFuture, "all", NOW)).toHaveLength(4)
        expect(filterByPeriod(withFuture, 7, NOW)).toHaveLength(1)
    })

    it("includes a record exactly on the window boundary", () => {
        expect(filterByPeriod([rec(7, 50)], 7, NOW)).toHaveLength(1)
    })
})

describe("averages", () => {
    const records = [rec(1, 60, 90, 80), rec(2, 80, 100), rec(3, 100, 95, 90)]

    it("averages wpm and accuracy", () => {
        expect(averageWpm(records)).toBeCloseTo(80)
        expect(averageAccuracy(records)).toBeCloseTo(95)
    })

    it("averages only records that carry consistency", () => {
        expect(averageConsistency(records)).toBeCloseTo(85)
    })

    it("returns null consistency when no record carries it", () => {
        expect(averageConsistency([rec(1, 60), rec(2, 70)])).toBeNull()
    })

    it("handles empty input without dividing by zero", () => {
        expect(averageWpm([])).toBe(0)
        expect(averageAccuracy([])).toBe(0)
        expect(bestWpm([])).toBe(0)
    })

    it("bestWpm picks the maximum", () => {
        expect(bestWpm(records)).toBe(100)
    })
})

describe("headlineDelta", () => {
    it("reports a positive delta when the recent window is faster", () => {
        // prior 30-day window (~31-60 days ago) averaged 60; current (~0-30) averaged 70.
        const records = [rec(45, 58), rec(40, 62), rec(10, 68), rec(5, 72)]
        const result = headlineDelta(records, 30, NOW)
        expect(result.priorAvg).toBeCloseTo(60)
        expect(result.currentAvg).toBeCloseTo(70)
        expect(result.delta).toBeCloseTo(10)
        expect(result.trend).toBe("up")
        expect(result.currentCount).toBe(2)
        expect(result.priorCount).toBe(2)
    })

    it("reports a negative delta honestly (plateau/regression)", () => {
        const records = [rec(45, 80), rec(40, 80), rec(10, 70), rec(5, 70)]
        const result = headlineDelta(records, 30, NOW)
        expect(result.delta).toBeCloseTo(-10)
        expect(result.trend).toBe("down")
    })

    it("reports a flat trend when the windows match", () => {
        const records = [rec(45, 75), rec(10, 75)]
        const result = headlineDelta(records, 30, NOW)
        expect(result.delta).toBeCloseTo(0)
        expect(result.trend).toBe("flat")
    })

    it("is insufficient when there is no prior window", () => {
        const records = [rec(5, 70), rec(3, 72)]
        const result = headlineDelta(records, 30, NOW)
        expect(result.priorAvg).toBeNull()
        expect(result.delta).toBeNull()
        expect(result.trend).toBe("insufficient")
        expect(result.currentAvg).toBeCloseTo(71)
    })

    it("is insufficient with a single all-time data point", () => {
        const result = headlineDelta([rec(2, 65)], "all", NOW)
        expect(result.delta).toBeNull()
        expect(result.trend).toBe("insufficient")
        expect(result.currentAvg).toBeCloseTo(65)
    })

    it("splits all-time history at its time midpoint", () => {
        // 100 days of history: first half ~50 wpm, second half ~70 wpm.
        const records = [rec(100, 48), rec(90, 52), rec(20, 68), rec(5, 72)]
        const result = headlineDelta(records, "all", NOW)
        expect(result.priorAvg).toBeCloseTo(50)
        expect(result.currentAvg).toBeCloseTo(70)
        expect(result.delta).toBeCloseTo(20)
        expect(result.trend).toBe("up")
    })

    it("falls back to a count split when all-time records share an instant on one side", () => {
        // All records at the same timestamp would land on the current side of a
        // midpoint split; the count-split fallback still yields a comparison.
        const sameInstant = [rec(10, 40), rec(10, 60), rec(10, 80), rec(10, 100)]
        const result = headlineDelta(sameInstant, "all", NOW)
        expect(result.priorAvg).not.toBeNull()
        expect(result.currentAvg).not.toBeNull()
        expect(result.priorCount).toBe(2)
        expect(result.currentCount).toBe(2)
    })
})

describe("selfLeagueSummary", () => {
    it("compares this ISO week against the prior 30-day baseline", () => {
        const now = new Date("2026-06-17T12:00:00.000Z") // Wednesday
        const records = [
            { wpm: 58, accuracy: 95, createdAt: new Date("2026-05-20T12:00:00.000Z") },
            { wpm: 60, accuracy: 95, createdAt: new Date("2026-05-30T12:00:00.000Z") },
            { wpm: 62, accuracy: 95, createdAt: new Date("2026-06-10T12:00:00.000Z") },
            { wpm: 68, accuracy: 95, createdAt: new Date("2026-06-15T12:00:00.000Z") },
            { wpm: 72, accuracy: 95, createdAt: new Date("2026-06-17T10:00:00.000Z") },
        ]

        const summary = selfLeagueSummary(records, now)

        expect(summary.status).toBe("qualified")
        expect(summary.weekStart.toISOString()).toBe("2026-06-15T00:00:00.000Z")
        expect(summary.currentAvg).toBeCloseTo(70)
        expect(summary.baselineAvg).toBeCloseTo(60)
        expect(summary.delta).toBeCloseTo(10)
        expect(summary.currentCount).toBe(2)
        expect(summary.baselineCount).toBe(3)
    })

    it("uses the user's local ISO week boundary", () => {
        const now = new Date("2026-06-15T06:00:00.000Z") // Sunday 23:00 at UTC-7

        expect(isoWeekStart(now, -420).toISOString()).toBe("2026-06-08T07:00:00.000Z")
    })

    it("requires three prior baseline tests before scoring the self league", () => {
        const now = new Date("2026-06-17T12:00:00.000Z")
        const records = [
            { wpm: 60, accuracy: 95, createdAt: new Date("2026-06-10T12:00:00.000Z") },
            { wpm: 70, accuracy: 95, createdAt: new Date("2026-06-16T12:00:00.000Z") },
        ]

        const summary = selfLeagueSummary(records, now)

        expect(summary.status).toBe("insufficient_baseline")
        expect(summary.delta).toBeNull()
        expect(summary.baselineCount).toBe(1)
    })

    it("asks for a current-week test when only baseline data exists", () => {
        const now = new Date("2026-06-17T12:00:00.000Z")
        const records = [
            { wpm: 58, accuracy: 95, createdAt: new Date("2026-05-20T12:00:00.000Z") },
            { wpm: 60, accuracy: 95, createdAt: new Date("2026-05-30T12:00:00.000Z") },
            { wpm: 62, accuracy: 95, createdAt: new Date("2026-06-10T12:00:00.000Z") },
        ]

        const summary = selfLeagueSummary(records, now)

        expect(summary.status).toBe("no_current_week")
        expect(summary.delta).toBeNull()
        expect(summary.baselineCount).toBe(3)
    })
})

describe("rankImprovementLeague", () => {
    it("ranks a +6 slower typist above a +0 faster typist", () => {
        const ranked = rankImprovementLeague([
            { userId: "fast", username: "fast", currentAvg: 120, baselineAvg: 120, delta: 0, currentCount: 4, baselineCount: 10 },
            { userId: "slow", username: "slow", currentAvg: 56, baselineAvg: 50, delta: 6, currentCount: 4, baselineCount: 10 },
        ])

        expect(ranked.map((entry) => entry.userId)).toEqual(["slow", "fast"])
        expect(ranked[0]).toMatchObject({ rank: 1, delta: 6 })
    })
})

describe("rollingAverage", () => {
    it("averages over the trailing window, shrinking at the start", () => {
        expect(rollingAverage([10, 20, 30, 40], 2)).toEqual([10, 15, 25, 35])
    })

    it("equals the cumulative mean when the window covers everything", () => {
        expect(rollingAverage([2, 4, 6], 10)).toEqual([2, 3, 4])
    })

    it("returns the same length as the input", () => {
        expect(rollingAverage([1, 2, 3, 4, 5], 3)).toHaveLength(5)
    })

    it("handles an empty input", () => {
        expect(rollingAverage([], 3)).toEqual([])
    })

    it("rejects a window below 1", () => {
        expect(() => rollingAverage([1], 0)).toThrow()
    })
})

describe("defaultRollingWindow", () => {
    it("stays small for sparse history", () => {
        expect(defaultRollingWindow(1)).toBe(1)
        expect(defaultRollingWindow(9)).toBe(3)
    })

    it("scales with sample count and caps at 30", () => {
        expect(defaultRollingWindow(60)).toBe(10)
        expect(defaultRollingWindow(1000)).toBe(30)
    })
})

describe("trendSeries", () => {
    it("renders sanely with a single data point", () => {
        const series = trendSeries([rec(1, 70)], "all", NOW)
        expect(series.points).toHaveLength(1)
        expect(series.rollingWpm).toEqual([70])
        expect(series.window).toBe(1)
    })

    it("sorts points oldest to newest", () => {
        const series = trendSeries([rec(1, 72), rec(10, 60), rec(5, 66)], "all", NOW)
        expect(series.points.map((p) => p.wpm)).toEqual([60, 66, 72])
        expect(series.points[0]!.t).toBeLessThan(series.points[1]!.t)
    })

    it("scopes points to the period", () => {
        const series = trendSeries([rec(1, 70), rec(40, 50)], 30, NOW)
        expect(series.points).toHaveLength(1)
        expect(series.points[0]!.wpm).toBe(70)
    })

    it("handles 1,000 points and keeps the line aligned to the data", () => {
        const many: ProgressRecord[] = Array.from({ length: 1000 }, (_, i) => rec(1000 - i, 50 + (i % 25)))
        const series = trendSeries(many, "all", NOW)
        expect(series.points).toHaveLength(1000)
        expect(series.rollingWpm).toHaveLength(1000)
        expect(series.window).toBe(30)
    })

    it("carries consistency through when present", () => {
        const series = trendSeries([rec(1, 70, 95, 88)], "all", NOW)
        expect(series.points[0]!.consistency).toBe(88)
    })
})

describe("dayKey (timezone bucketing)", () => {
    it("buckets by UTC day at zero offset", () => {
        expect(dayKey(new Date("2026-06-14T23:50:00.000Z"))).toBe("2026-06-14")
        expect(dayKey(new Date("2026-06-15T00:10:00.000Z"))).toBe("2026-06-15")
    })

    it("shifts into the user's local day for a negative offset", () => {
        // UTC-3 (offset -180): 2026-06-15T01:00Z is still 2026-06-14 locally.
        expect(dayKey(new Date("2026-06-15T01:00:00.000Z"), -180)).toBe("2026-06-14")
    })

    it("keeps 23:50 and 00:10 on different local days (acceptance case)", () => {
        // Same user at UTC-5: a test at 23:50 and one at 00:10 local are two days.
        const offset = -300
        const late = new Date("2026-06-15T04:50:00.000Z") // 23:50 local on the 14th
        const early = new Date("2026-06-15T05:10:00.000Z") // 00:10 local on the 15th
        expect(dayKey(late, offset)).toBe("2026-06-14")
        expect(dayKey(early, offset)).toBe("2026-06-15")
    })
})

describe("dailyRollups", () => {
    it("collapses records into one entry per day, sorted oldest first", () => {
        const records = [
            { wpm: 60, accuracy: 90, createdAt: new Date("2026-06-14T10:00:00.000Z") },
            { wpm: 80, accuracy: 100, createdAt: new Date("2026-06-14T20:00:00.000Z") },
            { wpm: 70, accuracy: 95, createdAt: new Date("2026-06-13T10:00:00.000Z") },
        ]
        const rollups = dailyRollups(records)
        expect(rollups.map((r) => r.day)).toEqual(["2026-06-13", "2026-06-14"])

        const jun14 = rollups[1]!
        expect(jun14.tests).toBe(2)
        expect(jun14.bestWpm).toBe(80)
        expect(jun14.avgWpm).toBeCloseTo(70)
        expect(jun14.avgAccuracy).toBeCloseTo(95)
    })

    it("respects the timezone offset when assigning days", () => {
        const records = [
            { wpm: 60, accuracy: 90, createdAt: new Date("2026-06-15T01:00:00.000Z") },
            { wpm: 70, accuracy: 90, createdAt: new Date("2026-06-15T02:30:00.000Z") },
        ]
        // At UTC-3 both land on 2026-06-14 locally (22:00 and 23:30) → one rollup.
        const rollups = dailyRollups(records, -180)
        expect(rollups).toHaveLength(1)
        expect(rollups[0]!.day).toBe("2026-06-14")
        expect(rollups[0]!.tests).toBe(2)
    })

    it("returns an empty array for no records", () => {
        expect(dailyRollups([])).toEqual([])
    })
})

describe("personalRecords", () => {
    it("emits one event per new personal best, newest first", () => {
        // 60 (PB), 58 (no), 72 (PB), 70 (no), 85 (PB)
        const recs = [rec(40, 60), rec(35, 58), rec(30, 72), rec(20, 70), rec(5, 85)]
        const events = personalRecords(recs)
        expect(events.map((e) => e.wpm)).toEqual([85, 72, 60])
        // Newest first.
        expect(events[0]!.t).toBeGreaterThan(events[1]!.t)
    })

    it("frames a PB that crosses a round number as a threshold event", () => {
        const events = personalRecords([rec(10, 62), rec(5, 81)])
        expect(events[0]).toMatchObject({ wpm: 81, kind: "threshold", threshold: 80 })
        // First test (62) crossed 40/50/60 → highest 60.
        expect(events[1]).toMatchObject({ wpm: 62, kind: "threshold", threshold: 60 })
    })

    it("labels a PB that crosses no new threshold as a plain best", () => {
        // 82 then 87: 87 beats 82 but crosses no new round number (80 already done).
        const events = personalRecords([rec(10, 82), rec(5, 87)])
        expect(events[0]).toMatchObject({ wpm: 87, kind: "best" })
        expect(events[0]!.threshold).toBeUndefined()
    })

    it("returns an empty list for no records", () => {
        expect(personalRecords([])).toEqual([])
    })
})

describe("currentStreak", () => {
    it("counts consecutive days up to today", () => {
        expect(currentStreak([rec(0, 60), rec(1, 60), rec(2, 60)], NOW)).toBe(3)
    })

    it("keeps the streak when today is unpractised but yesterday wasn't", () => {
        expect(currentStreak([rec(1, 60), rec(2, 60)], NOW)).toBe(2)
    })

    it("is zero when the last practice is older than yesterday", () => {
        expect(currentStreak([rec(2, 60), rec(3, 60)], NOW)).toBe(0)
    })

    it("stops at the first gap", () => {
        // today, yesterday, then a gap at 2 days ago, then 3 days ago.
        expect(currentStreak([rec(0, 60), rec(1, 60), rec(3, 60)], NOW)).toBe(2)
    })

    it("counts a day with multiple tests once", () => {
        expect(currentStreak([rec(0, 60), rec(0, 70), rec(1, 60)], NOW)).toBe(2)
    })

    it("is zero with no records", () => {
        expect(currentStreak([], NOW)).toBe(0)
    })

    it("respects the timezone offset at the day boundary", () => {
        // At UTC-5, a test at 04:30Z is 23:30 the previous local day. With NOW at
        // noon UTC on the 14th (07:00 local), that test is "yesterday" locally → grace keeps it.
        const offset = -300
        const lateYesterday: ProgressRecord = { wpm: 60, accuracy: 95, createdAt: new Date("2026-06-14T04:30:00.000Z") }
        expect(currentStreak([lateYesterday], NOW, offset)).toBe(1)
    })
})

describe("PROGRESS_PERIODS", () => {
    it("lists the switchable periods", () => {
        expect(PROGRESS_PERIODS).toEqual([7, 30, 90, "all"])
    })
})
