// Weekly recap generator (Phase 3 §3.4). Free-tier honest: no email provider
// exists, so the recap is a *surface*, not a send. This stays render-agnostic —
// a pure payload the /progress banner renders now and a Resend/Postmark email
// could render later from the same data.

import { worstKeysFromAttempts } from "./stats"
import type { KeyAttempt } from "./heatmap"
import { currentStreak, filterByPeriod, headlineDelta, type ProgressRecord } from "./progress"

const WEEK_DAYS = 7
export const RECAP_INTERVAL_MS = WEEK_DAYS * 24 * 60 * 60 * 1000

export interface Recap {
    // WPM change this week vs the week before (null with too little history).
    weekDeltaWpm: number | null
    testsThisWeek: number
    streak: number
    // The weakest key to drill next, or null when there's no per-key data.
    focusKey: string | null
}

// Whether the recap is due: never seen, or the last one was ≥ 7 days ago.
export function isRecapDue(lastRecapAt: number | null, now: number): boolean {
    if (lastRecapAt === null) return true
    return now - lastRecapAt >= RECAP_INTERVAL_MS
}

export function buildRecap(
    records: ProgressRecord[],
    keyAttempts: Record<string, KeyAttempt>,
    now: Date,
    utcOffsetMinutes = 0,
): Recap {
    const attempts = new Map(Object.entries(keyAttempts))
    const worst = worstKeysFromAttempts(attempts, 1)
    return {
        weekDeltaWpm: headlineDelta(records, WEEK_DAYS, now).delta,
        testsThisWeek: filterByPeriod(records, WEEK_DAYS, now).length,
        streak: currentStreak(records, now, utcOffsetMinutes),
        focusKey: worst[0]?.key ?? null,
    }
}
