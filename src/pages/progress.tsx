import { type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TrendChart } from "~/components/progress/TrendChart";
import { GoalCard } from "~/components/progress/GoalCard";
import { ProgressCoach } from "~/components/progress/ProgressCoach";
import { KeyHeatmap, KeyHeatmapLegend } from "~/components/heatmap/KeyHeatmap";
import { KeyboardLayerSwitch } from "~/components/heatmap/KeyboardLayerSwitch";
import { Chip } from "~/components/ui/Chip";
import { Tooltip } from "~/components/ui/Tooltip";
import { HEATMAP_CONFIG, type KeyAttempt } from "~/lib/heatmap";
import { useGuestEvidence } from "~/hooks/useGuestEvidence";
import { keySpeedBars, type TransitionAggregate } from "~/lib/transitions";
import {
    PROGRESS_PERIODS,
    bestWpm,
    currentStreak,
    dailyProgressSeries,
    filterByCalendarPeriod,
    heroDelta,
    linearTrend,
    mergeDailyRollups,
    recordsForLanguage,
    recordsForPool,
    rejectOutliers,
    type ProgressPeriod,
    type ProgressRecord,
} from "~/lib/progress";
import { useLanguage } from "~/hooks/useLanguage";
import { useLayout } from "~/hooks/useLayout";
import { languageMeta } from "~/lib/languageMeta";
import { boardFor, layoutMeta, statsPoolFor } from "~/lib/keyboardLayout";
import { detectPlateau } from "~/lib/trajectory";
import { api } from "~/utils/api";
import { openSignInModal } from "~/lib/modals";
import { useCoachingEvidence } from "~/hooks/useCoachingEvidence";
import { projectProgressCoach, type ProgressCoachProjection } from "~/lib/progressCoach";
import { projectNaturalKeyboardEvidence } from "~/lib/skillEvidence";

function periodLabel(period: ProgressPeriod): string {
    return period === "all" ? "All" : `${period}d`;
}

function formatSigned(value: number, digits = 1): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

type HeroTrend = "up" | "down" | "flat";

