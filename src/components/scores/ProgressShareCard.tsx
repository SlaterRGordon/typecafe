import { useMemo } from "react"
import Link from "next/link"
import { TrendChart } from "~/components/progress/TrendChart"
import { defaultRollingWindow, rollingAverage } from "~/lib/progress"

export interface ProgressShareSnapshot {
    deltaWpm: number
    periodLabel: string
    points: { t: number; wpm: number }[]
    streak?: number
    username?: string | null
    generatedAt: number
}

function isProgressSnapshot(value: unknown): value is ProgressShareSnapshot {
    if (!value || typeof value !== "object") return false
    const s = value as Partial<ProgressShareSnapshot>
    return typeof s.deltaWpm === "number"
        && typeof s.periodLabel === "string"
        && Array.isArray(s.points)
}

export { isProgressSnapshot }

// The shareable "+18 WPM in 60 days" card — a brag available to every user, not
// just fast ones (vision §7). Renders the headline delta and the trend; reuses
// the /progress TrendChart so the shared view matches the dashboard.
export function ProgressShareCard(props: { snapshot: ProgressShareSnapshot; shareUrl?: string }) {
    const { snapshot } = props
    const positive = snapshot.deltaWpm >= 0

    const chart = useMemo(() => {
        const points = snapshot.points.map((p) => ({ t: p.t, wpm: p.wpm, accuracy: 0 }))
        const window = defaultRollingWindow(points.length)
        return { points, values: points.map((p) => p.wpm), rolling: rollingAverage(points.map((p) => p.wpm), window) }
    }, [snapshot.points])

    return (
        <div
            data-testid="progress-share-card"
            className="w-full max-w-2xl rounded-xl border border-base-content/15 bg-base-200 p-5 text-base-content shadow-2xl shadow-base-300/40 sm:p-6"
        >
            <div className="flex items-center justify-between">
                <span className="font-mono text-xl font-bold tracking-tight">TypeCafe</span>
                {typeof snapshot.streak === "number" && snapshot.streak > 0 &&
                    <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">{snapshot.streak}-day streak</span>
                }
            </div>

            <div className="mt-5">
                <div className="flex items-baseline gap-2">
                    <span data-testid="progress-share-delta" className={`font-mono text-5xl font-bold ${positive ? "text-success" : "text-error"}`}>
                        {positive ? "+" : ""}{snapshot.deltaWpm.toFixed(1)}
                    </span>
                    <span className="text-2xl font-semibold text-base-content/70">WPM</span>
                </div>
                <p className="mt-1 text-base-content/60">
                    {snapshot.username ? `@${snapshot.username} · ` : ""}in {snapshot.periodLabel}
                </p>
            </div>

            <div className="mt-5">
                <TrendChart title="WPM over time" points={chart.points} values={chart.values} rolling={chart.rolling} baseline="zero" />
            </div>

            <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-base-content/50">typecafe.app</span>
                <Link href="/" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                    Track your progress
                </Link>
            </div>
        </div>
    )
}
