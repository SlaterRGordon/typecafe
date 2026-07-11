import { type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TrendChart } from "~/components/progress/TrendChart";
import { GoalCard } from "~/components/progress/GoalCard";
import { KeyHeatmap, KeyHeatmapLegend } from "~/components/heatmap/KeyHeatmap";
import { Chip } from "~/components/ui/Chip";
import type { KeyAttempt } from "~/lib/heatmap";
import { useGuestEvidence } from "~/hooks/useGuestEvidence";
import { worstTransitions, type TransitionAggregate } from "~/lib/transitions";
import {
    PROGRESS_PERIODS,
    bestWpm,
    currentStreak,
    dailyRollups,
    filterByPeriod,
    heroDelta,
    linearTrend,
    mergeDailyRollups,
    personalRecords,
    recordsForLanguage,
    rejectOutliers,
    trendSeries,
    type ProgressPeriod,
    type ProgressRecord,
} from "~/lib/progress";
import { useLanguage } from "~/hooks/useLanguage";
import { useLayout } from "~/hooks/useLayout";
import { languageMeta } from "~/lib/languageMeta";
import { boardFor, layoutMeta, statsPoolFor } from "~/lib/keyboardLayout";
import { composeWeakKeys, netFromRaw, worstKeysFromAttempts } from "~/lib/stats";
import { isDrillableOn } from "~/lib/drillKeys";
import { accentsFor, ensureLanguageLoaded } from "~/components/typer/utils";
import { detectPlateau } from "~/lib/trajectory";
import { api } from "~/utils/api";

function periodLabel(period: ProgressPeriod): string {
    return period === "all" ? "All" : `${period}d`;
}

function formatSigned(value: number, digits = 1): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

type HeroTrend = "up" | "down" | "flat";

