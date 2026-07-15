// Daily progress-rollup math (Phase 3). Pure and Prisma-free: the test router
// does the I/O (find/create/update DailyUserStat) and calls these to compute the
// values. Extracted from server/api/routers/test.ts so the averaging/best-of
// logic is unit-testable without a database (standing rule: scoring math lives
// in src/lib/).

import { dayKey } from "./progress"
import { netFromRaw } from "./stats"

export const DAILY_STAT_METRIC_VERSION = 2

// One progress entry as stored by guests (localStorage) or replayed on sync.
export interface ProgressEntry {
    v?: 2 // absent = legacy raw WPM; v2 = canonical net WPM
    wpm: number
    accuracy: number
    c?: number // consistency 0-100, optional (older entries lack it)
    t: number // epoch ms
}

// A single day's worth of tests rolled up, before merging into a stored row.
export interface DailyStatAggregate {
    date: Date
    tests: number
    bestWpm: number
    totalWpm: number
    totalAccuracy: number
    totalConsistency: number
    consistencySamples: number
}

// The mutable fields of a DailyUserStat row that a merge produces - the shape
// both the create and the update path write.
export interface DailyStatValues {
    tests: number
    bestWpm: number
    avgWpm: number
    avgAccuracy: number
    avgConsistency: number | null
    consistencySamples: number
    metricVersion: number
}

export function dateFromDayKey(key: string): Date {
    return new Date(`${key}T00:00:00.000Z`)
}

// Roll a list of progress entries into one aggregate per local day. utcOffset
// shifts epoch timestamps into the user's day before bucketing. Entries without
// a finite consistency don't count toward the consistency average.
export function aggregateProgressHistory(
    entries: ProgressEntry[],
    utcOffsetMinutes = 0,
): DailyStatAggregate[] {
    const byDay = new Map<string, DailyStatAggregate>()

    for (const entry of entries) {
        const key = dayKey(new Date(entry.t), utcOffsetMinutes)
        const current = byDay.get(key)
        const consistency = typeof entry.c === "number" && Number.isFinite(entry.c) ? entry.c : null
        const netWpm = entry.v === 2 ? entry.wpm : netFromRaw(entry.wpm, entry.accuracy)

        if (!current) {
            byDay.set(key, {
                date: dateFromDayKey(key),
                tests: 1,
                bestWpm: netWpm,
                totalWpm: netWpm,
                totalAccuracy: entry.accuracy,
                totalConsistency: consistency ?? 0,
                consistencySamples: consistency === null ? 0 : 1,
            })
            continue
        }

        current.tests += 1
        current.bestWpm = Math.max(current.bestWpm, netWpm)
        current.totalWpm += netWpm
        current.totalAccuracy += entry.accuracy
        if (consistency !== null) {
            current.totalConsistency += consistency
            current.consistencySamples += 1
        }
    }

    return Array.from(byDay.values())
}

// Combine an existing stored row (or null, for a brand-new day) with a day's
// aggregate, producing the row's new values. Averages are weighted by test count
// (consistency by its own sample count, since not every test contributes one).
export function mergeDailyStat(
    existing: DailyStatValues | null,
    aggregate: DailyStatAggregate,
): DailyStatValues {
    if (!existing || existing.metricVersion !== DAILY_STAT_METRIC_VERSION) {
        return {
            tests: aggregate.tests,
            bestWpm: aggregate.bestWpm,
            avgWpm: aggregate.totalWpm / aggregate.tests,
            avgAccuracy: aggregate.totalAccuracy / aggregate.tests,
            avgConsistency: aggregate.consistencySamples > 0
                ? aggregate.totalConsistency / aggregate.consistencySamples
                : null,
            consistencySamples: aggregate.consistencySamples,
            metricVersion: DAILY_STAT_METRIC_VERSION,
        }
    }

    const tests = existing.tests + aggregate.tests
    const consistencySamples = existing.consistencySamples + aggregate.consistencySamples
    const consistencyTotal = (existing.avgConsistency ?? 0) * existing.consistencySamples + aggregate.totalConsistency

    return {
        tests,
        bestWpm: Math.max(existing.bestWpm, aggregate.bestWpm),
        avgWpm: ((existing.avgWpm * existing.tests) + aggregate.totalWpm) / tests,
        avgAccuracy: ((existing.avgAccuracy * existing.tests) + aggregate.totalAccuracy) / tests,
        avgConsistency: consistencySamples > 0 ? consistencyTotal / consistencySamples : null,
        consistencySamples,
        metricVersion: DAILY_STAT_METRIC_VERSION,
    }
}

// Flatten a stored row into the wire shape the /progress dashboard consumes.
export function dailyUserStatRollup(row: {
    date: Date
    tests: number
    bestWpm: number
    avgWpm: number
    avgAccuracy: number
    avgConsistency: number | null
}) {
    return {
        day: row.date.toISOString().slice(0, 10),
        tests: row.tests,
        bestWpm: row.bestWpm,
        avgWpm: row.avgWpm,
        avgAccuracy: row.avgAccuracy,
        avgConsistency: row.avgConsistency,
    }
}
