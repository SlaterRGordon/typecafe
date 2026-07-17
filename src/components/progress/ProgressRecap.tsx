import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import type { KeyAttempt } from "~/lib/heatmap"
import type { DailyCoachingSession } from "~/lib/dailyCoaching"
import type { ProgressRecord } from "~/lib/progress"
import { buildRecap, isRecapDue } from "~/lib/recap"
import type { SkillAnalysis } from "~/lib/skillEvidence"

const LAST_RECAP_KEY = "typecafe:lastRecapAt"

interface ProgressRecapProps {
    records: ProgressRecord[]
    keyAttempts: Record<string, KeyAttempt>
    analysis: SkillAnalysis | null
    sessions: readonly DailyCoachingSession[]
}

function metric(value: number, unit: "ms" | "%" | "wpm"): string {
    if (unit === "ms") return `${Math.round(value)} ms`
    if (unit === "%") return `${value.toFixed(1)}%`
    return `${value.toFixed(1)} WPM`
}

export function ProgressRecap({ records, keyAttempts, analysis, sessions }: ProgressRecapProps) {
    const [visible, setVisible] = useState(false)
    const now = useMemo(() => new Date(), [])
    const recap = useMemo(
        () => buildRecap(records, keyAttempts, now, -now.getTimezoneOffset(), { analysis, sessions }),
        [analysis, keyAttempts, now, records, sessions],
    )

    useEffect(() => {
        let last: number | null = null
        try {
            const raw = localStorage.getItem(LAST_RECAP_KEY)
            last = raw === null ? null : Number(raw)
        } catch { /* localStorage unavailable */ }
        setVisible(isRecapDue(Number.isFinite(last) ? last : null, now.getTime()) && records.length > 0)
    }, [now, records.length])

    if (!visible) return null
    const dismiss = () => {
        setVisible(false)
        try { localStorage.setItem(LAST_RECAP_KEY, String(Date.now())) } catch { /* localStorage unavailable */ }
    }

    return (
        <section data-testid="progress-recap" className="rounded-xl border border-primary/30 bg-primary/10 p-4" aria-label="Weekly progress recap">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">Your recent recap</p>
                    <h2 className="mt-1 text-lg font-semibold text-base-content">
                        {recap.weekDeltaWpm === null ? "Keep building comparable WPM proof" : `${recap.weekDeltaWpm >= 0 ? "+" : ""}${recap.weekDeltaWpm.toFixed(1)} WPM versus the prior week`}
                    </h2>
                </div>
                <button type="button" onClick={dismiss} aria-label="Dismiss recent recap" className="rounded px-2 py-1 text-base-content/45 hover:bg-base-content/10">×</button>
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <p><strong className="font-mono text-base-content">{recap.testsThisWeek}</strong> <span className="text-base-content/60">Tests this week</span></p>
                <p><strong className="font-mono text-base-content">{recap.coachingSessions}</strong> <span className="text-base-content/60">coaching sessions completed</span></p>
                <p><strong className="font-mono text-base-content">{recap.streak}</strong> <span className="text-base-content/60">day streak</span></p>
            </div>
            {recap.retained && (
                <p className="mt-3 text-sm text-base-content/70">
                    Retained: <strong className="font-mono text-base-content">{recap.retained.label}</strong> · {metric(recap.retained.baseline, recap.retained.metric)} → {metric(recap.retained.latest, recap.retained.metric)}
                </p>
            )}
            {recap.action ? (
                <Link href={recap.action.href} className="mt-3 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content">
                    {recap.action.state === "due" ? `Check ${recap.action.label}` : recap.action.state === "regressed" ? `Refresh ${recap.action.label}` : `Work on ${recap.action.label}`}
                </Link>
            ) : recap.focus ? (
                <Link href={`/drill?keys=${encodeURIComponent(recap.focus.key)}`} className="mt-3 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content">
                    Drill {recap.focus.key}
                </Link>
            ) : null}
        </section>
    )
}
