import { type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { TrendChart } from "~/components/progress/TrendChart";
import { GoalCard } from "~/components/progress/GoalCard";
import { KeyHeatmap, KeyHeatmapLegend } from "~/components/heatmap/KeyHeatmap";
import type { KeyAttempt } from "~/lib/heatmap";
import { readLocalKeyStats } from "~/lib/localSync";
import { readLocalTransitions } from "~/lib/localTransitions";
import { worstTransitions, type TransitionAggregate } from "~/lib/transitions";
import {
    PROGRESS_PERIODS,
    averageWpm,
    bestWpm,
    currentStreak,
    filterByPeriod,
    filterProgressRecords,
    headlineDelta,
    mergeDailyRollups,
    personalRecords,
    progressMode,
    rollingAverage,
    trendSeries,
    type ProgressPeriod,
    type ProgressModeFilter,
    type ProgressRecord,
} from "~/lib/progress";
import { readLocalProgress } from "~/lib/progressHistory";
import { netFromRaw, worstKeysFromAttempts } from "~/lib/stats";
import { detectPlateau } from "~/lib/trajectory";
import { api } from "~/utils/api";

function periodLabel(period: ProgressPeriod): string {
    return period === "all" ? "All" : `${period}d`;
}

function periodPhrase(period: ProgressPeriod): string {
    return period === "all" ? "all time" : `the last ${period} days`;
}

function formatSigned(value: number, digits = 1): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

// Only Timed and Words ever persist Test rows (grams/practice/relaxed don't), so
// those are the only filters worth offering alongside All.
const MODE_FILTERS: { key: ProgressModeFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "timed", label: "Timed" },
    { key: "words", label: "Words" },
];

type TrendMetric = "wpm" | "accuracy" | "consistency";

function lengthLabel(count: number, mode: ProgressModeFilter): string {
    if (mode === "timed") return `${count}s`;
    if (mode === "words") return `${count} words`;
    return String(count);
}

function periodShareLabel(period: ProgressPeriod): string {
    return period === "all" ? "all time" : `${period} days`;
}

