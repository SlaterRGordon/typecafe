// Weekly recap generator (Phase 3 §3.4). Free-tier honest: no email provider
// exists, so the recap is a *surface*, not a send. This stays render-agnostic -
// a pure payload the /progress banner renders now and a Resend/Postmark email
// could render later from the same data.

import { worstKeysFromAttempts, type KeyAccuracy } from "./stats"
import type { KeyAttempt } from "./heatmap"
import { currentStreak, filterByPeriod, headlineDelta, type ProgressRecord } from "./progress"
import { targetDisplayLabel } from "./coachingTarget"
import type { DailyCoachingSession } from "./dailyCoaching"
import type { SkillAnalysis } from "./skillEvidence"

const WEEK_DAYS = 7
export const RECAP_INTERVAL_MS = WEEK_DAYS * 24 * 60 * 60 * 1000

export interface Recap {
    // WPM change this week vs the week before (null with too little history).
    weekDeltaWpm: number | null
    testsThisWeek: number
    streak: number
    // The weakest key to drill next (key + its accuracy + attempts), or null when
    // there's no per-key data. Carries the "why" so the recap states the
    // diagnosis, not just the cure.
    focus: KeyAccuracy | null
    coachingSessions: number
    retained: { label: string, baseline: number, latest: number, metric: "ms" | "%" | "wpm" } | null
    action: { label: string, state: "due" | "regressed" | "target", href: string } | null
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
    coaching?: { analysis: SkillAnalysis | null, sessions: readonly DailyCoachingSession[] },
): Recap {
    const attempts = new Map(Object.entries(keyAttempts))
    const worst = worstKeysFromAttempts(attempts, 1)
    const retained = coaching?.analysis?.recap.retained[0] ?? null
    const due = coaching?.analysis?.recap.due ?? null
    const regressed = coaching?.analysis?.recap.regressed ?? null
    const recommendation = coaching?.analysis?.recommendation ?? null
    const actionTarget = due ?? regressed
    return {
        weekDeltaWpm: headlineDelta(records, WEEK_DAYS, now).delta,
        testsThisWeek: filterByPeriod(records, WEEK_DAYS, now).length,
        streak: currentStreak(records, now, utcOffsetMinutes),
        focus: worst[0] ?? null,
        coachingSessions: coaching?.sessions.filter((session) => session.status === "completed").length ?? 0,
        retained: retained ? {
            label: targetDisplayLabel(retained.target),
            baseline: retained.proof.baseline,
            latest: retained.proof.cold ?? retained.proof.transfer ?? retained.proof.baseline,
            metric: retained.proof.metric,
        } : null,
        action: actionTarget ? {
            label: targetDisplayLabel(actionTarget.target),
            state: actionTarget.state === "regressed" ? "regressed" : "due",
            href: "/plan",
        } : recommendation ? {
            label: targetDisplayLabel(recommendation.target),
            state: "target",
            href: "/plan",
        } : null,
    }
}
