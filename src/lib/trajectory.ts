// Goal-trajectory math (Phase 3 §3.5). Pure, unit-testable. Projects the user's
// current WPM trend linearly and compares it to the pace needed to hit a target
// by a date - honest about shortfall, never flattering. Assumptions: a simple
// least-squares fit over practiced-day median WPM (no weighting, no curve), extrapolated
// linearly; real improvement curves bend, so treat the projected date as a
// straight-line estimate, not a promise.

import { dailyProgressSeries, type ProgressRecord } from "./progress"

const DAY_MS = 24 * 60 * 60 * 1000

export interface Goal {
    targetWpm: number
    targetDate: Date
}

export interface Trajectory {
    // False when there isn't enough spread-out history to fit a trend.
    enoughData: boolean
    // Fitted WPM at `now`.
    currentWpm: number
    // WPM gained per day at the current pace (can be negative).
    slopePerDay: number
    targetWpm: number
    gapWpm: number
    // When the target is reached at the current pace; null if never (flat/falling).
    reachesTargetOn: Date | null
    daysToTarget: number | null
    targetDate: Date
    daysToDeadline: number
    // WPM/day needed from now to hit the target by the deadline (null if the
    // deadline has passed).
    requiredSlopePerDay: number | null
    // WPM projected at the deadline, anchored to the latest practiced-day median.
    projectedWpmAtDeadline: number | null
    onTrack: boolean
}

// Least-squares slope+intercept over (x, y); null when fewer than two points or
// no spread in x (a vertical line has no slope).
function linearFit(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
    if (points.length < 2) return null
    const n = points.length
    const mx = points.reduce((s, p) => s + p.x, 0) / n
    const my = points.reduce((s, p) => s + p.y, 0) / n
    let num = 0
    let den = 0
    for (const p of points) {
        num += (p.x - mx) * (p.y - my)
        den += (p.x - mx) ** 2
    }
    if (den === 0) return null
    const slope = num / den
    return { slope, intercept: my - slope * mx }
}

export function projectTrajectory(records: ProgressRecord[], goal: Goal, now: Date, utcOffsetMinutes = 0): Trajectory {
    const nowMs = now.getTime()
    const dailyPoints = dailyProgressSeries(records, "all", now, utcOffsetMinutes).points
    const points = dailyPoints.map((point) => ({ x: (point.t - nowMs) / DAY_MS, y: point.wpm }))
    const fit = linearFit(points)

    const daysToDeadline = (goal.targetDate.getTime() - nowMs) / DAY_MS

    if (!fit) {
        const currentWpm = dailyPoints.at(-1)?.wpm ?? 0
        return {
            enoughData: false,
            currentWpm,
            slopePerDay: 0,
            targetWpm: goal.targetWpm,
            gapWpm: goal.targetWpm - currentWpm,
            reachesTargetOn: null,
            daysToTarget: null,
            targetDate: goal.targetDate,
            daysToDeadline,
            requiredSlopePerDay: daysToDeadline > 0 ? (goal.targetWpm - currentWpm) / daysToDeadline : null,
            projectedWpmAtDeadline: null,
            onTrack: false,
        }
    }

    // "Current" is an observed value, matching the hero; the fit only supplies
    // the pace. This prevents a noisy fit from claiming the user is below the
    // daily median they just achieved.
    const currentWpm = dailyPoints.at(-1)!.wpm
    const slopePerDay = fit.slope
    const gapWpm = goal.targetWpm - currentWpm

    // Already at/over the target, or projected to reach it at the current pace.
    let daysToTarget: number | null
    if (gapWpm <= 0) daysToTarget = 0
    else if (slopePerDay > 0) daysToTarget = gapWpm / slopePerDay
    else daysToTarget = null

    const reachesTargetOn = daysToTarget === null ? null : new Date(nowMs + daysToTarget * DAY_MS)
    const requiredSlopePerDay = daysToDeadline > 0 ? gapWpm / daysToDeadline : null
    const projectedWpmAtDeadline = daysToDeadline > 0
        ? Math.max(0, currentWpm + slopePerDay * daysToDeadline)
        : null
    const onTrack = gapWpm <= 0 || (projectedWpmAtDeadline !== null && projectedWpmAtDeadline >= goal.targetWpm)

    return {
        enoughData: true,
        currentWpm,
        slopePerDay,
        targetWpm: goal.targetWpm,
        gapWpm,
        reachesTargetOn,
        daysToTarget,
        targetDate: goal.targetDate,
        daysToDeadline,
        requiredSlopePerDay,
        projectedWpmAtDeadline,
        onTrack,
    }
}

// ---------------------------------------------------------------------------
// Plateau detection (Phase 4 §4.5) - the coach noticing before the user does
// ---------------------------------------------------------------------------

export const PLATEAU_CONFIG = {
    // Projected WPM change over a window under this (in magnitude) reads as flat.
    bandWpm: 1.5,
    minTests: 6,
    // How far back we extend (in weeks) to report how long the plateau has lasted.
    maxWeeks: 12,
} as const

export interface PlateauResult {
    enoughData: boolean
    plateaued: boolean
    // How many weeks the trend has stayed flat (≥ 3 when plateaued).
    weeks: number
    slopePerDay: number
}

// Fitted WPM slope over the last `windowDays`, plus how many tests fell in it.
function slopeOverWindow(records: ProgressRecord[], now: Date, windowDays: number): { slope: number; count: number } | null {
    const nowMs = now.getTime()
    const start = nowMs - windowDays * DAY_MS
    const window = records.filter((r) => {
        const t = r.createdAt.getTime()
        return t >= start && t <= nowMs
    })
    const fit = linearFit(window.map((r) => ({ x: (r.createdAt.getTime() - nowMs) / DAY_MS, y: r.wpm })))
    return fit ? { slope: fit.slope, count: window.length } : null
}

function isFlat(slopePerDay: number, windowDays: number): boolean {
    return Math.abs(slopePerDay * windowDays) < PLATEAU_CONFIG.bandWpm
}

// A plateau = a ~flat WPM trend over the trailing 3 weeks (within noise). When
// flat, we extend the window back week by week to report how long it's lasted -
// "plateaued for N weeks" - so the coach can call it out before the user notices.
export function detectPlateau(records: ProgressRecord[], now: Date): PlateauResult {
    const base = slopeOverWindow(records, now, 21)
    if (!base || base.count < PLATEAU_CONFIG.minTests) {
        return { enoughData: false, plateaued: false, weeks: 0, slopePerDay: base?.slope ?? 0 }
    }
    if (!isFlat(base.slope, 21)) {
        return { enoughData: true, plateaued: false, weeks: 0, slopePerDay: base.slope }
    }

    let weeks = 3
    let prevCount = base.count
    while (weeks < PLATEAU_CONFIG.maxWeeks) {
        const windowDays = (weeks + 1) * 7
        const w = slopeOverWindow(records, now, windowDays)
        if (!w || w.count < PLATEAU_CONFIG.minTests || !isFlat(w.slope, windowDays)) break
        // No older tests in the wider window → the plateau isn't actually longer,
        // we've just run out of history. Don't overstate its duration.
        if (w.count === prevCount) break
        prevCount = w.count
        weeks++
    }
    return { enoughData: true, plateaued: true, weeks, slopePerDay: base.slope }
}
