import Link from "next/link"
import { useMemo, useState } from "react"
import {
    filterProgressCoachHistory,
    type ProgressCoachFilter,
    type ProgressCoachProjection,
    type ProgressCoachTarget,
} from "~/lib/progressCoach"

interface ProgressCoachProps {
    projection: ProgressCoachProjection | null
    loading: boolean
}

const FILTERS: { key: ProgressCoachFilter, label: string }[] = [
    { key: "all", label: "All" },
    { key: "needs-action", label: "Needs action" },
    { key: "held", label: "Held" },
]

function stateTone(target: ProgressCoachTarget): string {
    if (target.state === "due") return "text-warning"
    if (target.state === "regressed") return "text-error"
    if (target.state === "retained") return "text-success"
    if (target.state === "transferred") return "text-info"
    return "text-primary"
}

export function ProgressCoach({ projection, loading }: ProgressCoachProps) {
    const [filter, setFilter] = useState<ProgressCoachFilter>("all")
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [showAllHistory, setShowAllHistory] = useState(false)
    const rows = useMemo(
        () => projection ? filterProgressCoachHistory(projection.history, filter) : [],
        [filter, projection],
    )
    const selected = projection?.history.find((row) => row.id === selectedId) ?? null
    const detail = selected ?? projection?.nextAction ?? null

    if (loading || !projection || !detail) {
        return (
            <section data-testid="progress-coach-loading" aria-busy="true" className="min-h-80 animate-pulse rounded-xl border border-base-content/10 bg-base-100/45 p-4">
                <div className="h-4 w-28 rounded bg-base-content/10" />
                <div className="mt-5 h-8 w-3/4 rounded bg-base-content/10" />
                <div className="mt-4 h-16 rounded bg-base-content/10" />
            </section>
        )
    }

    return (
        <section data-testid="progress-coach" className="overflow-hidden rounded-xl border border-primary/25 bg-base-100/45">
            <div data-testid="coach-detail" aria-live="polite" className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-base-content/55">
                        <span className="hidden lg:inline">{selected ? "Target detail" : "Coach · Next action"}</span>
                        <span className="lg:hidden">Coach · Next action</span>
                    </p>
                    {selected && (
                        <button
                            type="button"
                            onClick={() => setSelectedId(null)}
                            className="hidden text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:inline"
                        >
                            Back to next action: {projection.nextAction.label}
                        </button>
                    )}
                </div>
                <div className="mt-3 hidden lg:block">
                    <div className={`text-sm font-semibold ${stateTone(detail)}`}>{detail.statusLabel}</div>
                    <h2 className="mt-1 text-2xl font-bold leading-tight text-base-content">{detail.headline}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-base-content/70">{detail.detail}</p>
                    {detail.impact && <p className="mt-2 text-xs text-base-content/50">{detail.impact}</p>}
                </div>
                <div className="mt-3 lg:hidden">
                    <div className={`text-sm font-semibold ${stateTone(projection.nextAction)}`}>{projection.nextAction.statusLabel}</div>
                    <h2 className="mt-1 text-xl font-bold leading-tight text-base-content">{projection.nextAction.headline}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-base-content/70">{projection.nextAction.detail}</p>
                    {projection.nextAction.impact && <p className="mt-2 text-xs text-base-content/50">{projection.nextAction.impact}</p>}
                </div>

                {(detail.stages.length > 0 || projection.nextAction.stages.length > 0) && (
                    <div className="mt-4 hidden grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2 lg:grid" aria-label={`${detail.label} proof stages`}>
                        {detail.stages.map((stage, index) => (
                            <div key={stage.key} className="relative rounded-lg border border-base-content/10 bg-base-200/40 px-3 py-2">
                                <div className="text-[0.65rem] font-bold uppercase tracking-wide text-base-content/45">{stage.label}</div>
                                <div className="mt-1 font-mono text-lg font-bold text-base-content">{stage.value}</div>
                                {stage.sampleCount > 0 && <div className="text-[0.65rem] text-base-content/45">{stage.sampleCount} samples</div>}
                                {index < detail.stages.length - 1 && <span aria-hidden="true" className="absolute -right-2.5 top-1/2 z-10 -translate-y-1/2 text-base-content/35">→</span>}
                            </div>
                        ))}
                    </div>
                )}
                {selected && detail.episodes.length > 1 && (
                    <div className="mt-4 hidden lg:block">
                        <p className="text-xs font-bold uppercase tracking-wide text-base-content/45">Qualifying episodes</p>
                        <ul className="mt-2 space-y-1 text-xs text-base-content/60" aria-label={`${detail.label} qualifying episodes`}>
                            {detail.episodes.map((episode) => (
                                <li key={episode.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-base-content/10 px-2 py-1.5">
                                    <span>{episode.date} · {episode.statusLabel}</span>
                                    <span>{episode.stages[0]?.value} → {episode.stages.at(-1)?.value}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {projection.nextAction.stages.length > 0 && (
                    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2 lg:hidden" aria-label={`${projection.nextAction.label} proof stages`}>
                        {projection.nextAction.stages.map((stage) => (
                            <div key={stage.key} className="rounded-lg border border-base-content/10 bg-base-200/40 px-3 py-2">
                                <div className="text-[0.65rem] font-bold uppercase tracking-wide text-base-content/45">{stage.label}</div>
                                <div className="mt-1 font-mono text-base font-bold text-base-content">{stage.value}</div>
                            </div>
                        ))}
                    </div>
                )}
                {detail.action && (
                    <Link href={detail.action.href} className="mt-4 hidden min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:inline-flex">
                        {detail.action.label}
                    </Link>
                )}
                {projection.nextAction.action && (
                    <Link href={projection.nextAction.action.href} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden">
                        {projection.nextAction.action.label}
                    </Link>
                )}
            </div>

            <div className="border-t border-base-content/10 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-base-content">What your practice changed</h2>
                        <p className="text-xs text-base-content/45">Recent history · up to {projection.historyLimit} Targets</p>
                    </div>
                    <div data-testid="coach-history-filters" className="flex w-fit gap-1 rounded-lg border border-base-content/15 bg-base-200/50 p-1">
                        {FILTERS.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                aria-pressed={filter === item.key}
                                onClick={() => {
                                    setFilter(item.key)
                                    setShowAllHistory(false)
                                    if (selected && item.key !== "all" && selected.filter !== item.key) setSelectedId(null)
                                }}
                                className={`min-h-8 rounded-md px-2.5 text-xs font-medium transition-colors ${filter === item.key ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-content/5"}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {rows.length === 0 ? (
                    <p data-testid="coach-history-empty" className="py-8 text-center text-sm text-base-content/45">
                        {projection.history.length === 0 ? "Finish a coaching Target to build proof history here." : "No recent Targets match this filter."}
                    </p>
                ) : (
                    <ul aria-label="Recent coaching Target history" className="mt-3 divide-y divide-base-content/10">
                        {rows.map((row, index) => {
                            const expanded = selectedId === row.id
                            return (
                                <li key={row.id} data-testid={`coach-history-row-${row.id}`} className={`relative py-2 ${index >= 5 && !showAllHistory ? "hidden lg:list-item" : ""} ${row.isNextAction ? "border-l-2 border-warning pl-2" : ""}`}>
                                    <div className={`flex items-center gap-2 rounded-lg border px-2 py-2 transition ${expanded ? "border-base-content/35 bg-base-content/5" : "border-transparent hover:bg-base-content/5"}`}>
                                        <button
                                            type="button"
                                            aria-expanded={expanded}
                                            onClick={() => setSelectedId(expanded ? null : row.id)}
                                            className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                        >
                                            <span className="flex items-center justify-between gap-3">
                                                <span>
                                                    <span className="font-mono text-sm font-bold text-base-content">{row.label}</span>
                                                    {row.episodeCount > 1 && <span className="ml-2 text-[0.65rem] text-base-content/40">{row.episodeCount} episodes</span>}
                                                </span>
                                                <span className={`shrink-0 text-xs font-semibold ${stateTone(row)}`}>{row.statusLabel}</span>
                                            </span>
                                            {row.stages.length >= 2 && (
                                                <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-base-content/55">
                                                    <span>{row.stages[0]!.label} {row.stages[0]!.value}</span>
                                                    <span aria-hidden="true">→</span>
                                                    <span>{row.stages.at(-1)!.label} {row.stages.at(-1)!.value}</span>
                                                </span>
                                            )}
                                        </button>
                                        {row.action && (
                                            <Link href={row.action.href} className="hidden min-h-9 shrink-0 items-center rounded-md border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10 sm:inline-flex">
                                                {row.action.label}
                                            </Link>
                                        )}
                                    </div>
                                    {expanded && (
                                        <div data-testid="coach-inline-detail" className="mt-2 rounded-lg border border-base-content/15 bg-base-200/35 p-3 lg:hidden">
                                            <p className="text-sm text-base-content/70">{row.detail}</p>
                                            {row.stages.length > 0 && (
                                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-base-content/60">
                                                    {row.stages.map((stage, index) => (
                                                        <span key={stage.key} className="contents">
                                                            {index > 0 && <span aria-hidden="true">→</span>}
                                                            <span><strong className="text-base-content/80">{stage.label}</strong> {stage.value}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {row.episodes.length > 1 && (
                                                <ul className="mt-3 space-y-1 border-t border-base-content/10 pt-2 text-xs text-base-content/60" aria-label={`${row.label} qualifying episodes`}>
                                                    {row.episodes.map((episode) => (
                                                        <li key={episode.id} className="flex flex-wrap justify-between gap-2">
                                                            <span>{episode.date} · {episode.statusLabel}</span>
                                                            <span>{episode.stages[0]?.value} → {episode.stages.at(-1)?.value}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {row.action && (
                                                <Link href={row.action.href} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-primary/40 px-3 py-2 text-sm font-semibold text-primary">
                                                    {row.action.label}
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
                {rows.length > 5 && (
                    <button
                        type="button"
                        onClick={() => {
                            if (showAllHistory && selected && rows.findIndex((row) => row.id === selected.id) >= 5) setSelectedId(null)
                            setShowAllHistory((expanded) => !expanded)
                        }}
                        className="mt-2 min-h-11 w-full rounded-md border border-base-content/15 px-3 text-sm font-semibold text-base-content/70 lg:hidden"
                    >
                        {showAllHistory ? "Show fewer Targets" : `Show ${rows.length - 5} more Targets`}
                    </button>
                )}
            </div>
        </section>
    )
}
