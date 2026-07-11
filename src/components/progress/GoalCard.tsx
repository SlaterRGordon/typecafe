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
    } catch { /* corrupt - ignore */ }
    return null
}

function formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

const clampPct = (value: number) => Math.max(0, Math.min(100, value))

// Goal trajectory (§3.5), folded into the hero: a target WPM + date becomes a
// progress bar (where you are vs the goal, plus where you're projected to land by
// the deadline) and an honest on-track / behind / ahead read. Renders borderless
// so it sits under the hero delta. Goal lives in localStorage (works for guests).
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

    // No goal yet: a one-liner that expands the editor.
    if (!editing && !goal) {
        return (
            <div data-testid="goal-card" className="mt-4">
                <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-primary hover:opacity-85">
                    Set a goal →
                </button>
            </div>
        )
    }

    if (editing) {
        return (
            <div data-testid="goal-card" className="mt-4 border-t border-base-content/10 pt-4">
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

    if (!goal) return null

    // Where the fitted trend lands by the deadline - the "projected" marker.
    const projectedWpm = trajectory && trajectory.enoughData
        ? trajectory.currentWpm + trajectory.slopePerDay * trajectory.daysToDeadline
        : null
    const currentPct = trajectory ? clampPct((trajectory.currentWpm / goal.targetWpm) * 100) : 0
    const projectedPct = projectedWpm !== null ? clampPct((projectedWpm / goal.targetWpm) * 100) : null

    return (
        <div data-testid="goal-card" className="mt-4 border-t border-base-content/10 pt-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-base-content/70">Goal: <span className="font-semibold text-base-content">{goal.targetWpm} WPM</span> by {formatDate(new Date(goal.targetDate))}</p>
                <button type="button" onClick={() => setEditing(true)} className="text-xs text-base-content/55 hover:text-base-content">Edit</button>
            </div>

            {/* Progress toward the goal, with a marker for where the current pace
                projects you to land by the deadline. */}
            <div className="relative mt-3 h-2.5 rounded-full bg-base-content/10">
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${currentPct}%` }} />
                {projectedPct !== null && (
                    <div
                        className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-base-content/45"
                        style={{ left: `calc(${projectedPct}% - 1px)` }}
                        title={`Projected ${projectedWpm!.toFixed(0)} WPM by the deadline`}
                    />
                )}
            </div>
            <div className="mt-1 flex justify-between text-xs text-base-content/50">
                <span>{(trajectory?.currentWpm ?? 0).toFixed(0)} now</span>
                <span>{goal.targetWpm} goal</span>
            </div>

            {!trajectory || !trajectory.enoughData ? (
                <p data-testid="goal-status" className="mt-2 text-sm text-base-content/60">Keep testing - once there&apos;s a trend, we&apos;ll project whether you&apos;re on pace.</p>
            ) : trajectory.gapWpm <= 0 ? (
                <p data-testid="goal-status" className="mt-2 text-sm font-medium text-success">Already there - you&apos;re averaging {trajectory.currentWpm.toFixed(1)} WPM. Time for a higher target.</p>
            ) : trajectory.onTrack ? (
                <p data-testid="goal-status" className="mt-2 text-sm font-medium text-success">
                    On track - at +{(trajectory.slopePerDay * 7).toFixed(1)} WPM/week you&apos;ll hit {goal.targetWpm} around {trajectory.reachesTargetOn ? formatDate(trajectory.reachesTargetOn) : "soon"}.
                </p>
            ) : (
                <p data-testid="goal-status" className="mt-2 text-sm font-medium text-error">
                    Behind - {projectedWpm !== null ? `you're projected to reach ~${projectedWpm.toFixed(0)} WPM by ${formatDate(new Date(goal.targetDate))}. ` : ""}
                    {trajectory.requiredSlopePerDay !== null
                        ? `Need +${(trajectory.requiredSlopePerDay * 7).toFixed(1)} WPM/week (you're at +${(trajectory.slopePerDay * 7).toFixed(1)}).`
                        : "That date has passed - pick a new one."}
                </p>
            )}
        </div>
    )
}
