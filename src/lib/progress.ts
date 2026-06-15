// Pure progression math for the /progress dashboard (Phase 3 — the retention
// engine). No React, no DOM, no Prisma: every function here is unit-testable and
// produces identical results for a signed-in user (DB `Test` rows) and a guest
// (the localStorage mirror), so the page can answer "am I getting faster?" the
// same way for both. The numbers are the product — treat changes like the rest
// of src/lib/stats.ts.

// The period the dashboard's headline delta and trends are scoped to. Numeric
// values are day counts; "all" means the user's entire history.
export type ProgressPeriod = 7 | 30 | 90 | "all"
export const PROGRESS_PERIODS: ProgressPeriod[] = [7, 30, 90, "all"]

const DAY_MS = 24 * 60 * 60 * 1000

// The single normalized record the dashboard reasons about. Both a Prisma `Test`
// row and a guest's stored result map onto this shape, so nothing below ever
// needs to know where the data came from. `consistency` is optional because
// older records (and most non-timed tests) don't carry it yet.
export interface ProgressRecord {
    wpm: number
    accuracy: number
    consistency?: number
    createdAt: Date
}

// ---------------------------------------------------------------------------
// Period windows
// ---------------------------------------------------------------------------

// The inclusive lower bound of a period's window. `null` for "all" (no lower
// bound — the whole history counts).
export function periodStart(period: ProgressPeriod, now: Date): Date | null {
    if (period === "all") return null
    return new Date(now.getTime() - period * DAY_MS)
}

// Records that fall inside the period's window, i.e. createdAt within the last
// N days (or everything, for "all"). Future-dated records are excluded so a
// clock skew can't inflate a window.
export function filterByPeriod(records: ProgressRecord[], period: ProgressPeriod, now: Date): ProgressRecord[] {
    const start = periodStart(period, now)
    return records.filter((record) => {
        const t = record.createdAt.getTime()
        if (t > now.getTime()) return false
        return start === null || t >= start.getTime()
    })
}

// ---------------------------------------------------------------------------
// Averages
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function averageWpm(records: ProgressRecord[]): number {
    return mean(records.map((r) => r.wpm))
}

export function averageAccuracy(records: ProgressRecord[]): number {
    return mean(records.map((r) => r.accuracy))
}

// Averages only the records that actually carry a consistency figure, so a
// history of mixed old/new records still reports a meaningful number.
export function averageConsistency(records: ProgressRecord[]): number | null {
    const withConsistency = records
        .map((r) => r.consistency)
        .filter((c): c is number => typeof c === "number")
    if (withConsistency.length === 0) return null
    return mean(withConsistency)
}

export function bestWpm(records: ProgressRecord[]): number {
    return records.reduce((best, r) => Math.max(best, r.wpm), 0)
}

// ---------------------------------------------------------------------------
// Headline delta — the largest number on the page
// ---------------------------------------------------------------------------

export type HeadlineTrend = "up" | "down" | "flat" | "insufficient"

export interface HeadlineDelta {
    period: ProgressPeriod
    // Average WPM in the current window (the "now" side).
    currentAvg: number
    // Average WPM in the comparison window (the "then" side), or null when there
    // isn't enough history to compare honestly.
    priorAvg: number | null
    // currentAvg - priorAvg, or null when there's no comparison window.
    delta: number | null
    currentCount: number
    priorCount: number
    trend: HeadlineTrend
}

// Splits the records into a "current" and a "prior" window and reports the
// change in average WPM between them — deltas over absolutes (vision §7).
//
// For a numeric period N: current = the last N days, prior = the N days before
// that. For "all": the full history is split at its time midpoint (older half =
// prior, newer half = current) so the delta honestly answers "am I faster than
// when I started?".
//
// When there's no usable comparison window (no prior records, or a single data
// point), delta/priorAvg are null and trend is "insufficient" — we never invent
// a comparison the data can't support.
export function headlineDelta(records: ProgressRecord[], period: ProgressPeriod, now: Date): HeadlineDelta {
    let current: ProgressRecord[]
    let prior: ProgressRecord[]

    if (period === "all") {
        const sorted = [...records]
            .filter((r) => r.createdAt.getTime() <= now.getTime())
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        if (sorted.length < 2) {
            return {
                period,
                currentAvg: averageWpm(sorted),
                priorAvg: null,
                delta: null,
                currentCount: sorted.length,
                priorCount: 0,
                trend: "insufficient",
            }
        }
        const earliest = sorted[0]!.createdAt.getTime()
        const latest = sorted[sorted.length - 1]!.createdAt.getTime()
        const midpoint = earliest + (latest - earliest) / 2
        prior = sorted.filter((r) => r.createdAt.getTime() < midpoint)
        current = sorted.filter((r) => r.createdAt.getTime() >= midpoint)
        // A burst of same-instant records can land entirely on one side; fall
        // back to a simple first/second-half split by count so we still compare.
        if (prior.length === 0 || current.length === 0) {
            const half = Math.floor(sorted.length / 2)
            prior = sorted.slice(0, half)
            current = sorted.slice(half)
        }
    } else {
        const windowStart = now.getTime() - period * DAY_MS
        const priorStart = now.getTime() - 2 * period * DAY_MS
        current = records.filter((r) => {
            const t = r.createdAt.getTime()
            return t >= windowStart && t <= now.getTime()
        })
        prior = records.filter((r) => {
            const t = r.createdAt.getTime()
            return t >= priorStart && t < windowStart
        })
    }

    const currentAvg = averageWpm(current)
    if (prior.length === 0) {
        return {
            period,
            currentAvg,
            priorAvg: null,
            delta: null,
            currentCount: current.length,
            priorCount: 0,
            trend: "insufficient",
        }
    }

    const priorAvg = averageWpm(prior)
    const delta = currentAvg - priorAvg
    const trend: HeadlineTrend = delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat"

    return {
        period,
        currentAvg,
        priorAvg,
        delta,
        currentCount: current.length,
        priorCount: prior.length,
        trend,
    }
}

