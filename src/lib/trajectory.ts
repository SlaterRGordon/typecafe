// Goal-trajectory math (Phase 3 §3.5). Pure, unit-testable. Projects the user's
// current WPM trend linearly and compares it to the pace needed to hit a target
// by a date — honest about shortfall, never flattering. Assumptions: a simple
// least-squares fit over per-test WPM (no weighting, no curve), extrapolated
// linearly; real improvement curves bend, so treat the projected date as a
// straight-line estimate, not a promise.

import type { ProgressRecord } from "./progress"

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

export function projectTrajectory(records: ProgressRecord[], goal: Goal, now: Date): Trajectory {
    const nowMs = now.getTime()
    // x = days relative to now (past is negative), so the intercept is "now".
    const points = records.map((r) => ({ x: (r.createdAt.getTime() - nowMs) / DAY_MS, y: r.wpm }))
    const fit = linearFit(points)

    const daysToDeadline = (goal.targetDate.getTime() - nowMs) / DAY_MS

    if (!fit) {
        const currentWpm = points.length > 0 ? points[points.length - 1]!.y : 0
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
            onTrack: false,
        }
    }

    const currentWpm = fit.intercept
    const slopePerDay = fit.slope
    const gapWpm = goal.targetWpm - currentWpm

    // Already at/over the target, or projected to reach it at the current pace.
    let daysToTarget: number | null
    if (gapWpm <= 0) daysToTarget = 0
    else if (slopePerDay > 0) daysToTarget = gapWpm / slopePerDay
    else daysToTarget = null

    const reachesTargetOn = daysToTarget === null ? null : new Date(nowMs + daysToTarget * DAY_MS)
    const requiredSlopePerDay = daysToDeadline > 0 ? gapWpm / daysToDeadline : null
    const onTrack = gapWpm <= 0 || (daysToTarget !== null && daysToTarget <= daysToDeadline)

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
        onTrack,
    }
}
