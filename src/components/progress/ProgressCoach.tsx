import Link from "next/link"
import { useMemo, useState, type ReactNode } from "react"
import { useHeatmapColors } from "~/components/heatmap/KeyHeatmap"
import { accuracyColor } from "~/lib/heatmap"
import {
    filterProgressCoachTargets,
    progressImpactTone,
    type ProgressCoachFilter,
    type ProgressCoachProjection,
    type ProgressCoachTarget,
    type ProgressImpactTone,
} from "~/lib/progressCoach"
import { readableTextColor } from "~/utils/convertColor"

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

const IMPACT_TONES: readonly ProgressImpactTone[] = ["urgent", "material", "moderate", "minor"]
const IMPACT_ACCURACY: Record<ProgressImpactTone, number> = {
    urgent: 80,
    material: 87,
    moderate: 94,
    minor: 100,
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

function rowStatus(target: ProgressCoachTarget): { label: string, className: string } | null {
    if (target.state === "transferred" || target.state === "retained") {
        return { label: "improved", className: "text-success" }
    }
    return null
}

function worthLabel(target: ProgressCoachTarget): string {
    return target.impactMsPer1000 === null
        ? "—"
        : `~${(target.impactMsPer1000 / 1_000).toFixed(1)}s / 1k chars`
}

function usesArrow(target: ProgressCoachTarget): boolean {
    return target.target?.kind === "transition" || target.target?.kind === "movement" || target.target?.kind === "correction"
}

function TargetGlyph({ target, color, compact = false }: { target: ProgressCoachTarget, color: string, compact?: boolean }) {
    const keys = target.visualKeys
    if (keys.length === 0) {
        return <span className="font-mono text-sm font-semibold text-primary">{target.label}</span>
    }
    const capSize = compact
        ? "!h-7 !min-h-7 !min-w-7 px-1.5 text-sm"
        : "!h-6 !min-h-6 !min-w-6 px-1 text-xs"
    return (
        <span className={`typecafe-key-heatmap flex shrink-0 items-center gap-1 ${compact ? "w-auto" : "w-28"}`} aria-label={target.label}>
            {keys.map((key, index) => (
                <span key={`${key}-${index}`} className="contents">
                    {index > 0 && usesArrow(target) && <span aria-hidden="true" className="text-xs text-base-content/45">→</span>}
                    <kbd
                        aria-hidden="true"
                        className={`kbd kbd-sm inline-flex ${capSize} items-center justify-center font-mono font-semibold`}
                        style={{
                            backgroundColor: color,
                            backgroundImage: "none",
                            color: readableTextColor(color),
                            filter: "none",
                        }}
                    >
                        {key}
                    </kbd>
                </span>
            ))}
        </span>
    )
}

function CoachHeadline({ target, color }: { target: ProgressCoachTarget, color: string }) {
    if (!target.target) return <h2 className="text-xl font-bold leading-tight text-base-content">{target.headline}</h2>
    const before: Record<Exclude<ProgressCoachTarget["state"], "calibrating">, string> = {
        "needs-work": target.metric === "%" ? "Sharpen" : "Speed up",
        due: "Practise",
        regressed: "Refresh",
        training: "Keep building",
        transferred: "Improved in recent typing",
        retained: "Gain held for",
    }
    return (
        <h2 className="mt-1.5 text-xl font-bold leading-tight text-base-content">
            <span className="sr-only">{target.headline}</span>
            <span aria-hidden="true" className="flex flex-wrap items-center gap-2">
                <span>{before[target.state as Exclude<ProgressCoachTarget["state"], "calibrating">]}</span>
                <TargetGlyph target={target} color={color} compact />
                {target.impactMsPer1000 !== null && <span className="font-mono text-base" style={{ color }}>{worthLabel(target)}</span>}
            </span>
        </h2>
    )
}

function ProofLine({ target }: { target: ProgressCoachTarget }) {
    const first = target.stages[0]
    const last = target.stages.at(-1)
    if (!first) {
        return target.state === "calibrating"
            ? null
            : <p className="mt-2 font-mono text-xs text-base-content/45">No recent natural evidence for this Target.</p>
    }
    return (
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-base-content/60" aria-label={`${target.label} ability evidence`}>
            <span>
                <span className="text-base-content/40">{first.label}</span> <strong className="text-base-content/85">{first.value}</strong>
                {last?.key === first.key && first.sampleCount ? <span className="font-sans text-base-content/40"> across {first.sampleCount} attempts</span> : null}
            </span>
            {last && last.key !== first.key && (
                <>
                    <span aria-hidden="true" className="text-base-content/35">→</span>
                    <span>
                        <span className="text-base-content/40">{last.label}</span> <strong className="text-base-content/85">{last.value}</strong>
                        {last.sampleCount ? <span className="font-sans text-base-content/40"> across {last.sampleCount} attempts</span> : null}
                    </span>
                </>
            )}
            {target.trend && (
                <span className={`inline-flex items-center gap-1 font-semibold ${trendTone(target)}`}>
                    <span aria-hidden="true">{target.trend.arrow === "up" ? "▲" : "▼"}</span>
                    {target.trend.label}
                </span>
            )}
        </div>
    )
}

function PracticeLine({ target }: { target: ProgressCoachTarget }) {
    if (!target.practice) return <p className="mt-2 text-xs text-base-content/45">No drills for this Target yet.</p>
    const drills = target.practice.completedDrills
    return (
        <p data-testid="target-practice-summary" className="mt-2 text-xs text-base-content/55">
            <span className="font-semibold text-base-content/75">Practice:</span>{" "}
            {drills} {drills === 1 ? "drill" : "drills"} completed
            {target.practice.sampleCount > 0 ? ` · ${target.practice.sampleCount} target attempts` : ""}
            {target.practice.value ? <> · <span className="font-mono font-semibold text-base-content/80">{target.practice.value}</span> in drills</> : null}
        </p>
    )
}

function CoachSummary({ target, color, contextLabel, action }: { target: ProgressCoachTarget, color: string, contextLabel: string, action: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
            <div className="min-w-0">
                <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-base-content/50">
                    <span className={`h-1.5 w-1.5 rounded-full ${target.state === "regressed" ? "bg-error" : target.state === "due" ? "bg-warning" : "bg-primary"}`} />
                    <span>{contextLabel}</span>
                    <span className={stateTone(target)}>{target.statusLabel}</span>
                </div>
                <CoachHeadline target={target} color={color} />
                <ProofLine target={target} />
                <PracticeLine target={target} />
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-base-content/55 lg:sr-only">{target.detail}</p>
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
    const { lowColor, highColor } = useHeatmapColors()
    const impactPalette = useMemo(() => Object.fromEntries(
        IMPACT_TONES.map((tone) => [tone, accuracyColor(IMPACT_ACCURACY[tone], lowColor, highColor)]),
    ) as Record<ProgressImpactTone, string>, [highColor, lowColor])
    const rows = useMemo(
        () => projection ? filterProgressCoachTargets(projection.targets, filter) : [],
        [filter, projection],
    )
    const selected = projection?.targets.find((row) => row.id === selectedId) ?? null
    const detail = selected ?? projection?.defaultTarget ?? null
    const maxImpact = useMemo(
        () => Math.max(0, ...(projection?.targets.map((target) => target.impactMsPer1000 ?? 0) ?? [])),
        [projection],
    )
    const counts = useMemo(() => new Map(FILTERS.map((item) => [
        item.key,
        item.key === "all" ? projection?.targets.length ?? 0 : projection?.targets.filter((target) => target.filter === item.key).length ?? 0,
    ])), [projection])
    if (loading || !projection || !detail) {
        return (
            <section data-testid="progress-coach-loading" aria-busy="true" className="min-h-80 animate-pulse rounded-xl border border-base-content/10 bg-base-100/45 p-4">
                <div className="h-4 w-28 rounded bg-base-content/10" />
                <div className="mt-5 h-8 w-3/4 rounded bg-base-content/10" />
                <div className="mt-4 h-16 rounded bg-base-content/10" />
            </section>
        )
    }

    const detailTone = progressImpactTone(detail.impactMsPer1000, maxImpact)
    return (
        <div data-testid="progress-coach" className="flex flex-col gap-3 lg:min-h-0">
            <section data-testid="coach-detail" aria-live="polite" className="hidden rounded-xl border border-base-content/10 bg-base-100/45 p-4 lg:block lg:shrink-0">
                <div>
                    <CoachSummary
                        target={detail}
                        color={impactPalette[detailTone]}
                        contextLabel="Target detail"
                        action={<ActionLink target={detail} compact />}
                    />
                </div>
            </section>

            <section data-testid="coach-targets" className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100/45 lg:flex lg:h-[var(--progress-coach-height)] lg:min-h-0 lg:flex-none lg:flex-col">
                <div className="flex flex-col gap-2.5 px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <h2 className="text-base font-semibold text-base-content">Your targets</h2>
                        <p className="text-[0.65rem] text-base-content/45">ranked by estimated worth</p>
                    </div>
                    <div data-testid="coach-target-filters" className="flex gap-1 overflow-x-auto rounded-lg border border-base-content/10 bg-base-200/50 p-1">
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
                                className={`min-h-8 flex-1 whitespace-nowrap rounded-md px-2 text-[0.65rem] font-medium transition-colors ${filter === item.key ? "bg-primary text-primary-content shadow-sm" : "text-base-content/65 hover:bg-base-content/5"}`}
                            >
                                {item.label} <span className="font-mono text-[0.6rem] opacity-70">{counts.get(item.key)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="hidden grid-cols-[minmax(0,1fr)_5.25rem_8.25rem_8.25rem] gap-2 border-y border-base-content/10 px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-base-content/40 lg:grid">
                    <span>Target</span><span className="text-center">Ability</span><span className="text-center">Progress</span><span className="text-center">Worth</span>
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
                                const tone = progressImpactTone(row.impactMsPer1000, maxImpact)
                                const color = impactPalette[tone]
                                const status = rowStatus(row)
                                const latest = row.stages.find((stage) => stage.key === "recent")
                                const fill = maxImpact > 0 ? Math.max(4, Math.round(((row.impactMsPer1000 ?? 0) / maxImpact) * 100)) : 0
                                return (
                                    <li key={row.id} data-testid={`coach-target-row-${row.id}`} data-selected={expanded ? "" : undefined} className={`group relative ${index >= 5 && !showAllTargets ? "hidden lg:list-item" : ""}`}>
                                        <span aria-hidden="true" className="absolute bottom-1.5 left-0 top-1.5 z-10 w-1 rounded-r-full" style={{ backgroundColor: color }} />
                                        <div className={`relative px-3 transition ${expanded ? "bg-primary/15 ring-1 ring-inset ring-primary/35" : "hover:bg-base-content/5"} lg:grid lg:grid-cols-[minmax(0,1fr)_8.25rem]`}>
                                            <button
                                                type="button"
                                                aria-expanded={expanded}
                                                onClick={() => setSelectedId(expanded ? null : row.id)}
                                                className="grid min-h-[4.25rem] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary lg:col-span-1 lg:grid-cols-[minmax(0,1fr)_6.25rem_8.25rem]"
                                            >
                                                <span className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] items-center">
                                                    <TargetGlyph target={row} color={color} />
                                                    <span className="min-w-0">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="truncate text-xs font-semibold text-base-content">{row.typeLabel}</span>
                                                            {status && (
                                                                <span className={`flex shrink-0 items-center gap-1 text-[0.6rem] ${status.className}`}>
                                                                    <span className="h-1 w-1 rounded-full bg-current" />{status.label}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="mt-1 block truncate font-mono text-[0.62rem] text-base-content/40">{row.description}</span>
                                                    </span>
                                                </span>
                                                <span className="font-mono text-[0.65rem] text-base-content/80 lg:text-center">
                                                    <span className="lg:hidden">{worthLabel(row)}</span>
                                                    <span className="hidden lg:inline">{latest?.value ?? "—"}</span>
                                                </span>
                                                <span className={`hidden items-center justify-center gap-1 text-center font-mono text-[0.65rem] font-semibold lg:flex ${trendTone(row)}`}>
                                                    {row.trend ? (
                                                        <><span aria-hidden="true">{row.trend.arrow === "up" ? "▲" : "▼"}</span><span>{row.trend.label}</span></>
                                                    ) : "—"}
                                                </span>
                                            </button>
                                            <div className="relative hidden min-h-[4.25rem] items-center justify-center lg:flex">
                                                <span className={`flex flex-col items-center justify-center gap-1 transition-opacity ${row.action ? "group-hover:opacity-0 group-focus-within:opacity-0" : ""}`}>
                                                    {row.impactMsPer1000 !== null && (
                                                        <span className="h-1.5 w-10 overflow-hidden rounded-full bg-base-content/10">
                                                            <span className="block h-full rounded-full" style={{ width: `${fill}%`, backgroundColor: color }} />
                                                        </span>
                                                    )}
                                                    <span className="whitespace-nowrap font-mono text-[0.62rem] text-base-content">{worthLabel(row)}</span>
                                                </span>
                                                {row.action && (
                                                    <Link
                                                        href={row.action.href}
                                                        aria-label={row.action.label}
                                                        className="absolute left-1/2 inline-flex min-h-8 -translate-x-1/2 items-center rounded-md bg-primary px-2 text-[0.65rem] font-semibold text-primary-content opacity-0 shadow-sm transition hover:bg-primary/80 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                                                <PracticeLine target={row} />
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
                    <span className="flex items-center gap-1">
                        worth fixing
                        {IMPACT_TONES.map((tone) => <span key={tone} className="h-1.5 w-2 rounded-sm" style={{ backgroundColor: impactPalette[tone] }} />)}
                        doing fine
                    </span>
                    <span data-testid="coach-trend-legend" className="inline-flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-0.5 text-success"><span aria-hidden="true" className="tracking-[-0.2em]">▲&nbsp;</span> improving</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-0.5 text-error"><span aria-hidden="true" className="tracking-[-0.2em]">▼&nbsp;</span> slipping</span>
                    </span>
                </div>
            </section>
        </div>
    )
}