// ---------------------------------------------------------------------------
// Trend series — the scatter + rolling-average chart payload
// ---------------------------------------------------------------------------

export interface TrendPoint {
    t: number // createdAt as epoch ms (the chart x-axis)
    wpm: number
    accuracy: number
    consistency?: number
}

export interface TrendSeries {
    points: TrendPoint[]
    // Rolling average of WPM aligned 1:1 with `points` (the smooth line drawn
    // over the scatter). Each entry is the mean of the trailing `window` points.
    rollingWpm: number[]
    window: number
}

// Trailing rolling average. `rollingAverage(xs, k)[i]` is the mean of
// xs[max(0, i-k+1) .. i] — so early points average over fewer samples rather
// than being dropped, keeping the line the same length as the data.
export function rollingAverage(values: number[], window: number): number[] {
    if (window < 1) throw new Error("rollingAverage window must be >= 1")
    const result: number[] = []
    let sum = 0
    for (let i = 0; i < values.length; i++) {
        sum += values[i]!
        if (i >= window) sum -= values[i - window]!
        const count = Math.min(i + 1, window)
        result.push(sum / count)
    }
    return result
}

// Default rolling window scales gently with sample count: a handful of tests
// shouldn't be over-smoothed, a thousand shouldn't look jagged.
export function defaultRollingWindow(pointCount: number): number {
    if (pointCount <= 10) return Math.max(1, Math.ceil(pointCount / 3))
    return Math.min(Math.round(pointCount / 6), 30)
}

// The per-test scatter plus its rolling-average line, scoped to a period and
// sorted oldest→newest. Renders sanely for 1 point, 10, or 1,000.
export function trendSeries(
    records: ProgressRecord[],
    period: ProgressPeriod,
    now: Date,
    window?: number,
): TrendSeries {
    const points = filterByPeriod(records, period, now)
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((r) => ({
            t: r.createdAt.getTime(),
            wpm: r.wpm,
            accuracy: r.accuracy,
            consistency: r.consistency,
        }))
    const effectiveWindow = window ?? defaultRollingWindow(points.length)
    return {
        points,
        rollingWpm: rollingAverage(points.map((p) => p.wpm), Math.max(1, effectiveWindow)),
        window: Math.max(1, effectiveWindow),
    }
}

// ---------------------------------------------------------------------------
// Daily rollups — the O(days) aggregation behind the trends and streaks
// ---------------------------------------------------------------------------

export interface DailyRollup {
    day: string // YYYY-MM-DD in the user's local day
    tests: number
    bestWpm: number
    avgWpm: number
    avgAccuracy: number
}

// The local calendar day a timestamp falls in, as YYYY-MM-DD. `utcOffsetMinutes`
// is the user's offset from UTC (e.g. -480 for UTC-8 / US Pacific); shifting the
// instant by it before reading UTC date parts gives the user's local day without
// depending on the host machine's timezone. This is the key to the timezone
// acceptance: tests at 23:50 and 00:10 local fall on different days.
export function dayKey(date: Date, utcOffsetMinutes = 0): string {
    const shifted = new Date(date.getTime() + utcOffsetMinutes * 60 * 1000)
    const year = shifted.getUTCFullYear()
    const month = String(shifted.getUTCMonth() + 1).padStart(2, "0")
    const dayOfMonth = String(shifted.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${dayOfMonth}`
}

// Collapses raw records into one entry per local day, sorted oldest→newest. This
// mirrors the `DailyUserStat` rollup table the page reads server-side
// (derived-on-write, no cron) so chart queries stay O(days) not O(tests); the
// same pure function serves the guest's localStorage history.
export function dailyRollups(records: ProgressRecord[], utcOffsetMinutes = 0): DailyRollup[] {
    const byDay = new Map<string, ProgressRecord[]>()
    for (const record of records) {
        const key = dayKey(record.createdAt, utcOffsetMinutes)
        const bucket = byDay.get(key)
        if (bucket) bucket.push(record)
        else byDay.set(key, [record])
    }
    return Array.from(byDay.entries())
        .map(([day, dayRecords]) => ({
            day,
            tests: dayRecords.length,
            bestWpm: bestWpm(dayRecords),
            avgWpm: averageWpm(dayRecords),
            avgAccuracy: averageAccuracy(dayRecords),
        }))
        .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

// Consecutive-day practice streak ending today (Phase 3 §3.2), computed on read
// from the records — no jobs, no stored counter. Today not yet practised doesn't
// break the streak as long as yesterday was (the day isn't over).
// ponytail: counts any day with a completed test; the doc's "≥30s of typing"
// anti-spam bar needs per-test duration we don't store on Test yet — add that
// filter here once duration lands. DST-safe because the offset is fixed.
export function currentStreak(records: ProgressRecord[], now: Date, utcOffsetMinutes = 0): number {
    const days = new Set(records.map((r) => dayKey(r.createdAt, utcOffsetMinutes)))
    if (days.size === 0) return 0

    let cursor = now.getTime()
    if (!days.has(dayKey(new Date(cursor), utcOffsetMinutes))) {
        cursor -= DAY_MS // grace: start from yesterday if today is unpractised
        if (!days.has(dayKey(new Date(cursor), utcOffsetMinutes))) return 0
    }

    let streak = 0
    while (days.has(dayKey(new Date(cursor), utcOffsetMinutes))) {
        streak++
        cursor -= DAY_MS
    }
    return streak
}
