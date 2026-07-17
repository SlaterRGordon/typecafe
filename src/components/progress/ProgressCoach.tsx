import Link from "next/link"
import { useMemo, useState, type ReactNode } from "react"
import {
    filterProgressCoachTargets,
    progressImpactTone,
    type ProgressCoachFilter,
    type ProgressCoachProjection,
    type ProgressCoachTarget,
    type ProgressImpactTone,
} from "~/lib/progressCoach"

interface ProgressCoachProps {
    projection: ProgressCoachProjection | null
    loading: boolean
}

const FILTERS: { key: ProgressCoachFilter, label: string }[] = [
    { key: "all", label: "All" },
    { key: "transition", label: "Transitions" },
    { key: "key", label: "Keys" },
    { key: "pattern", label: "Patterns" },
    { key: "movement", label: "Movements" },
]

const WORTH_TONE: Record<ProgressImpactTone, { text: string, border: string, cap: string, bar: string }> = {
    urgent: {
        text: "text-error",
        border: "border-l-error",
        cap: "border-error/50 bg-error/20 text-error",
        bar: "bg-error",
    },
    material: {
        text: "text-warning",
        border: "border-l-warning",
        cap: "border-warning/50 bg-warning/20 text-warning",
        bar: "bg-warning",
    },
    minor: {
        text: "text-success",
        border: "border-l-success",
        cap: "border-success/50 bg-success/20 text-success",
        bar: "bg-success",
    },
}

function stateTone(target: ProgressCoachTarget): string {
    if (target.state === "due") return "text-warning"
    if (target.state === "regressed") return "text-error"
    if (target.state === "retained") return "text-success"
    if (target.state === "transferred") return "text-info"
    return "text-primary"
}

function trendTone(target: ProgressCoachTarget): string {
    if (target.trend?.outcome === "good") return "text-success"
    if (target.trend?.outcome === "bad") return "text-error"
    return "text-base-content/40"
}

function worthLabel(target: ProgressCoachTarget): string {
    return target.impactMsPer1000 === null
        ? "—"
        : `~${(target.impactMsPer1000 / 1_000).toFixed(1)}s / 1k chars`
}

function usesArrow(target: ProgressCoachTarget): boolean {
    return target.target?.kind === "transition" || target.target?.kind === "movement" || target.target?.kind === "correction"
}

function TargetGlyph({ target, tone, compact = false }: { target: ProgressCoachTarget, tone: ProgressImpactTone, compact?: boolean }) {
    const keys = target.visualKeys
    if (keys.length === 0) {
        return <span className="font-mono text-sm font-semibold text-primary">{target.label}</span>
    }
    const capSize = compact ? "h-7 min-w-7 px-1.5 text-sm" : "h-6 min-w-6 px-1 text-xs"
    return (
        <span className="flex w-28 shrink-0 items-center gap-1" aria-label={target.label}>
            {keys.map((key, index) => (
                <span key={`${key}-${index}`} className="contents">
                    {index > 0 && usesArrow(target) && <span aria-hidden="true" className="text-xs text-base-content/45">→</span>}
                    <span aria-hidden="true" className={`inline-flex ${capSize} items-center justify-center rounded-md border font-mono font-semibold shadow-sm ${WORTH_TONE[tone].cap}`}>
                        {key}
                    </span>
                </span>
            ))}
        </span>
    )
}

function CoachHeadline({ target, tone }: { target: ProgressCoachTarget, tone: ProgressImpactTone }) {
    if (!target.target) return <h2 className="text-xl font-bold leading-tight text-base-content">{target.headline}</h2>
    const before: Record<Exclude<ProgressCoachTarget["state"], "calibrating">, string> = {
        "needs-work": target.metric === "%" ? "Sharpen" : "Speed up",
        due: "See whether",
        regressed: "Refresh",
        training: "Keep building",
        transferred: "Improved in varied text",
        retained: "Gain held for",
    }
    return (
        <h2 className="mt-1.5 text-xl font-bold leading-tight text-base-content">
            <span className="sr-only">{target.headline}</span>
            <span aria-hidden="true" className="flex flex-wrap items-center gap-2">
                <span>{before[target.state as Exclude<ProgressCoachTarget["state"], "calibrating">]}</span>
                <TargetGlyph target={target} tone={tone} compact />
                {target.state === "due" && <span>held</span>}
                {target.impactMsPer1000 !== null && <span className={`font-mono text-base ${WORTH_TONE[tone].text}`}>{worthLabel(target)}</span>}
            </span>
        </h2>
    )
}

