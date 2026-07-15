import { describe, expect, it } from "vitest"
import {
    aggregateProgressHistory,
    dailyUserStatRollup,
    dateFromDayKey,
    mergeDailyStat,
    type DailyStatAggregate,
    type DailyStatValues,
} from "./dailyRollup"

// 2026-06-26T12:00:00Z and 2026-06-27T12:00:00Z - noon UTC so a modest offset
// can't tip them across a day boundary unexpectedly.
const day1 = Date.UTC(2026, 5, 26, 12)
const day2 = Date.UTC(2026, 5, 27, 12)

describe("aggregateProgressHistory", () => {
    it("buckets by local day and sums/maxes per day", () => {
        const out = aggregateProgressHistory([
            { wpm: 60, accuracy: 90, c: 80, t: day1 },
            { wpm: 80, accuracy: 95, c: 90, t: day1 },
            { wpm: 70, accuracy: 92, t: day2 },
        ])
        expect(out).toHaveLength(2)
        const d1 = out.find((a) => a.date.getTime() === dateFromDayKey("2026-06-26").getTime())!
        expect(d1.tests).toBe(2)
        expect(d1.bestWpm).toBe(72)
        expect(d1.totalWpm).toBe(120)
        expect(d1.totalAccuracy).toBe(185)
        expect(d1.totalConsistency).toBe(170)
        expect(d1.consistencySamples).toBe(2)
    })

    it("preserves v2 net WPM instead of penalizing it a second time", () => {
        const [agg] = aggregateProgressHistory([
            { v: 2, wpm: 80, accuracy: 90, t: day1 },
        ])
        expect(agg!.bestWpm).toBe(80)
        expect(agg!.totalWpm).toBe(80)
    })

    it("skips entries without a finite consistency from the consistency average", () => {
        const [agg] = aggregateProgressHistory([
            { wpm: 60, accuracy: 90, t: day1 },
            { wpm: 80, accuracy: 95, c: 88, t: day1 },
        ])
        expect(agg!.tests).toBe(2)
        expect(agg!.consistencySamples).toBe(1)
        expect(agg!.totalConsistency).toBe(88)
    })

    it("shifts the day boundary by utcOffsetMinutes", () => {
        // 2026-06-26T01:00Z is still June 25 in a -120min (UTC-2) timezone.
        const [agg] = aggregateProgressHistory(
            [{ wpm: 50, accuracy: 90, t: Date.UTC(2026, 5, 26, 1) }],
            -120,
        )
        expect(agg!.date.getTime()).toBe(dateFromDayKey("2026-06-25").getTime())
    })
})

describe("mergeDailyStat", () => {
    const agg: DailyStatAggregate = {
        date: dateFromDayKey("2026-06-26"),
        tests: 2,
        bestWpm: 80,
        totalWpm: 140,
        totalAccuracy: 185,
        totalConsistency: 170,
        consistencySamples: 2,
    }

    it("averages a fresh day from the aggregate alone", () => {
        expect(mergeDailyStat(null, agg)).toEqual<DailyStatValues>({
            tests: 2,
            bestWpm: 80,
            avgWpm: 70,
            avgAccuracy: 92.5,
            avgConsistency: 85,
            consistencySamples: 2,
            metricVersion: 2,
        })
    })

    it("leaves avgConsistency null when no sample ever contributed", () => {
        const noC: DailyStatAggregate = { ...agg, totalConsistency: 0, consistencySamples: 0 }
        expect(mergeDailyStat(null, noC).avgConsistency).toBeNull()
    })

    it("test-count-weights the running average against an existing row", () => {
        const existing: DailyStatValues = {
            tests: 1,
            bestWpm: 100,
            avgWpm: 100,
            avgAccuracy: 98,
            avgConsistency: 60,
            consistencySamples: 1,
            metricVersion: 2,
        }
        const out = mergeDailyStat(existing, agg)
        expect(out.tests).toBe(3)
        expect(out.bestWpm).toBe(100) // max(100, 80)
        expect(out.avgWpm).toBeCloseTo((100 + 140) / 3)
        expect(out.avgAccuracy).toBeCloseTo((98 + 185) / 3)
        // consistency weighted by sample count: (60*1 + 170) / (1 + 2)
        expect(out.consistencySamples).toBe(3)
        expect(out.avgConsistency!).toBeCloseTo((60 + 170) / 3)
    })

    it("treats an existing null avgConsistency as zero weight", () => {
        const existing: DailyStatValues = {
            tests: 1, bestWpm: 50, avgWpm: 50, avgAccuracy: 90,
            avgConsistency: null, consistencySamples: 0,
            metricVersion: 2,
        }
        const out = mergeDailyStat(existing, agg)
        // only the aggregate's samples count toward consistency
        expect(out.avgConsistency!).toBeCloseTo(170 / 2)
        expect(out.consistencySamples).toBe(2)
    })

    it("restarts a legacy raw-WPM row instead of mixing incompatible metrics", () => {
        const legacy: DailyStatValues = {
            tests: 10,
            bestWpm: 100,
            avgWpm: 80,
            avgAccuracy: 90,
            avgConsistency: 70,
            consistencySamples: 10,
            metricVersion: 1,
        }
        expect(mergeDailyStat(legacy, agg)).toEqual(mergeDailyStat(null, agg))
    })
})

describe("dailyUserStatRollup", () => {
    it("flattens a row to the wire shape", () => {
        expect(dailyUserStatRollup({
            date: dateFromDayKey("2026-06-26"),
            tests: 3,
            bestWpm: 90,
            avgWpm: 70,
            avgAccuracy: 95,
            avgConsistency: 88,
        })).toEqual({
            day: "2026-06-26",
            tests: 3,
            bestWpm: 90,
            avgWpm: 70,
            avgAccuracy: 95,
            avgConsistency: 88,
        })
    })
})
