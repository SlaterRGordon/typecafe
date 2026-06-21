import { useEffect, useMemo, useState } from "react"
import { projectTrajectory, type Goal } from "~/lib/trajectory"
import type { ProgressRecord } from "~/lib/progress"

const GOAL_KEY = "typecafe:goal"

interface StoredGoal {
    targetWpm: number
    targetDate: string // YYYY-MM-DD
}

function readGoal(): StoredGoal | null {
    if (typeof window === "undefined") return null
    try {
        const raw = window.localStorage.getItem(GOAL_KEY)
        if (!raw) return null
        const v = JSON.parse(raw) as Partial<StoredGoal>
        if (typeof v.targetWpm === "number" && Number.isFinite(v.targetWpm) && typeof v.targetDate === "string") {
            return { targetWpm: v.targetWpm, targetDate: v.targetDate }
        }
    } catch { /* corrupt — ignore */ }
    return null
}

function formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

// Goal trajectory (§3.5): set a target WPM + date; the card projects the current
// trend against the pace needed to hit it — honest about shortfall. The goal
// lives in localStorage (no schema, works for guests too).
export function GoalCard(props: { records: ProgressRecord[]; now: Date }) {
    const [goal, setGoal] = useState<StoredGoal | null>(null)
    const [editing, setEditing] = useState(false)
    const [wpmInput, setWpmInput] = useState("100")
    const [dateInput, setDateInput] = useState("")

    useEffect(() => {
        const stored = readGoal()
        setGoal(stored)
        if (stored) {
            setWpmInput(String(stored.targetWpm))
            setDateInput(stored.targetDate)
        }
    }, [])

    const trajectory = useMemo(() => {
        if (!goal) return null
        const parsed: Goal = { targetWpm: goal.targetWpm, targetDate: new Date(goal.targetDate) }
        if (Number.isNaN(parsed.targetDate.getTime())) return null
        return projectTrajectory(props.records, parsed, props.now)
    }, [goal, props.records, props.now])

    const save = () => {
        const targetWpm = parseInt(wpmInput, 10)
        if (!Number.isFinite(targetWpm) || targetWpm <= 0 || !dateInput) return
        const next: StoredGoal = { targetWpm, targetDate: dateInput }
        try { window.localStorage.setItem(GOAL_KEY, JSON.stringify(next)) } catch { /* blocked */ }
        setGoal(next)
        setEditing(false)
    }

    const clear = () => {
        try { window.localStorage.removeItem(GOAL_KEY) } catch { /* blocked */ }
        setGoal(null)
        setEditing(false)
    }

    // Demoted to a one-liner when there's no goal yet — the dashboard is a story,
    // not a form. Tapping it expands the editor.
    if (!editing && !goal) {
        return (
            <div data-testid="goal-card" className="rounded-xl border border-base-content/10 bg-base-100/45 px-5 py-3">
                <button type="button" onClick={() => setEditing(true)} className="flex w-full items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-base-content/45">Goal</span>
                    <span className="text-sm font-semibold text-primary">Set a goal →</span>
                </button>
            </div>
        )
    }

    if (editing) {
        return (
            <div data-testid="goal-card" className="rounded-xl border border-base-content/10 bg-base-100/45 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-base-content/45">Goal</p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                    <label className="flex flex-col text-sm text-base-content/70">
                        Target WPM
                        <input
                            type="number" min={1} value={wpmInput}
                            onChange={(e) => setWpmInput(e.target.value)}
                            className="mt-1 w-28 rounded-md border border-base-content/15 bg-base-200 px-3 py-2 font-mono text-base-content outline-none focus:border-primary"
                            aria-label="Target WPM"
                        />
                    </label>
                    <label className="flex flex-col text-sm text-base-content/70">
                        By
                        <input
                            type="date" value={dateInput}
                            onChange={(e) => setDateInput(e.target.value)}
                            className="mt-1 rounded-md border border-base-content/15 bg-base-200 px-3 py-2 font-mono text-base-content outline-none focus:border-primary"
                            aria-label="Target date"
                        />
                    </label>
                    <button type="button" onClick={save} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                        {goal ? "Update goal" : "Set goal"}
                    </button>
                    {goal && (
                        <button type="button" onClick={clear} className="rounded-md px-3 py-2 text-sm text-base-content/55 hover:text-base-content">Remove</button>
                    )}
                </div>
            </div>
        )
    }

    // Reached only when a goal exists and we're not editing: the compact status.
    if (!goal) return null

    return (
        <div data-testid="goal-card" className="rounded-xl border border-base-content/10 bg-base-100/45 p-5">
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-base-content/45">Goal</p>
                <button type="button" onClick={() => setEditing(true)} className="text-sm text-base-content/55 hover:text-base-content">Edit</button>
            </div>
            <p className="mt-1 text-lg font-semibold text-base-content">{goal.targetWpm} WPM by {formatDate(new Date(goal.targetDate))}</p>

            {!trajectory || !trajectory.enoughData ? (
                <p className="mt-2 text-sm text-base-content/60">Keep testing — once there&apos;s a trend to read, we&apos;ll project whether you&apos;re on pace.</p>
            ) : trajectory.gapWpm <= 0 ? (
                <p data-testid="goal-status" className="mt-2 text-sm font-medium text-success">Already there — you&apos;re averaging {trajectory.currentWpm.toFixed(1)} WPM. Time for a higher target.</p>
            ) : trajectory.onTrack ? (
                <p data-testid="goal-status" className="mt-2 text-sm font-medium text-success">
                    On track — at your current pace ({(trajectory.slopePerDay * 7).toFixed(1)} WPM/week) you&apos;ll hit {goal.targetWpm} around {trajectory.reachesTargetOn ? formatDate(trajectory.reachesTargetOn) : "soon"}.
                </p>
            ) : (
                <p data-testid="goal-status" className="mt-2 text-sm font-medium text-error">
                    {trajectory.reachesTargetOn
                        ? `Behind — at this pace you reach ${goal.targetWpm} around ${formatDate(trajectory.reachesTargetOn)}.`
                        : `Behind — your trend is flat, so you won't reach ${goal.targetWpm} at this pace.`}
                    {trajectory.requiredSlopePerDay !== null
                        ? ` To hit ${formatDate(new Date(goal.targetDate))}, gain ~${(trajectory.requiredSlopePerDay * 7).toFixed(1)} WPM/week (you're at ${(trajectory.slopePerDay * 7).toFixed(1)}).`
                        : " That date has passed — pick a new one."}
                </p>
            )}
        </div>
    )
}