const ProgressDashboard = (props: { records: ProgressRecord[]; keyAttempts: Record<string, KeyAttempt>; transitions: TransitionAggregate[]; canShare?: boolean; username?: string | null }) => {
    const [period, setPeriod] = useState<ProgressPeriod>(30);
    const [trendMetric, setTrendMetric] = useState<TrendMetric>("wpm");
    const [modeFilter, setModeFilter] = useState<ProgressModeFilter>("all");
    const [lengthFilter, setLengthFilter] = useState<number | "all">("all");
    const [shareState, setShareState] = useState<"idle" | "sharing" | "copied">("idle");
    const now = useMemo(() => new Date(), []);
    const createProgressShare = api.scoreShare.createProgress.useMutation();

    const modeFilteredRecords = useMemo(
        () => filterProgressRecords(props.records, { mode: modeFilter, count: "all" }),
        [props.records, modeFilter],
    );
    const lengthOptions = useMemo(
        () => Array.from(new Set(modeFilteredRecords.map((record) => record.count).filter((count): count is number => typeof count === "number" && count > 0)))
            .sort((a, b) => a - b),
        [modeFilteredRecords],
    );
    useEffect(() => {
        if (lengthFilter !== "all" && !lengthOptions.includes(lengthFilter)) setLengthFilter("all");
    }, [lengthFilter, lengthOptions]);
    const filteredRecords = useMemo(
        () => filterProgressRecords(props.records, { mode: modeFilter, count: lengthFilter }),
        [props.records, modeFilter, lengthFilter],
    );
    const activeFilter = modeFilter !== "all" || lengthFilter !== "all";
    // Imported guest history lands as rollup-only days with no mode/length, so it
    // can't be split by those dimensions. Only offer the filters when at least one
    // record carries the metadata, and flag when uncategorized history exists so an
    // emptied filter can explain itself honestly instead of claiming "no tests".
    const hasFilterableMetadata = useMemo(() => props.records.some((r) => progressMode(r) !== null), [props.records]);
    const hasImportedHistory = useMemo(() => props.records.some((r) => progressMode(r) === null), [props.records]);

    const streak = useMemo(() => currentStreak(filteredRecords, now, -now.getTimezoneOffset()), [filteredRecords, now]);
    const delta = useMemo(() => headlineDelta(filteredRecords, period, now), [filteredRecords, period, now]);
    const series = useMemo(() => trendSeries(filteredRecords, period, now), [filteredRecords, period, now]);
    const inPeriod = useMemo(() => filterByPeriod(filteredRecords, period, now), [filteredRecords, period, now]);
    const records = useMemo(() => personalRecords(filteredRecords), [filteredRecords]);
    const accuracy = useMemo(() => ({
        values: series.points.map((p) => p.accuracy),
        rolling: rollingAverage(series.points.map((p) => p.accuracy), series.window),
    }), [series]);
    // Consistency only exists on tests recorded since the feature shipped; show the
    // chart once every point in the window has it (no mixing real values with 0s).
    const consistency = useMemo(() => {
        const values = series.points.map((p) => p.consistency);
        if (values.length === 0 || values.some((v) => typeof v !== "number")) return null;
        const nums = values as number[];
        return { values: nums, rolling: rollingAverage(nums, series.window) };
    }, [series]);
    const plateau = useMemo(() => detectPlateau(filteredRecords, now), [filteredRecords, now]);
    const slowTransitions = useMemo(() => worstTransitions(props.transitions), [props.transitions]);
    // Top weak keys for the one-click "drill your weakest keys" CTA (slice 5).
    const topWeakKeys = useMemo(
        () => worstKeysFromAttempts(new Map(Object.entries(props.keyAttempts)), 6),
        [props.keyAttempts],
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
        wpm: { title: "WPM over time", values: series.points.map((p) => p.wpm), rolling: series.rollingWpm, baseline: "zero" as const, suffix: "" },
        accuracy: { title: "Accuracy over time", values: accuracy.values, rolling: accuracy.rolling, baseline: "fit" as const, suffix: "%" },
        consistency: { title: "Consistency over time", values: consistency?.values ?? [], rolling: consistency?.rolling ?? [], baseline: "fit" as const, suffix: "%" },
    }[activeMetric];

    const hasData = series.points.length > 0;
    // A progress card only makes sense with a real delta to brag about.
    const canShare = !!props.canShare && delta.delta !== null && series.points.length > 0;

    const shareProgress = async () => {
        if (delta.delta === null) return;
        setShareState("sharing");
        try {
            const share = await createProgressShare.mutateAsync({
                snapshot: {
                    deltaWpm: delta.delta,
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
        <div className="w-full max-w-6xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-mono text-3xl font-bold tracking-tight">Progress</h1>
                    {streak > 0 && (
                        <span data-testid="streak-chip" className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
                            {streak}-day streak
                        </span>
                    )}
                    {hasData && (
                        <span data-testid="best-wpm-chip" className="rounded-full bg-base-content/10 px-3 py-1 text-sm font-semibold text-base-content/80">
                            Best {bestWpm(inPeriod).toFixed(1)} WPM
                        </span>
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

            {/* Filters (only when the records carry mode/length metadata). */}
            {hasFilterableMetadata && (
            <div data-testid="progress-filters" className="grid gap-3 rounded-xl border border-base-content/10 bg-base-100/45 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/45">Mode</p>
                    <div data-testid="progress-mode-filter" className="flex flex-wrap gap-1">
                        {MODE_FILTERS.map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                aria-pressed={modeFilter === option.key}
                                onClick={() => setModeFilter(option.key)}
                                className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${modeFilter === option.key ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-content/5 hover:text-base-content"}`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/45">Length</p>
                    <div data-testid="progress-length-filter" className="flex flex-wrap gap-1">
                        <button
                            type="button"
                            aria-pressed={lengthFilter === "all"}
                            onClick={() => setLengthFilter("all")}
                            className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${lengthFilter === "all" ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-content/5 hover:text-base-content"}`}
                        >
                            All lengths
                        </button>
                        {lengthOptions.map((count) => (
                            <button
                                key={count}
                                type="button"
                                aria-pressed={lengthFilter === count}
                                onClick={() => setLengthFilter(count)}
                                className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${lengthFilter === count ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-content/5 hover:text-base-content"}`}
                            >
                                {lengthLabel(count, modeFilter)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            )}

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
                                <Link href="/?mode=grams" className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                    Try transition drills
                                </Link>
                            </div>
                        ) : delta.delta !== null ? (
                            <>
                                <div className="flex items-baseline gap-2">
                                    <span className={`font-mono text-6xl font-bold ${delta.trend === "up" ? "text-success" : delta.trend === "down" ? "text-error" : "text-base-content"}`}>
                                        {formatSigned(delta.delta)}
                                    </span>
                                    <span className="text-2xl font-semibold text-base-content/70">WPM</span>
                                </div>
                                <p className="mt-2 text-base-content/60">
                                    {delta.trend === "up" && `Faster over ${periodPhrase(period)} — keep going.`}
                                    {delta.trend === "down" && `Down over ${periodPhrase(period)}. Drill your weak spots to turn it around.`}
                                    {delta.trend === "flat" && `Flat over ${periodPhrase(period)}. Drill your weak spots to break the plateau.`}
                                </p>
                            </>
                        ) : hasData ? (
                            // Enough to chart, but no comparison window yet: just the
                            // current average + a one-line hint (no paragraph/button —
                            // the chart and goal below already carry the story).
                            <>
                                <div className="flex items-baseline gap-2">
                                    <span className="font-mono text-5xl font-bold text-base-content">{averageWpm(inPeriod).toFixed(1)}</span>
                                    <span className="text-2xl font-semibold text-base-content/70">WPM</span>
                                </div>
                                <p className="mt-1 text-sm text-base-content/45">Average over {periodPhrase(period)} — keep testing for a delta.</p>
                            </>
                        ) : (
                            <>
                                <div className="font-mono text-3xl font-bold text-base-content">
                                    {activeFilter && props.records.length > 0 ? "No matching tests" : "No tests yet"}
                                </div>
                                <p className="mt-2 text-base-content/60">
                                    {activeFilter && props.records.length > 0
                                        ? hasImportedHistory
                                            ? "Imported history isn't split by mode or length — switch back to All to see it, or take a matching test to start a trend here."
                                            : "This filter has no ranked tests yet. Clear the filters or take a matching test."
                                        : "Complete a few tests and your trend appears here."}
                                </p>
                                {activeFilter && props.records.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => { setModeFilter("all"); setLengthFilter("all"); }}
                                        className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85"
                                    >
                                        Clear filters
                                    </button>
                                ) : (
                                    <Link href="/" className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                        Take a test
                                    </Link>
                                )}
                            </>
                        )}

                        {hasData && <GoalCard records={filteredRecords} now={now} />}
                    </div>

                    {hasData && (
                        <TrendChart
                            title={trendConfig.title}
                            points={series.points}
                            values={trendConfig.values}
                            rolling={trendConfig.rolling}
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
                    )}
                </div>

                {/* Weak spots → drill: the fix, one click from the proof. */}
                {(topWeakKeys.length > 0 || slowTransitions.length > 0) && (
                    <div data-testid="weak-spots" className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/5 p-5 lg:col-span-1 lg:self-start">
                        <div className="text-lg font-semibold text-base-content">Weak spots → drill</div>

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
                                    Drill weakest keys: {topWeakKeys.map((k) => k.key).join(", ")}
                                </Link>
                            </div>
                        )}

                        {slowTransitions.length > 0 && (
                            <div data-testid="worst-transitions">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/45">Slowest transitions</p>
                                <ul className="flex flex-col gap-2">
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
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {Object.keys(props.keyAttempts).length > 0 && (
                    <div data-testid="lifetime-keyboard-card" className="rounded-lg border border-base-content/10 bg-base-100/45 p-3 sm:p-5">
                        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-base font-semibold text-base-content">Lifetime keyboard</div>
                            <KeyHeatmapLegend />
                        </div>
                        <div className="flex w-full justify-center overflow-x-auto pb-1">
                            <KeyHeatmap attempts={props.keyAttempts} size="full" className="min-w-fit" testId="lifetime-heatmap" />
                        </div>
                    </div>
                )}

                {records.length > 0 && (
                    <div data-testid="records-timeline" className="rounded-lg border border-base-content/10 bg-base-100/45 p-4">
                        <div className="mb-3 text-lg font-semibold text-base-content">Records</div>
                        <ul className="space-y-2">
                            {records.slice(0, 6).map((event) => (
                                <li key={event.t} className="flex items-center justify-between border-b border-base-content/10 pb-2 text-sm last:border-b-0 last:pb-0">
                                    <span className="text-base-content/60">{new Date(event.t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                                    <span className="font-medium text-base-content">
                                        {event.kind === "threshold" ? `First ${event.threshold}+ WPM test` : `${event.wpm.toFixed(1)} WPM personal best`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

const Progress: NextPage = () => {
    const { data: sessionData, status } = useSession();
    const router = useRouter();
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
        () => mergeDailyRollups(rawRecords, rollupsQuery.data ?? []),
        [rawRecords, rollupsQuery.data],
    );

    // Lifetime per-key accuracy for the heatmap: DB practice stats when signed
    // in, the localStorage key-stat mirror for guests.
    const practiceStatsQuery = api.practiceStats.get.useQuery(undefined, { enabled: !!sessionData?.user });
    const dbKeyAttempts = useMemo(() => {
        const out: Record<string, KeyAttempt> = {};
        for (const stat of practiceStatsQuery.data ?? []) out[stat.character] = { attempts: stat.total, correct: stat.correct };
        return out;
    }, [practiceStatsQuery.data]);

    const transitionsQuery = api.transitionStats.get.useQuery(undefined, { enabled: !!sessionData?.user });
    const dbTransitions: TransitionAggregate[] = transitionsQuery.data ?? [];

    // Guest history + key-stats live in localStorage (read client-side after mount
    // to avoid an SSR mismatch). A guest with history gets the real dashboard + a
    // keep-it banner; a guest with none gets the signup pitch.
    const [guestRecords, setGuestRecords] = useState<ProgressRecord[]>([]);
    const [guestKeyAttempts, setGuestKeyAttempts] = useState<Record<string, KeyAttempt>>({});
    const [guestTransitions, setGuestTransitions] = useState<TransitionAggregate[]>([]);
    useEffect(() => {
        if (sessionData?.user) return;
        setGuestRecords(readLocalProgress().map((e) => ({ wpm: netFromRaw(e.wpm, e.accuracy), accuracy: e.accuracy, consistency: e.c, createdAt: new Date(e.t) })));
        const attempts: Record<string, KeyAttempt> = {};
        for (const stat of readLocalKeyStats()) attempts[stat.key] = { attempts: stat.attempts, correct: stat.correct };
        setGuestKeyAttempts(attempts);
        setGuestTransitions(readLocalTransitions());
    }, [sessionData?.user]);

    return (
        <>
            <Head>
                <title>Progress — TypeCafe</title>
                <meta name="description" content="Your typing progress over time: WPM trend, accuracy, and the delta that proves you're getting faster." />
            </Head>
            <div className="flex h-full w-full justify-center overflow-auto px-4 py-8">
                {status === "loading" || (sessionData?.user && (recordsQuery.isLoading || rollupsQuery.isLoading)) ? (
                    <div className="mt-16 text-base-content/50">Loading your progress…</div>
                ) : !sessionData?.user ? (
                    guestRecords.length > 0 ? (
                        <div className="w-full max-w-6xl space-y-4">
                            <div data-testid="guest-keep-banner" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
                                <span className="text-sm text-base-content/80">This progress lives on this device only.</span>
                                <label htmlFor="signInModal" className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                    Sign in to keep it forever
                                </label>
                            </div>
                            <ProgressDashboard records={guestRecords} keyAttempts={guestKeyAttempts} transitions={guestTransitions} />
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
                    <ProgressDashboard records={records} keyAttempts={dbKeyAttempts} transitions={dbTransitions} canShare username={sessionData.user.username ?? sessionData.user.name} />
                )}
            </div>
        </>
    );
};

export default Progress;