function ProofLine({ target }: { target: ProgressCoachTarget }) {
    const first = target.stages[0]
    const last = target.stages.at(-1)
    if (!first) return null
    return (
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-base-content/60" aria-label={`${target.label} proof stages`}>
            <span><span className="text-base-content/40">{first.label}</span> <strong className="text-base-content/85">{first.value}</strong></span>
            {last && last.key !== first.key && (
                <>
                    <span aria-hidden="true" className="text-base-content/35">→</span>
                    <span><span className="text-base-content/40">{last.label}</span> <strong className="text-base-content/85">{last.value}</strong></span>
                </>
            )}
            {target.trend && <span className={`font-semibold ${trendTone(target)}`}>{target.trend.label}</span>}
        </div>
    )
}

function CoachSummary({ target, tone, contextLabel, action, extra }: { target: ProgressCoachTarget, tone: ProgressImpactTone, contextLabel: string, action: ReactNode, extra?: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
            <div className="min-w-0">
                <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-base-content/50">
                    <span className={`h-1.5 w-1.5 rounded-full ${target.state === "regressed" ? "bg-error" : target.state === "due" ? "bg-warning" : "bg-primary"}`} />
                    <span>Coach · {contextLabel}</span>
                    <span className={stateTone(target)}>{target.statusLabel}</span>
                </div>
                <CoachHeadline target={target} tone={tone} />
                <ProofLine target={target} />
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-base-content/55">{target.detail}</p>
                {extra}
            </div>
            {action}
        </div>
    )
}