// The familiar start → current line, now backed by observed daily medians. The
// first practiced day in the selected period is the start and the latest is
// current; skipped calendar dates contribute nothing.
function HeroDeltaLine(props: { start: number | null; current: number; delta: number | null; trend: HeroTrend }) {
    const color = props.trend === "up" ? "text-success" : props.trend === "down" ? "text-error" : "text-base-content";
    const geo = props.trend === "down"
        ? { path: "M0 18 H54 L70 36 H100", leftTop: "45%", rightTop: "90%", labelTop: "1.9rem", placement: "below-high" }
        : props.trend === "up"
            ? { path: "M0 36 H54 L70 18 H100", leftTop: "90%", rightTop: "45%", labelTop: "0.6rem", placement: "above-low" }
            : { path: "M0 32 H100", leftTop: "80%", rightTop: "80%", labelTop: "0.8rem", placement: "above-flat" };

    return (
        <div data-testid="headline-start-current" className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-5">
            <div className="shrink-0">
                <div className="font-mono text-xl font-semibold text-base-content/70 sm:text-2xl">
                    {props.start === null ? "-" : props.start.toFixed(1)}
                </div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-base-content/50">Start</div>
            </div>
            <div className={`relative h-16 flex-1 ${color}`} data-trend={props.trend}>
                <div
                    data-testid="headline-delta-value"
                    data-placement={geo.placement}
                    className="absolute left-[44%] z-10 -translate-x-1/2 whitespace-nowrap text-center"
                    style={{ top: geo.labelTop }}
                >
                    {props.delta !== null ? (
                        <div className="font-mono text-2xl font-bold">{formatSigned(props.delta)}</div>
                    ) : (
                        <div data-testid="baseline-calibration" className="text-xs font-semibold text-base-content/60 sm:text-sm">
                            Building baseline
                        </div>
                    )}
                </div>
                <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                    <path d={geo.path} fill="none" stroke="currentColor" strokeWidth={2} strokeOpacity={0.55} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="absolute left-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" style={{ top: geo.leftTop }} aria-hidden="true" />
                <span className="absolute right-0 h-0 w-0 translate-x-1/2 -translate-y-1/2 border-y-[5px] border-l-[8px] border-y-transparent border-l-current" style={{ top: geo.rightTop }} aria-hidden="true" />
            </div>
            <div data-testid="headline-current" className="col-span-2 min-w-0 text-right sm:col-span-1">
                <div className="flex items-baseline justify-end gap-1">
                    <span className="font-mono text-4xl font-bold text-base-content sm:text-5xl">{props.current.toFixed(1)}</span>
                    <span className="text-lg font-semibold text-base-content/60">WPM</span>
                </div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-base-content/50">Current daily median</div>
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
                        <div className="relative h-48 overflow-hidden rounded-md border border-base-content/10 bg-base-200/25">
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

const ProgressDashboard = (props: { language: string; records: ProgressRecord[]; keyAttempts: Record<string, KeyAttempt>; transitions: TransitionAggregate[]; coach: ProgressCoachProjection | null; coachLoading: boolean; canShare?: boolean; username?: string | null }) => {
    const [period, setPeriod] = useState<ProgressPeriod>(30);
    const [trendMetric, setTrendMetric] = useState<TrendMetric>("wpm");
    const [shareState, setShareState] = useState<"idle" | "sharing" | "copied">("idle");
    const leftColumnRef = useRef<HTMLDivElement>(null);
    const [coachHeight, setCoachHeight] = useState<number | null>(null);
    // The board the heatmap below renders (and whose stats pool feeds it).
    const [activeBoardLayout] = useLayout();
    // Heatmap layer switches: attempts are stored unfolded (char-keyed), so the
    // shift/AltGr layers read each glyph's own tally - R apart from r, € apart
    // from e. Mutually exclusive (each turns the other off), so the board shows
    // one layer at a time. AltGr only offers itself on layouts that have it.
    const [heatmapShift, setHeatmapShift] = useState(false);
    const [heatmapAltgr, setHeatmapAltgr] = useState(false);
    const boardHasAltGr = useMemo(() => boardFor(activeBoardLayout).rows.some((row) => row.some((cap) => cap.altgr)), [activeBoardLayout]);
    const now = useMemo(() => new Date(), []);
    const utcOffsetMinutes = -now.getTimezoneOffset();
    const createProgressShare = api.scoreShare.createProgress.useMutation();

    useEffect(() => {
        const leftColumn = leftColumnRef.current;
        if (!leftColumn || typeof ResizeObserver === "undefined") return;
        const update = () => {
            const height = Math.ceil(leftColumn.getBoundingClientRect().height);
            if (height > 0) setCoachHeight((current) => current === height ? current : height);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(leftColumn);
        return () => observer.disconnect();
    }, []);
    const coachColumnStyle = useMemo<React.CSSProperties | undefined>(
        () => coachHeight ? { "--progress-coach-height": `${coachHeight}px` } as React.CSSProperties : undefined,
        [coachHeight],
    );

    // Drop junk tests (stopped typing, key-mash restarts) once, up front, so the
    // delta, trend line, records and best chip are all computed from clean data.
    // Progress combines every mode and length into one view - no per-mode/length
    // filtering, so the only knob left is the time period.
    const cleanRecords = useMemo(() => rejectOutliers(props.records), [props.records]);

    const streak = useMemo(() => currentStreak(cleanRecords, now, utcOffsetMinutes), [cleanRecords, now, utcOffsetMinutes]);
    const inPeriod = useMemo(
        () => filterByCalendarPeriod(cleanRecords, period, now, utcOffsetMinutes),
        [cleanRecords, period, now, utcOffsetMinutes],
    );
    const dailyProgress = useMemo(
        () => dailyProgressSeries(cleanRecords, period, now, utcOffsetMinutes),
        [cleanRecords, period, now, utcOffsetMinutes],
    );

    // Straight least-squares fit per metric - one readable line instead of a
    // wiggly rolling average, aligned 1:1 with the scatter points.
    const fitDailyLine = useCallback((values: number[]) => {
        const line = linearTrend(dailyProgress.points.map((p) => p.t), values);
        return dailyProgress.points.map((p) => line.at(p.t));
    }, [dailyProgress.points]);
    const wpm = useMemo(() => {
        const values = dailyProgress.points.map((p) => p.wpm);
        return { values, trend: dailyProgress.trend };
    }, [dailyProgress]);
    const accuracy = useMemo(() => {
        const values = dailyProgress.points.map((p) => p.accuracy);
        return { values, trend: fitDailyLine(values) };
    }, [dailyProgress.points, fitDailyLine]);
    // Consistency only exists on tests recorded since the feature shipped; show the
    // chart once every point in the window has it (no mixing real values with 0s).
    const consistency = useMemo(() => {
        const values = dailyProgress.points.map((p) => p.consistency);
        if (values.length === 0 || values.some((v) => typeof v !== "number")) return null;
        const nums = values as number[];
        return { values: nums, trend: fitDailyLine(nums) };
    }, [dailyProgress.points, fitDailyLine]);

    // The hero compares observed daily medians: first practiced day in the
    // selected period → latest practiced day. The chart keeps its fitted trend.
    const hero = useMemo(() => heroDelta(dailyProgress.points), [dailyProgress.points]);
    const plateau = useMemo(() => detectPlateau(cleanRecords, now), [cleanRecords, now]);
    // Per-key speed bars for the heatmap (Option A) - normalized against the
    // user's own pace, base layer only inside the component.
    const speedBars = useMemo(() => keySpeedBars(props.transitions), [props.transitions]);

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
        wpm: { title: "WPM over time", points: dailyProgress.points, values: wpm.values, trend: wpm.trend, baseline: "zero" as const, suffix: "", pointKind: "daily" as const, trendLabel: "Daily median trend" },
        accuracy: { title: "Accuracy over time", points: dailyProgress.points, values: accuracy.values, trend: accuracy.trend, baseline: "fit" as const, suffix: "%", pointKind: "daily" as const, trendLabel: "Daily average trend" },
        consistency: { title: "Consistency over time", points: dailyProgress.points, values: consistency?.values ?? [], trend: consistency?.trend ?? [], baseline: "fit" as const, suffix: "%", pointKind: "daily" as const, trendLabel: "Daily average trend" },
    }[activeMetric];

    const hasData = dailyProgress.points.length > 0;
    // A progress card only makes sense with a real delta to brag about.
    const canShare = !!props.canShare && hero.delta !== null && dailyProgress.points.length > 0;

    const shareProgress = async () => {
        if (hero.delta === null) return;
        setShareState("sharing");
        try {
            const share = await createProgressShare.mutateAsync({
                snapshot: {
                    deltaWpm: hero.delta,
                    periodLabel: periodShareLabel(period),
                    points: dailyProgress.points.slice(-2000).map((p) => ({ t: p.t, wpm: p.wpm })),
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
        <div className="w-full min-w-0 max-w-screen-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-mono text-3xl font-bold tracking-tight">Progress</h1>
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
                    <Chip testId="progress-language-chip" size="md" icon={<i className="fa-solid fa-globe" aria-hidden="true" />}>
                        {languageMeta(props.language).label}
                    </Chip>
                    {/* Names the active board so an empty per-pool heatmap
                        doesn't read as broken (ledger slice 8). */}
                    <Chip testId="progress-layout-chip" size="md" icon={<i className="fa-regular fa-keyboard" aria-hidden="true" />}>
                        {layoutMeta(activeBoardLayout).label}
                    </Chip>
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

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-12 lg:items-start">
                <div ref={leftColumnRef} data-testid="progress-left-column" className="contents min-w-0 lg:col-span-6 lg:block lg:space-y-4">
                    <div data-testid="headline-delta" className="order-1 rounded-xl border border-base-content/10 bg-base-100/45 p-4">
                        {plateau.plateaued ? (
                            <div data-testid="plateau-headline">
                                <div className="font-mono text-3xl font-bold text-base-content">Plateaued for {plateau.weeks} weeks</div>
                                <p className="mt-2 text-base-content/60">Your recent net WPM trend has stayed nearly flat. Practise a high-worth Target, then re-measure.</p>
                            </div>
                        ) : hero.delta !== null ? (
                            <HeroDeltaLine
                                start={hero.start}
                                current={hero.current}
                                delta={hero.delta}
                                trend={hero.trend}
                            />
                        ) : hasData ? (
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

                        {hasData && <GoalCard records={inPeriod} now={now} />}
                    </div>

                    <div className="order-3">
                    {hasData ? (
                        <TrendChart
                            title={trendConfig.title}
                            points={trendConfig.points}
                            values={trendConfig.values}
                            trend={trendConfig.trend}
                            trendLabel={trendConfig.trendLabel}
                            pointKind={trendConfig.pointKind}
                            secondary={activeMetric === "wpm" && dailyProgress.bestTrend.length >= 2 ? dailyProgress.bestTrend : undefined}
                            secondaryLabel="Daily best trend"
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

                    <div data-testid="lifetime-keyboard-card" className="order-4 rounded-lg border border-base-content/10 bg-base-100/45 p-3">
                        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            {/* Progress proof is derived from the bounded natural-Test Timeline
                                window; Practice aggregates remain available on Practice itself. */}
                            <div className="flex items-center gap-1.5">
                                <div className="text-base font-semibold text-base-content">Your keyboard</div>
                                <Tooltip content="Colors show accuracy from recent natural Tests. Hover any key to compare its Base, Shift, and AltGr layers.">
                                    <Link
                                        href="/how-we-measure"
                                        aria-label="How keyboard accuracy is calculated"
                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-base-content/25 text-xs font-bold text-base-content/55 hover:border-base-content/45 hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    >
                                        ?
                                    </Link>
                                </Tooltip>
                            </div>
                            <KeyboardLayerSwitch
                                shiftLayer={heatmapShift}
                                altgrLayer={heatmapAltgr}
                                hasAltGr={boardHasAltGr}
                                onSelectBase={() => { setHeatmapShift(false); setHeatmapAltgr(false); }}
                                onToggleShift={() => { setHeatmapShift((on) => !on); setHeatmapAltgr(false); }}
                                onToggleAltgr={() => { setHeatmapAltgr((on) => !on); setHeatmapShift(false); }}
                                testId="lifetime-heatmap-layers"
                            />
                        </div>
                        <div className="flex w-full justify-center overflow-x-auto pb-1">
                            <KeyHeatmap attempts={props.keyAttempts} speedBars={speedBars} minSamples={HEATMAP_CONFIG.minSamples} size="compact" showPercent={false} shiftLayer={heatmapShift} altgrLayer={heatmapAltgr} className="min-w-fit" testId="lifetime-heatmap" />
                        </div>
                        {Object.keys(props.keyAttempts).length === 0 && (
                            <p className="mt-4 text-center text-sm text-base-content/45">Take more tests to color in your per-key accuracy.</p>
                        )}
                        {/* Roomier own surface than the Practice board, so the legend
                            spreads across the corners instead of one tight line. */}
                        <div className="max-w-full overflow-x-auto pb-1">
                            <KeyHeatmapLegend className="mt-3 flex-nowrap text-xs" />
                        </div>
                    </div>
                </div>

                <div
                    data-testid="progress-coach-column"
                    className="order-2 min-h-0 lg:col-span-6 lg:self-start"
                    style={coachColumnStyle}
                >
                    <ProgressCoach projection={props.coach} loading={props.coachLoading} />
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
    // English - the historical default: the English view keeps the old/imported tail,
    // other languages show only their own raw records (derived-on-read, no schema
    // change; ADR-0005: rollups are re-aggregatable from timelines if ever split).
    const [language] = useLanguage();
    // The trend is scoped to the active layout's stats pool as well as the
    // language (recordsForPool), so a remap layout keeps its own WPM history.
    const [activeLayout] = useLayout();
    const pool = statsPoolFor(activeLayout);
    const coaching = useCoachingEvidence();
    const coachProjection = useMemo(
        () => coaching.analysis ? projectProgressCoach(coaching.analysis) : null,
        [coaching.analysis],
    );
    const naturalKeyboard = useMemo(
        () => projectNaturalKeyboardEvidence(coaching.evidence?.timelines ?? []),
        [coaching.evidence?.timelines],
    );
    const recordsQuery = api.test.getProgressRecords.useQuery(undefined, {
        enabled: !!sessionData?.user,
    });
    const rollupsQuery = api.test.getDailyProgressRollups.useQuery(undefined, {
        enabled: !!sessionData?.user,
    });

    const rawRecords: ProgressRecord[] = useMemo(
        () =>
            (recordsQuery.data ?? []).map((row) => ({
                // The API's wpm field is Test.score: canonical net WPM.
                wpm: row.wpm,
                accuracy: row.accuracy,
                consistency: row.consistency,
                count: row.count,
                mode: row.mode,
                subMode: row.subMode,
                language: row.language,
                layout: row.layout,
                day: row.day,
                createdAt: new Date(row.createdAt),
            })),
        [recordsQuery.data],
    );
    const records = useMemo(
        () => recordsForPool(recordsForLanguage(mergeDailyRollups(rawRecords, rollupsQuery.data ?? []), language), pool),
        [rawRecords, rollupsQuery.data, language, pool],
    );

    // Guest evidence lives in localStorage (read client-side after mount to avoid
    // an SSR mismatch). A guest with history gets the real dashboard + a keep-it
    // banner; a guest with none gets the signup pitch.
    const guest = useGuestEvidence();
    const guestRecords: ProgressRecord[] = useMemo(
        () => recordsForPool(recordsForLanguage(
            (guest?.progress ?? []).map((e) => ({ wpm: e.wpm, accuracy: e.accuracy, consistency: e.c, createdAt: new Date(e.t), language: e.lang, layout: e.layout })),
            language,
        ), pool),
        [guest, language, pool],
    );
    // Dashboard-vs-signup-pitch keys off having ANY progress, not the language-
    // filtered slice - otherwise a guest with English history sees the signup pitch
    // the moment they switch to a language they haven't typed.
    const hasAnyGuestProgress = (guest?.progress ?? []).length > 0;

    return (
        <>
            <Head>
                <title>Progress - TypeCafe</title>
                <meta name="description" content="Your typing progress over time: WPM trend, accuracy, and the improvement that proves you're getting faster." />
            </Head>
            <div className="flex h-full w-full justify-center items-start overflow-auto px-4 py-8">
                {status === "loading" || (sessionData?.user && (recordsQuery.isLoading || rollupsQuery.isLoading)) ? (
                    <ProgressLoadingSkeleton />
                ) : !sessionData?.user ? (
                    hasAnyGuestProgress ? (
                        <div className="w-full min-w-0 max-w-screen-xl space-y-4">
                            <div data-testid="guest-keep-banner" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
                                <span className="text-sm text-base-content/80">This progress lives on this device only.</span>
                                <button type="button" onClick={openSignInModal} className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                    Sign in to keep it forever
                                </button>
                            </div>
                            <ProgressDashboard language={language} records={guestRecords} keyAttempts={naturalKeyboard.attempts} transitions={naturalKeyboard.transitions} coach={coachProjection} coachLoading={coaching.loading} />
                        </div>
                    ) : (
                        // No local history yet - the page is the signup pitch.
                        <div data-testid="progress-signed-out" className="w-full max-w-md self-center space-y-4 text-center">
                            <h1 className="font-mono text-3xl font-bold tracking-tight">Your progress, kept forever</h1>
                            <p className="text-base-content/60">
                                Sign in to track every test - your WPM trend, accuracy, and the chart that proves you&apos;re getting faster.
                            </p>
                            <button type="button" onClick={openSignInModal} className="inline-flex cursor-pointer items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                Sign in to track progress
                            </button>
                            <div>
                                <button onClick={() => void router.push("/")} className="text-sm text-base-content/50 underline-offset-2 hover:underline">
                                    Take a test first
                                </button>
                            </div>
                        </div>
                    )
                ) : (
                    <ProgressDashboard language={language} records={records} keyAttempts={naturalKeyboard.attempts} transitions={naturalKeyboard.transitions} coach={coachProjection} coachLoading={coaching.loading} canShare username={sessionData.user.username ?? sessionData.user.name} />
                )}
            </div>
        </>
    );
};

export default Progress;