// The hero "falling step" line: a start value on the left, the current value on
// the right, and a connector that slopes down/up or stays flat to encode the
// 30-day change at a glance. Always rendered (flat when there's no change or not
// enough history yet) so the hero reads the same in every state. Colors come from
// theme tokens (success / error / base-content) so it works under any theme.
function HeroDeltaLine(props: { start: number | null; current: number; delta: number | null; trend: HeroTrend }) {
    const color = props.trend === "up" ? "text-success" : props.trend === "down" ? "text-error" : "text-base-content";
    // viewBox is 100x40; preserveAspectRatio="none" stretches the connector to
    // fill width, and non-scaling-stroke keeps the line weight constant despite
    // the stretch. The step is a short, fixed-steepness diagonal near the middle.
    // Endpoint markers (circle / arrowhead) are overlaid as HTML so the non-
    // uniform stretch can't squash them; their tops mirror the path's y ends.
    const geo = props.trend === "down"
        ? { path: "M0 16 H60 L68 34 H100", leftTop: "40%", rightTop: "85%" }
        : props.trend === "up"
            ? { path: "M0 34 H60 L68 16 H100", leftTop: "85%", rightTop: "40%" }
            : { path: "M0 25 H100", leftTop: "62.5%", rightTop: "62.5%" };
    return (
        <div data-testid="headline-start-current" className="flex items-center gap-3 sm:gap-5">
            <div className="shrink-0">
                <div className="font-mono text-xl font-semibold text-base-content/70 sm:text-2xl">
                    {props.start === null ? "—" : props.start.toFixed(1)}
                </div>
                <div className="text-[0.6rem] font-semibold uppercase tracking-wide text-base-content/40">Start</div>
            </div>
            <div className={`relative h-14 flex-1 ${color}`}>
                {props.delta !== null && (
                    <div 
                        className={`absolute left-1/2 -translate-x-1/2 font-mono text-2xl font-bold 
                            ${props.delta > 0 ? "top-[1rem]" : 
                                props.delta == 0 ? "top-[0rem]" : "top-[-0.5rem]"}
                        `}>
                        {formatSigned(props.delta)}
                    </div>
                )}
                <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                    <path
                        d={geo.path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeOpacity={0.55}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>
                {/* Start node */}
                <span
                    className="absolute left-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
                    style={{ top: geo.leftTop }}
                    aria-hidden="true"
                />
                {/* Direction arrowhead (always points to the current value) */}
                <span
                    className="absolute right-0 h-0 w-0 translate-x-1/2 -translate-y-1/2 border-y-[5px] border-l-[8px] border-y-transparent border-l-current"
                    style={{ top: geo.rightTop }}
                    aria-hidden="true"
                />
            </div>
            <div className="shrink-0 text-right">
                <div className="flex items-baseline justify-end gap-1">
                    <span className="font-mono text-4xl font-bold text-base-content sm:text-5xl">{props.current.toFixed(1)}</span>
                    <span className="text-lg font-semibold text-base-content/60">WPM</span>
                </div>
                <div className="text-[0.6rem] font-semibold uppercase tracking-wide text-base-content/40">Current</div>
            </div>
        </div>
    );
}

type TrendMetric = "wpm" | "accuracy" | "consistency";

function periodShareLabel(period: ProgressPeriod): string {
    return period === "all" ? "all time" : `${period} days`;
}

function SkeletonBlock(props: { className: string }) {
    return <div className={`rounded-md bg-base-content/10 ${props.className}`} aria-hidden="true" />;
}

function ProgressLoadingSkeleton() {
    const keyboardRows = [
        ["w-9", "w-9", "w-9", "w-9", "w-9", "w-9", "w-9", "w-9", "w-9", "w-9"],
        ["w-9", "w-9", "w-9", "w-9", "w-9", "w-9", "w-9", "w-9", "w-9"],
        ["w-9", "w-9", "w-9", "w-9", "w-9", "w-9", "w-9", "w-9"],
        ["w-56"],
    ];

    return (
        <div
            data-testid="progress-loading-skeleton"
            role="status"
            aria-busy="true"
            className="w-full max-w-screen-xl space-y-4 motion-safe:animate-pulse"
        >
            <span className="sr-only">Loading your progress...</span>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <SkeletonBlock className="h-9 w-36" />
                    <SkeletonBlock className="h-8 w-28 rounded-full" />
                    <SkeletonBlock className="h-8 w-32 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                    <SkeletonBlock className="h-9 w-28" />
                    <div className="flex gap-1 rounded-lg border border-base-content/10 bg-base-200/40 p-1">
                        {PROGRESS_PERIODS.map((option) => (
                            <SkeletonBlock key={option} className="h-9 w-11" />
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                    <div className="rounded-xl border border-base-content/10 bg-base-100/45 p-6">
                        <div className="flex items-center gap-4">
                            <div className="shrink-0 space-y-2">
                                <SkeletonBlock className="h-7 w-20" />
                                <SkeletonBlock className="h-3 w-12" />
                            </div>
                            <SkeletonBlock className="h-14 flex-1" />
                            <div className="shrink-0 space-y-2">
                                <SkeletonBlock className="ml-auto h-12 w-32" />
                                <SkeletonBlock className="ml-auto h-3 w-16" />
                            </div>
                        </div>
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-base-content/10 pt-4">
                            <SkeletonBlock className="h-5 w-44" />
                            <SkeletonBlock className="h-9 w-28" />
                        </div>
                    </div>

                    <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <SkeletonBlock className="h-6 w-36" />
                            <div className="flex gap-1 rounded-lg border border-base-content/10 bg-base-200/40 p-1">
                                <SkeletonBlock className="h-8 w-14" />
                                <SkeletonBlock className="h-8 w-20" />
                                <SkeletonBlock className="h-8 w-24" />
                            </div>
                        </div>
                        <div className="relative h-64 overflow-hidden rounded-md border border-base-content/10 bg-base-200/25">
                            <SkeletonBlock className="absolute bottom-8 left-8 h-36 w-px" />
                            <SkeletonBlock className="absolute bottom-8 left-8 h-px w-[88%]" />
                            <SkeletonBlock className="absolute left-[16%] top-[54%] h-2 w-2 rounded-full" />
                            <SkeletonBlock className="absolute left-[34%] top-[45%] h-2 w-2 rounded-full" />
                            <SkeletonBlock className="absolute left-[52%] top-[38%] h-2 w-2 rounded-full" />
                            <SkeletonBlock className="absolute left-[71%] top-[28%] h-2 w-2 rounded-full" />
                            <SkeletonBlock className="absolute left-[12%] top-[49%] h-1 w-[72%] rotate-[-8deg]" />
                        </div>
                    </div>
                </div>

                <div className="flex min-h-[28rem] flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5">
                    <SkeletonBlock className="h-6 w-32" />
                    <div className="space-y-3">
                        <SkeletonBlock className="h-3 w-24" />
                        <div className="flex flex-wrap gap-1.5">
                            <SkeletonBlock className="h-8 w-14" />
                            <SkeletonBlock className="h-8 w-14" />
                            <SkeletonBlock className="h-8 w-14" />
                        </div>
                        <SkeletonBlock className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <SkeletonBlock className="h-3 w-32" />
                        <SkeletonBlock className="h-12 w-full" />
                        <SkeletonBlock className="h-12 w-full" />
                        <SkeletonBlock className="h-12 w-full" />
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-3 sm:p-5 lg:col-span-2">
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <SkeletonBlock className="h-5 w-40" />
                        <SkeletonBlock className="h-6 w-64" />
                    </div>
                    <div className="space-y-1 overflow-hidden">
                        {keyboardRows.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex justify-center gap-1">
                                {row.map((width, index) => (
                                    <SkeletonBlock key={`${rowIndex}-${index}`} className={`h-10 ${width}`} />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-4">
                    <SkeletonBlock className="mb-3 h-6 w-24" />
                    <div className="space-y-3">
                        <SkeletonBlock className="h-8 w-full" />
                        <SkeletonBlock className="h-8 w-full" />
                        <SkeletonBlock className="h-8 w-4/5" />
                    </div>
                </div>
            </div>
        </div>
    );
}

const ProgressDashboard = (props: { language: string; records: ProgressRecord[]; keyAttempts: Record<string, KeyAttempt>; transitions: TransitionAggregate[]; canShare?: boolean; username?: string | null }) => {
    const [period, setPeriod] = useState<ProgressPeriod>(30);
    const [trendMetric, setTrendMetric] = useState<TrendMetric>("wpm");
    const [shareState, setShareState] = useState<"idle" | "sharing" | "copied">("idle");
    // The board the heatmap below renders (and whose stats pool feeds it).
    const [activeBoardLayout] = useLayout();
    // Heatmap layer switches: attempts are stored unfolded (char-keyed), so the
    // shift/AltGr layers read each glyph's own tally — R apart from r, € apart
    // from e. Mutually exclusive (each turns the other off), so the board shows
    // one layer at a time. AltGr only offers itself on layouts that have it.
    const [heatmapShift, setHeatmapShift] = useState(false);
    const [heatmapAltgr, setHeatmapAltgr] = useState(false);
    const boardHasAltGr = useMemo(() => boardFor(activeBoardLayout).rows.some((row) => row.some((cap) => cap.altgr)), [activeBoardLayout]);
    const now = useMemo(() => new Date(), []);
    const createProgressShare = api.scoreShare.createProgress.useMutation();

    // Drop junk tests (stopped typing, key-mash restarts) once, up front, so the
    // delta, trend line, records and best chip are all computed from clean data.
    // Progress combines every mode and length into one view — no per-mode/length
    // filtering, so the only knob left is the time period.
    const cleanRecords = useMemo(() => rejectOutliers(props.records), [props.records]);

    const streak = useMemo(() => currentStreak(cleanRecords, now, -now.getTimezoneOffset()), [cleanRecords, now]);
    const series = useMemo(() => trendSeries(cleanRecords, period, now), [cleanRecords, period, now]);
    const inPeriod = useMemo(() => filterByPeriod(cleanRecords, period, now), [cleanRecords, period, now]);
    const records = useMemo(() => personalRecords(cleanRecords), [cleanRecords]);

    // Straight least-squares fit per metric — one readable line instead of a
    // wiggly rolling average, aligned 1:1 with the scatter points.
    const fitLine = useCallback((values: number[]) => {
        const line = linearTrend(series.points.map((p) => p.t), values);
        return series.points.map((p) => line.at(p.t));
    }, [series.points]);
    const wpm = useMemo(() => {
        const values = series.points.map((p) => p.wpm);
        const line = linearTrend(series.points.map((p) => p.t), values);
        return { values, trend: series.points.map((p) => line.at(p.t)) };
    }, [series]);
    const accuracy = useMemo(() => {
        const values = series.points.map((p) => p.accuracy);
        return { values, trend: fitLine(values) };
    }, [fitLine, series]);
    // Consistency only exists on tests recorded since the feature shipped; show the
    // chart once every point in the window has it (no mixing real values with 0s).
    const consistency = useMemo(() => {
        const values = series.points.map((p) => p.consistency);
        if (values.length === 0 || values.some((v) => typeof v !== "number")) return null;
        const nums = values as number[];
        return { values: nums, trend: fitLine(nums) };
    }, [fitLine, series]);

    // The hero delta reads off the WPM trend line's endpoints, so the headline
    // number is exactly the slope the chart shows — not a separate noisy
    // window-average subtraction that flips sign on a single junk test.
    const hero = useMemo(() => heroDelta(series.points), [series]);

    // Best WPM per local day, fit to a straight least-squares line — a lighter
    // ceiling trend behind the WPM trend. Two endpoints (not the jagged daily
    // points) so it reads as a direction at a glance, same as the main trend.
    const bestPerDay = useMemo(() => {
        const days = dailyRollups(inPeriod, -now.getTimezoneOffset())
            .map((d) => ({ t: new Date(`${d.day}T12:00:00.000Z`).getTime(), value: d.bestWpm }));
        if (days.length < 2) return days;
        const fit = linearTrend(days.map((d) => d.t), days.map((d) => d.value));
        const first = days[0]!.t, last = days[days.length - 1]!.t;
        return [{ t: first, value: fit.at(first) }, { t: last, value: fit.at(last) }];
    }, [inPeriod, now]);
    const plateau = useMemo(() => detectPlateau(cleanRecords, now), [cleanRecords, now]);
    const slowTransitions = useMemo(() => worstTransitions(props.transitions), [props.transitions]);
    // The active language's accent chars (loaded on demand; [] for English) —
    // they let weak é/ü/ą show as drillable keys, and gate out keys from other
    // languages/layouts the user isn't currently on.
    const [accentChars, setAccentChars] = useState<string[]>([]);
    useEffect(() => {
        let alive = true;
        void ensureLanguageLoaded(props.language).then(() => { if (alive) setAccentChars(accentsFor(props.language)); });
        return () => { alive = false; };
    }, [props.language]);
    // Top weak keys for the one-click "drill your weakest keys" CTA. Only keys
    // drillable on the current language/layout count; rank every key, then
    // compose a letter-led set (≤3 punctuation/capitals) so a user who rarely
    // types marks doesn't get a CTA that's all symbols.
    const topWeakKeys = useMemo(
        () => composeWeakKeys(worstKeysFromAttempts(new Map(Object.entries(props.keyAttempts)), Infinity)
            .filter((entry) => isDrillableOn(entry.key, activeBoardLayout, accentChars))),
        [props.keyAttempts, activeBoardLayout, accentChars],
    );

    // One toggled trend chart instead of three stacked ones (saves height): WPM by
    // default, accuracy/consistency a tab away. Falls back to WPM if a filter
    // removes consistency while it's the active tab.
    const trendTabs: { key: TrendMetric; label: string }[] = [
        { key: "wpm", label: "WPM" },
        { key: "accuracy", label: "Accuracy" },
        ...(consistency ? [{ key: "consistency" as const, label: "Consistency" }] : []),
    ];
    const activeMetric: TrendMetric = trendMetric === "consistency" && !consistency ? "wpm" : trendMetric;
    const trendConfig = {
        wpm: { title: "WPM over time", values: wpm.values, trend: wpm.trend, baseline: "zero" as const, suffix: "" },
        accuracy: { title: "Accuracy over time", values: accuracy.values, trend: accuracy.trend, baseline: "fit" as const, suffix: "%" },
        consistency: { title: "Consistency over time", values: consistency?.values ?? [], trend: consistency?.trend ?? [], baseline: "fit" as const, suffix: "%" },
    }[activeMetric];

    const hasData = series.points.length > 0;
    // A progress card only makes sense with a real delta to brag about.
    const canShare = !!props.canShare && hero.delta !== null && series.points.length > 0;

    const shareProgress = async () => {
        if (hero.delta === null) return;
        setShareState("sharing");
        try {
            const share = await createProgressShare.mutateAsync({
                snapshot: {
                    deltaWpm: hero.delta,
                    periodLabel: periodShareLabel(period),
                    points: series.points.slice(-2000).map((p) => ({ t: p.t, wpm: p.wpm })),
                    streak: streak > 0 ? streak : undefined,
                    username: props.username ?? undefined,
                    generatedAt: Date.now(),
                },
            });
            const url = `${window.location.origin}/score/${share.slug}`;
            try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked */ }
            setShareState("copied");
            setTimeout(() => setShareState("idle"), 2500);
        } catch {
            setShareState("idle");
        }
    };

    return (
        <div className="w-full max-w-screen-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-mono text-3xl font-bold tracking-tight">Progress</h1>
                    <Chip testId="progress-language-chip" size="md" icon={<i className="fa-solid fa-globe" aria-hidden="true" />}>
                        {languageMeta(props.language).label}
                    </Chip>
                    {/* Names the active board so an empty per-pool heatmap
                        doesn't read as broken (ledger slice 8). */}
                    <Chip testId="progress-layout-chip" size="md" icon={<i className="fa-regular fa-keyboard" aria-hidden="true" />}>
                        {layoutMeta(activeBoardLayout).label}
                    </Chip>
                    {streak > 0 && (
                        <Chip
                            testId="streak-chip"
                            tone="primary"
                            size="md"
                            icon={<i className="fa-solid fa-fire" aria-hidden="true" />}
                        >
                            {streak}-day streak
                        </Chip>
                    )}
                    {hasData && (
                        <Chip
                            testId="best-wpm-chip"
                            size="md"
                            icon={<i className="fa-solid fa-gauge-high" aria-hidden="true" />}
                        >
                            Best {bestWpm(inPeriod).toFixed(1)} WPM
                        </Chip>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {canShare && (
                        <button
                            type="button"
                            data-testid="share-progress"
                            onClick={() => void shareProgress()}
                            disabled={shareState === "sharing"}
                            className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-content transition hover:opacity-85 disabled:opacity-60"
                        >
                            {shareState === "copied" ? "Link copied" : shareState === "sharing" ? "Sharing…" : "Share progress"}
                        </button>
                    )}
                    <div data-testid="period-switcher" className="flex gap-1 rounded-lg border border-base-content/15 bg-base-200/50 p-1">
                        {PROGRESS_PERIODS.map((option) => (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={period === option}
                                onClick={() => setPeriod(option)}
                                className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${period === option ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-content/5 hover:text-base-content"}`}
                            >
                                {periodLabel(option)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Above the fold: "am I getting faster?" (the delta + the WPM proof)
                sits beside the single highest-leverage action (drill your weak
                spots). The three things that matter, no scrolling. */}
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                    <div data-testid="headline-delta" className="rounded-xl border border-base-content/10 bg-base-100/45 p-6">
                        {plateau.plateaued ? (
                            <div data-testid="plateau-headline">
                                <div className="font-mono text-3xl font-bold text-base-content">Plateaued for {plateau.weeks} weeks</div>
                                <p className="mt-2 text-base-content/60">Your sessions repeat the same comfortable words. Switch to transition drills to break the ceiling.</p>
                            </div>
                        ) : hero.delta !== null ? (
                            <HeroDeltaLine
                                start={hero.start}
                                current={hero.current}
                                delta={hero.delta}
                                trend={hero.trend}
                            />
                        ) : hasData ? (
                            // Enough to chart, but no comparison window yet: a flat line
                            // off the current average — the hero reads the same shape,
                            // just with no change to show. The chart and goal below
                            // carry the rest of the story.
                            <HeroDeltaLine
                                start={null}
                                current={hero.current}
                                delta={null}
                                trend="flat"
                            />
                        ) : (
                            <>
                                <div className="font-mono text-3xl font-bold text-base-content">No tests yet</div>
                                <p className="mt-2 text-base-content/60">Complete a few tests and your trend appears here.</p>
                                <Link href="/" className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                    Take a test
                                </Link>
                            </>
                        )}

                        {hasData && <GoalCard records={cleanRecords} now={now} />}
                    </div>

                    {hasData ? (
                        <TrendChart
                            title={trendConfig.title}
                            points={series.points}
                            values={trendConfig.values}
                            trend={trendConfig.trend}
                            secondary={activeMetric === "wpm" && bestPerDay.length >= 2 ? bestPerDay : undefined}
                            secondaryLabel="Best/day"
                            baseline={trendConfig.baseline}
                            valueSuffix={trendConfig.suffix}
                            action={
                                <div data-testid="trend-tabs" className="flex gap-1 rounded-lg border border-base-content/15 bg-base-200/50 p-1">
                                    {trendTabs.map((tab) => (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            aria-pressed={activeMetric === tab.key}
                                            onClick={() => setTrendMetric(tab.key)}
                                            className={`min-h-8 rounded-md px-2.5 text-xs font-medium transition-colors ${activeMetric === tab.key ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-content/5 hover:text-base-content"}`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            }
                        />
                    ) : (
                        <div data-testid="trend-empty" className="flex min-h-[18rem] items-center justify-center rounded-lg border border-base-content/10 bg-base-100/45 p-4 text-center text-sm text-base-content/45">
                            Complete a few tests and your WPM, accuracy, and consistency trend appears here.
                        </div>
                    )}
                </div>

                {/* Weak spots → drill, beside the hero + chart. Stretches to fill
                    the column so its footprint is the same whether sparse or full;
                    the transitions list scrolls inside when it's long, so the card
                    never grows taller than the chart beside it. */}
                <div data-testid="weak-spots" className="flex h-full flex-col gap-4 rounded-xl border border-primary/25 bg-primary/5 p-5 lg:col-span-1">
                        <div className="text-lg font-semibold text-base-content">Weak spots → drill</div>

                        {/* Center the content so a sparse card reads as balanced, not
                            top-heavy with a void; a long transitions list scrolls. */}
                        <div className="flex min-h-0 flex-1 flex-col gap-4">
                            {topWeakKeys.length === 0 && slowTransitions.length === 0 && (
                                <p data-testid="weak-spots-empty" className="m-auto max-w-[16rem] text-center text-sm text-base-content/45">
                                    Take more tests to reveal your weakest keys and slowest transitions to drill.
                                </p>
                            )}
                            {topWeakKeys.length > 0 && (
                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/45">Weakest keys</p>
                                    <div className="mb-3 flex flex-wrap gap-1.5">
                                        {topWeakKeys.map((k) => (
                                            <span key={k.key} className="rounded-md border border-base-content/15 bg-base-200/60 px-2 py-1 font-mono text-sm font-bold text-base-content">
                                                {k.key} <span className="text-xs font-normal text-base-content/50">{k.accuracy.toFixed(0)}%</span>
                                            </span>
                                        ))}
                                    </div>
                                    <Link
                                        href={`/drill?keys=${topWeakKeys.map((k) => k.key).join(",")}`}
                                        className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85"
                                    >
                                        Drill weakest keys
                                    </Link>
                                </div>
                            )}

                            {slowTransitions.length > 0 && (
                                <div data-testid="worst-transitions" className="flex min-h-0 flex-col">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/45">Slowest transitions</p>
                                    <ul className="flex flex-col gap-2 overflow-y-auto pr-1">
                                        {slowTransitions.map((t) => (
                                            <li key={t.pair} className="flex items-center justify-between gap-2 rounded-md border border-base-content/10 bg-base-200/40 px-3 py-2">
                                                <span className="text-sm text-base-content/90">
                                                    <span className="font-mono font-bold text-base-content">{t.from}→{t.to}</span> · {t.ratio.toFixed(1)}× avg
                                                </span>
                                                <Link
                                                    href={`/drill?transitions=${t.from}${t.to}`}
                                                    className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition hover:opacity-85"
                                                >
                                                    Drill {t.from}{t.to}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div data-testid="lifetime-keyboard-card" className="rounded-lg border border-base-content/10 bg-base-100/45 p-3 sm:p-5 lg:col-span-2">
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {/* "Your keyboard", not "Lifetime": per-key accuracy is a rolling
                            window of recent attempts (ADR-0005), not an all-time sum. */}
                        <div className="text-base font-semibold text-base-content">Your keyboard</div>
                        <KeyHeatmapLegend />
                    </div>
                    <div className="flex w-full justify-center overflow-x-auto pb-1">
                        <KeyHeatmap attempts={props.keyAttempts} size="full" showPercent={Object.keys(props.keyAttempts).length > 0} shiftLayer={heatmapShift} altgrLayer={heatmapAltgr} className="min-w-fit" testId="lifetime-heatmap" />
                    </div>
                    {Object.keys(props.keyAttempts).length === 0 && (
                        <p className="mt-4 text-center text-sm text-base-content/45">Take more tests to color in your per-key accuracy.</p>
                    )}
                    {/* Layer switches sit bottom-left of the board itself — they
                        change what the board shows, so they live with it. */}
                    <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1" data-testid="lifetime-heatmap-layers">
                            <button
                                type="button"
                                className={`btn btn-xs normal-case ${heatmapShift ? "btn-primary" : "btn-ghost text-base-content/60"}`}
                                aria-pressed={heatmapShift}
                                onClick={() => { setHeatmapShift((on) => !on); setHeatmapAltgr(false); }}
                            >
                                ⇧ shift
                            </button>
                            {boardHasAltGr && (
                                <button
                                    type="button"
                                    className={`btn btn-xs normal-case ${heatmapAltgr ? "btn-primary" : "btn-ghost text-base-content/60"}`}
                                    aria-pressed={heatmapAltgr}
                                    onClick={() => { setHeatmapAltgr((on) => !on); setHeatmapShift(false); }}
                                >
                                    AltGr
                                </button>
                            )}
                        </div>
                        <Link href="/how-we-measure" className="text-xs text-base-content/45 underline-offset-2 hover:text-base-content/70 hover:underline">
                            How these numbers work →
                        </Link>
                    </div>
                </div>

                <div data-testid="records-timeline" className="rounded-lg border border-base-content/10 bg-base-100/45 p-4 lg:col-span-1">
                    <div className="mb-3 text-lg font-semibold text-base-content">Records</div>
                    {records.length > 0 ? (
                        <ul className="space-y-2">
                            {records.slice(0, 6).map((event) => (
                                <li key={event.t} className="flex items-center justify-between gap-3 border-b border-base-content/10 pb-2 text-sm last:border-b-0 last:pb-0">
                                    <span className="shrink-0 text-base-content/60">{new Date(event.t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                                    <span className="text-right font-medium text-base-content">
                                        {event.kind === "threshold" ? `First ${event.threshold}+ WPM test` : `${event.wpm.toFixed(1)} WPM personal best`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-base-content/45">Your personal bests and first-milestone tests land here as you improve.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

const Progress: NextPage = () => {
    const { data: sessionData, status } = useSession();
    const router = useRouter();
    // Progress is scoped to the global language. Daily rollups (DailyUserStat, incl.
    // imported guest history) carry no language, so recordsForLanguage counts them as
    // English — the historical default: the English view keeps the old/imported tail,
    // other languages show only their own raw records (derived-on-read, no schema
    // change; ADR-0005: rollups are re-aggregatable from timelines if ever split).
    const [language] = useLanguage();
    const recordsQuery = api.test.getProgressRecords.useQuery(undefined, {
        enabled: !!sessionData?.user,
    });
    const rollupsQuery = api.test.getDailyProgressRollups.useQuery(undefined, {
        enabled: !!sessionData?.user,
    });

    const rawRecords: ProgressRecord[] = useMemo(
        () =>
            (recordsQuery.data ?? []).map((row) => ({
                // Trends/deltas read net (the canonical WPM), derived from the
                // stored raw speed + accuracy. Raw isn't surfaced on /progress.
                wpm: netFromRaw(row.wpm, row.accuracy),
                accuracy: row.accuracy,
                consistency: row.consistency,
                count: row.count,
                mode: row.mode,
                subMode: row.subMode,
                language: row.language,
                day: row.day,
                createdAt: new Date(row.createdAt),
            })),
        [recordsQuery.data],
    );
    const records = useMemo(
        () => recordsForLanguage(mergeDailyRollups(rawRecords, rollupsQuery.data ?? []), language),
        [rawRecords, rollupsQuery.data, language],
    );

    // Lifetime per-key accuracy for the heatmap: DB practice stats when signed
    // in, the localStorage key-stat mirror for guests (useGuestEvidence follows
    // the pool itself). Both read the active layout's stats pool (decision 6).
    const [activeLayout] = useLayout();
    const pool = statsPoolFor(activeLayout);
    const practiceStatsQuery = api.practiceStats.get.useQuery({ pool }, { enabled: !!sessionData?.user });
    const dbKeyAttempts = useMemo(() => {
        const out: Record<string, KeyAttempt> = {};
        for (const stat of practiceStatsQuery.data ?? []) out[stat.character] = { attempts: stat.total, correct: stat.correct };
        return out;
    }, [practiceStatsQuery.data]);

    const transitionsQuery = api.transitionStats.get.useQuery({ pool }, { enabled: !!sessionData?.user });
    const dbTransitions: TransitionAggregate[] = transitionsQuery.data ?? [];

    // Guest evidence lives in localStorage (read client-side after mount to avoid
    // an SSR mismatch). A guest with history gets the real dashboard + a keep-it
    // banner; a guest with none gets the signup pitch.
    const guest = useGuestEvidence();
    const guestRecords: ProgressRecord[] = useMemo(
        () => recordsForLanguage(
            (guest?.progress ?? []).map((e) => ({ wpm: netFromRaw(e.wpm, e.accuracy), accuracy: e.accuracy, consistency: e.c, createdAt: new Date(e.t), language: e.lang })),
            language,
        ),
        [guest, language],
    );
    const guestKeyAttempts = useMemo(() => {
        const attempts: Record<string, KeyAttempt> = {};
        for (const stat of guest?.keyStats ?? []) attempts[stat.key] = { attempts: stat.attempts, correct: stat.correct };
        return attempts;
    }, [guest]);
    const guestTransitions: TransitionAggregate[] = guest?.transitions ?? [];
    // Dashboard-vs-signup-pitch keys off having ANY progress, not the language-
    // filtered slice — otherwise a guest with English history sees the signup pitch
    // the moment they switch to a language they haven't typed.
    const hasAnyGuestProgress = (guest?.progress ?? []).length > 0;

    return (
        <>
            <Head>
                <title>Progress — TypeCafe</title>
                <meta name="description" content="Your typing progress over time: WPM trend, accuracy, and the improvement that proves you're getting faster." />
            </Head>
            <div className="flex h-full w-full justify-center items-start overflow-auto px-4 py-8">
                {status === "loading" || (sessionData?.user && (recordsQuery.isLoading || rollupsQuery.isLoading)) ? (
                    <ProgressLoadingSkeleton />
                ) : !sessionData?.user ? (
                    hasAnyGuestProgress ? (
                        <div className="w-full max-w-screen-xl space-y-4">
                            <div data-testid="guest-keep-banner" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
                                <span className="text-sm text-base-content/80">This progress lives on this device only.</span>
                                <label htmlFor="signInModal" className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                    Sign in to keep it forever
                                </label>
                            </div>
                            <ProgressDashboard language={language} records={guestRecords} keyAttempts={guestKeyAttempts} transitions={guestTransitions} />
                        </div>
                    ) : (
                        // No local history yet — the page is the signup pitch.
                        <div data-testid="progress-signed-out" className="mt-10 w-full max-w-md space-y-4 text-center">
                            <h1 className="font-mono text-3xl font-bold tracking-tight">Your progress, kept forever</h1>
                            <p className="text-base-content/60">
                                Sign in to track every test — your WPM trend, accuracy, and the chart that proves you&apos;re getting faster.
                            </p>
                            <label htmlFor="signInModal" className="inline-flex cursor-pointer items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                Sign in to track progress
                            </label>
                            <div>
                                <button onClick={() => void router.push("/")} className="text-sm text-base-content/50 underline-offset-2 hover:underline">
                                    Take a test first
                                </button>
                            </div>
                        </div>
                    )
                ) : (
                    <ProgressDashboard language={language} records={records} keyAttempts={dbKeyAttempts} transitions={dbTransitions} canShare username={sessionData.user.username ?? sessionData.user.name} />
                )}
            </div>
        </>
    );
};

export default Progress;