function ActionLink({ target, compact = false }: { target: ProgressCoachTarget, compact?: boolean }) {
    if (!target.action) return null
    return (
        <Link
            href={target.action.href}
            className={`${compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm"} inline-flex shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
        >
            {target.action.label}
        </Link>
    )
}

export function ProgressCoach({ projection, loading }: ProgressCoachProps) {
    const [filter, setFilter] = useState<ProgressCoachFilter>("all")
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [showAllTargets, setShowAllTargets] = useState(false)
    const rows = useMemo(
        () => projection ? filterProgressCoachTargets(projection.targets, filter) : [],
        [filter, projection],
    )
    const selected = projection?.targets.find((row) => row.id === selectedId) ?? null
    const detail = selected ?? projection?.nextAction ?? null
    const maxImpact = useMemo(
        () => Math.max(0, ...(projection?.targets.map((target) => target.impactMsPer1000 ?? 0) ?? [])),
        [projection],
    )
    const counts = useMemo(() => new Map(FILTERS.map((item) => [
        item.key,
        item.key === "all" ? projection?.targets.length ?? 0 : projection?.targets.filter((target) => target.filter === item.key).length ?? 0,
    ])), [projection])
    const hasNextAction = !!projection?.nextAction.action

    if (loading || !projection || !detail) {
        return (
            <section data-testid="progress-coach-loading" aria-busy="true" className="min-h-80 animate-pulse rounded-xl border border-base-content/10 bg-base-100/45 p-4">
                <div className="h-4 w-28 rounded bg-base-content/10" />
                <div className="mt-5 h-8 w-3/4 rounded bg-base-content/10" />
                <div className="mt-4 h-16 rounded bg-base-content/10" />
            </section>
        )
    }

    const detailTone = progressImpactTone(detail.impactMsPer1000)
    const nextTone = progressImpactTone(projection.nextAction.impactMsPer1000)

    return (
        <section data-testid="progress-coach" className="overflow-hidden rounded-xl border border-primary/25 bg-base-100/45 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
            <div data-testid="coach-detail" aria-live="polite" className="p-4 lg:shrink-0">
                <div className="hidden lg:block">
                    {selected && (
                        <div className="mb-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSelectedId(null)}
                                className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                                Back to {hasNextAction ? "next action" : "latest result"}: {projection.nextAction.label}
                            </button>
                        </div>
                    )}
                    <CoachSummary
                        target={detail}
                        tone={detailTone}
                        contextLabel={selected ? "Target detail" : hasNextAction ? "Next action" : "Latest result"}
                        action={<ActionLink target={detail} compact />}
                        extra={selected && detail.episodes.length > 1 ? (
                            <ul className="mt-2 flex flex-wrap gap-1.5 text-[0.65rem] text-base-content/50" aria-label={`${detail.label} qualifying episodes`}>
                                {detail.episodes.map((episode) => (
                                    <li key={episode.id} className="rounded border border-base-content/10 px-1.5 py-1">
                                        {episode.date} · {episode.statusLabel} · {episode.stages[0]?.value} → {episode.stages.at(-1)?.value}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    />
                </div>
                <div className="lg:hidden">
                    <CoachSummary target={projection.nextAction} tone={nextTone} contextLabel={hasNextAction ? "Next action" : "Latest result"} action={null} />
                    <div className="mt-3"><ActionLink target={projection.nextAction} /></div>
                </div>
            </div>

            <div className="border-t border-base-content/10 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-base-content">Your targets</h2>
                        <p className="mt-0.5 whitespace-nowrap text-[0.65rem] text-base-content/45">ranked by estimated worth · hover to practice</p>
                    </div>
                    <div data-testid="coach-target-filters" className="flex w-fit max-w-full shrink-0 gap-0.5 overflow-x-auto rounded-md border border-base-content/15 bg-base-200/50 p-0.5">
                        {FILTERS.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                aria-pressed={filter === item.key}
                                onClick={() => {
                                    setFilter(item.key)
                                    setShowAllTargets(false)
                                    if (selected && item.key !== "all" && selected.filter !== item.key) setSelectedId(null)
                                }}
                                className={`min-h-7 whitespace-nowrap rounded px-2 text-[0.65rem] font-medium transition-colors ${filter === item.key ? "bg-primary text-primary-content shadow-sm" : "text-base-content/65 hover:bg-base-content/5"}`}
                            >
                                {item.label} <span className="font-mono text-[0.6rem] opacity-70">{counts.get(item.key)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="hidden grid-cols-[minmax(0,1fr)_4.25rem_3.75rem_6.25rem] gap-2 border-y border-base-content/10 px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-base-content/40 lg:grid">
                    <span>Target</span><span className="text-right">Recent</span><span className="text-right">Trend</span><span className="text-right">Worth</span>
                </div>

                {rows.length === 0 ? (
                    <p data-testid="coach-targets-empty" className="px-4 py-8 text-center text-sm text-base-content/45 lg:flex lg:flex-1 lg:items-center lg:justify-center">
                        {projection.targets.length === 0 ? "Take a longer Test to find supported Targets." : "No recent Targets match this filter."}
                    </p>
                ) : (
                    <div data-testid="coach-target-scroll" className="min-h-0 lg:flex-1 lg:overflow-y-auto">
                        <ul aria-label="Recent typing Targets" className="divide-y divide-base-content/10">
                            {rows.map((row, index) => {
                                const expanded = selectedId === row.id
                                const tone = progressImpactTone(row.impactMsPer1000)
                                const latest = row.stages.at(-1)
                                const fill = maxImpact > 0 ? Math.max(4, Math.round(((row.impactMsPer1000 ?? 0) / maxImpact) * 100)) : 0
                                return (
                                    <li key={row.id} data-testid={`coach-target-row-${row.id}`} className={`group relative border-l-2 ${WORTH_TONE[tone].border} ${index >= 5 && !showAllTargets ? "hidden lg:list-item" : ""}`}>
                                        <div className={`relative px-3 transition ${expanded ? "bg-base-content/7" : "hover:bg-base-content/5"} ${row.isNextAction ? "ring-1 ring-inset ring-warning/45" : ""} lg:grid lg:grid-cols-[minmax(0,1fr)_6.25rem]`}>
                                            <button
                                                type="button"
                                                aria-expanded={expanded}
                                                onClick={() => setSelectedId(expanded ? null : row.id)}
                                                className="grid min-h-[4.25rem] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary lg:col-span-1 lg:grid-cols-[minmax(0,1fr)_4.25rem_3.75rem]"
                                            >
                                                <span className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] items-center">
                                                    <TargetGlyph target={row} tone={tone} />
                                                    <span className="min-w-0">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="truncate text-xs font-semibold text-base-content">{row.typeLabel}</span>
                                                            <span className={`flex shrink-0 items-center gap-1 text-[0.6rem] ${stateTone(row)}`}>
                                                                <span className="h-1 w-1 rounded-full bg-current" />{row.statusLabel}
                                                            </span>
                                                        </span>
                                                        <span className="mt-1 block truncate font-mono text-[0.62rem] text-base-content/40">{row.description}</span>
                                                    </span>
                                                </span>
                                                <span className="font-mono text-[0.65rem] text-base-content/80 lg:text-right">
                                                    <span className="lg:hidden">{worthLabel(row)}</span>
                                                    <span className="hidden lg:inline">{latest?.value ?? "—"}</span>
                                                </span>
                                                <span className={`hidden text-right font-mono text-[0.65rem] font-semibold lg:block ${trendTone(row)}`}>{row.trend?.label ?? "—"}</span>
                                            </button>
                                            <div className="relative hidden min-h-[4.25rem] items-center justify-end lg:flex">
                                                <span className={`flex items-center gap-1.5 transition-opacity ${row.action ? "group-hover:opacity-0 group-focus-within:opacity-0" : ""}`}>
                                                    <span className="h-1.5 w-9 overflow-hidden rounded-full bg-base-content/10">
                                                        <span className={`block h-full rounded-full ${WORTH_TONE[tone].bar}`} style={{ width: `${fill}%` }} />
                                                    </span>
                                                    <span className={`whitespace-nowrap font-mono text-[0.62rem] ${WORTH_TONE[tone].text}`}>{worthLabel(row)}</span>
                                                </span>
                                                {row.action && (
                                                    <Link
                                                        href={row.action.href}
                                                        aria-label={row.action.label}
                                                        className="absolute right-0 inline-flex min-h-8 items-center rounded-md border border-primary/45 px-2 text-[0.65rem] font-semibold text-primary opacity-0 transition hover:bg-primary/10 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                                    >
                                                        {row.state === "due" ? "Check" : row.state === "regressed" ? "Refresh" : "Practice"}
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                        {expanded && (
                                            <div data-testid="coach-inline-detail" className="mx-3 mb-3 rounded-lg border border-base-content/15 bg-base-200/35 p-3 lg:hidden">
                                                <p className="text-sm text-base-content/70">{row.detail}</p>
                                                <ProofLine target={row} />
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
                                                {row.action && <div className="mt-3"><ActionLink target={row} /></div>}
                                            </div>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )}

                {rows.length > 5 && (
                    <button
                        type="button"
                        onClick={() => {
                            if (showAllTargets && selected && rows.findIndex((row) => row.id === selected.id) >= 5) setSelectedId(null)
                            setShowAllTargets((expanded) => !expanded)
                        }}
                        className="m-3 min-h-11 rounded-md border border-base-content/15 px-3 text-sm font-semibold text-base-content/70 lg:hidden"
                    >
                        {showAllTargets ? "Show fewer Targets" : `Show ${rows.length - 5} more Targets`}
                    </button>
                )}

                <div className="hidden items-center justify-between border-t border-base-content/10 px-3 py-2 font-mono text-[0.6rem] text-base-content/40 lg:flex">
                    <span className="flex items-center gap-1">worth fixing <span className="h-1.5 w-2 rounded-sm bg-error" /><span className="h-1.5 w-2 rounded-sm bg-warning" /><span className="h-1.5 w-2 rounded-sm bg-success" /> doing fine</span>
                    <span><span className="text-success">improving</span> · <span className="text-error">slipping</span></span>
                </div>
            </div>
        </section>
    )
}
