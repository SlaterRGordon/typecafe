import { type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { TrendChart } from "~/components/progress/TrendChart";
import { GoalCard } from "~/components/progress/GoalCard";
import { KeyHeatmap } from "~/components/heatmap/KeyHeatmap";
import type { KeyAttempt } from "~/lib/heatmap";
import { readLocalKeyStats } from "~/lib/localSync";
import { readLocalTransitions } from "~/lib/localTransitions";
import { worstTransitions, type TransitionAggregate } from "~/lib/transitions";
import {
    PROGRESS_PERIODS,
    averageAccuracy,
    averageConsistency,
    averageWpm,
    bestWpm,
    currentStreak,
    filterByPeriod,
    headlineDelta,
    personalRecords,
    rollingAverage,
    trendSeries,
    type ProgressPeriod,
    type ProgressRecord,
} from "~/lib/progress";
import { readLocalProgress } from "~/lib/progressHistory";
import { buildRecap, isRecapDue } from "~/lib/recap";
import { computeStance } from "~/lib/stance";
import { detectPlateau } from "~/lib/trajectory";
import { api } from "~/utils/api";

const RECAP_SEEN_KEY = "typecafe:lastRecapAt";

function periodLabel(period: ProgressPeriod): string {
    return period === "all" ? "All" : `${period}d`;
}

function periodPhrase(period: ProgressPeriod): string {
    return period === "all" ? "all time" : `the last ${period} days`;
}

function formatSigned(value: number, digits = 1): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function StatCell(props: { label: string; value: string }) {
    return (
        <div className="flex flex-col rounded-lg border border-base-content/10 bg-base-100/45 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-base-content/45">{props.label}</span>
            <span className="mt-1 font-mono text-2xl text-base-content">{props.value}</span>
        </div>
    );
}

function periodShareLabel(period: ProgressPeriod): string {
    return period === "all" ? "all time" : `${period} days`;
}

const ProgressDashboard = (props: { records: ProgressRecord[]; keyAttempts: Record<string, KeyAttempt>; transitions: TransitionAggregate[]; canShare?: boolean; username?: string | null }) => {
    const [period, setPeriod] = useState<ProgressPeriod>(30);
    const [shareState, setShareState] = useState<"idle" | "sharing" | "copied">("idle");
    const now = useMemo(() => new Date(), []);
    const createProgressShare = api.scoreShare.createProgress.useMutation();

    const streak = useMemo(() => currentStreak(props.records, now, -now.getTimezoneOffset()), [props.records, now]);
    const delta = useMemo(() => headlineDelta(props.records, period, now), [props.records, period, now]);
    const series = useMemo(() => trendSeries(props.records, period, now), [props.records, period, now]);
    const inPeriod = useMemo(() => filterByPeriod(props.records, period, now), [props.records, period, now]);
    const records = useMemo(() => personalRecords(props.records), [props.records]);
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
    const avgConsistency = averageConsistency(inPeriod);
    const stance = useMemo(() => computeStance(props.records, now), [props.records, now]);
    const plateau = useMemo(() => detectPlateau(props.records, now), [props.records, now]);
    const slowTransitions = useMemo(() => worstTransitions(props.transitions), [props.transitions]);

    const hasData = series.points.length > 0;
    // A progress card only makes sense with a real delta to brag about.
    const canShare = !!props.canShare && delta.delta !== null && series.points.length > 0;

    // Weekly recap (§3.4): a surface, not a send. Shows on the first visit >= 7
    // days after the last one (tracked in localStorage), dismissable.
    const recap = useMemo(() => buildRecap(props.records, props.keyAttempts, now, -now.getTimezoneOffset()), [props.records, props.keyAttempts, now]);
    const [recapDue, setRecapDue] = useState(false);
    useEffect(() => {
        const raw = typeof window === "undefined" ? null : window.localStorage.getItem(RECAP_SEEN_KEY);
        setRecapDue(isRecapDue(raw ? Number(raw) : null, Date.now()));
    }, []);
    const dismissRecap = () => {
        try { window.localStorage.setItem(RECAP_SEEN_KEY, String(Date.now())); } catch { /* storage blocked */ }
        setRecapDue(false);
    };

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
        <div className="w-full max-w-3xl space-y-6">
            {recapDue && hasData && (
                <div data-testid="weekly-recap" className="relative rounded-xl border border-primary/40 bg-primary/10 p-5">
                    <button type="button" aria-label="Dismiss recap" onClick={dismissRecap} className="absolute right-3 top-3 text-base-content/50 hover:text-base-content">✕</button>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Your week</p>
                    <p className="mt-1 text-lg font-semibold text-base-content">
                        {recap.weekDeltaWpm !== null
                            ? `${recap.weekDeltaWpm >= 0 ? "+" : ""}${recap.weekDeltaWpm.toFixed(1)} WPM this week`
                            : `${recap.testsThisWeek} ${recap.testsThisWeek === 1 ? "test" : "tests"} this week`}
                    </p>
                    <p className="mt-1 text-sm text-base-content/60">
                        {recap.testsThisWeek} {recap.testsThisWeek === 1 ? "test" : "tests"}
                        {recap.streak > 0 ? ` · ${recap.streak}-day streak` : ""}
                    </p>
                    {recap.focus && (
                        <>
                            <p className="mt-3 text-sm text-base-content/80">
                                Your weakest key is <span className="font-bold text-base-content">{recap.focus.key.toUpperCase()}</span> — you hit it right {recap.focus.accuracy.toFixed(0)}% of the time ({recap.focus.attempts} tries). Drilling it is the fastest win this week.
                            </p>
                            <Link href={`/?mode=practice&keys=${recap.focus.key}`} className="mt-2 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                Drill {recap.focus.key.toUpperCase()}
                            </Link>
                        </>
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <h1 className="font-mono text-3xl font-bold tracking-tight">Progress</h1>
                    {streak > 0 && (
                        <span data-testid="streak-chip" className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
                            {streak}-day streak
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

            {/* Headline delta — the largest number on the page; the one question
                "am I getting faster?" answered before any other detail. */}
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
                            <span className={`font-mono text-5xl font-bold ${delta.trend === "up" ? "text-success" : delta.trend === "down" ? "text-error" : "text-base-content"}`}>
                                {formatSigned(delta.delta)}
                            </span>
                            <span className="text-2xl font-semibold text-base-content/70">WPM</span>
                        </div>
                        <p className="mt-2 text-base-content/60">
                            {delta.trend === "up" && `Faster over ${periodPhrase(period)} — keep going.`}
                            {delta.trend === "down" && `Down over ${periodPhrase(period)}. Your drills aren't targeting your slow keys yet.`}
                            {delta.trend === "flat" && `Flat over ${periodPhrase(period)}. A plateau means it's time to drill your slow keys.`}
                        </p>
                        {delta.trend !== "up" && (
                            <Link href="/?mode=practice" className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                Drill your slow keys
                            </Link>
                        )}
                    </>
                ) : (
                    <>
                        <div className="font-mono text-3xl font-bold text-base-content">
                            {hasData ? `${averageWpm(inPeriod).toFixed(1)} WPM` : "No tests yet"}
                        </div>
                        <p className="mt-2 text-base-content/60">
                            {hasData
                                ? `Keep testing over ${periodPhrase(period)} — once there's a window to compare against, your delta shows here.`
                                : "Complete a few tests and your trend appears here."}
                        </p>
                        <Link href="/" className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                            Take a test
                        </Link>
                    </>
                )}
            </div>

            {stance.enoughData && (
                <div data-testid="stance" className="rounded-xl border border-base-content/10 bg-base-100/45 p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Coach</p>
                    <p className="mt-1 text-lg font-semibold text-base-content">{stance.headline}</p>
                    <p className="mt-1 text-sm text-base-content/60">{stance.advice}</p>
                </div>
            )}

            {hasData && <GoalCard records={props.records} now={now} />}

            {hasData && (
                <>
                    <TrendChart title="WPM over time" points={series.points} values={series.points.map((p) => p.wpm)} rolling={series.rollingWpm} baseline="zero" />
                    <TrendChart title="Accuracy over time" points={series.points} values={accuracy.values} rolling={accuracy.rolling} baseline="fit" valueSuffix="%" />
                    {consistency && (
                        <TrendChart title="Consistency over time" points={series.points} values={consistency.values} rolling={consistency.rolling} baseline="fit" valueSuffix="%" />
                    )}

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatCell label="Avg WPM" value={averageWpm(inPeriod).toFixed(1)} />
                        <StatCell label="Best WPM" value={bestWpm(inPeriod).toFixed(1)} />
                        <StatCell label="Avg accuracy" value={`${averageAccuracy(inPeriod).toFixed(1)}%`} />
                        {avgConsistency !== null
                            ? <StatCell label="Avg consistency" value={`${avgConsistency.toFixed(1)}%`} />
                            : <StatCell label="Tests" value={String(inPeriod.length)} />}
                    </div>
                </>
            )}

            {Object.keys(props.keyAttempts).length > 0 && (
                <div className="rounded-lg border border-base-content/10 bg-base-100/45 p-4">
                    <div className="mb-3 text-lg font-semibold text-base-content">Lifetime keyboard</div>
                    <KeyHeatmap attempts={props.keyAttempts} size="full" testId="lifetime-heatmap" />
                </div>
            )}

            {slowTransitions.length > 0 && (
                <div data-testid="worst-transitions" className="rounded-lg border border-base-content/10 bg-base-100/45 p-4">
                    <div className="mb-1 text-lg font-semibold text-base-content">Slowest transitions</div>
                    <p className="mb-3 text-sm text-base-content/60">The key pairs that cost you the most — drill the move, not just the keys.</p>
                    <ul className="flex flex-col gap-3">
                        {slowTransitions.map((t) => (
                            <li key={t.pair} className="flex flex-col gap-2 border-b border-base-content/10 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-base-content/90">
                                    <span className="font-mono font-bold text-base-content">{t.from}→{t.to}</span> takes you {t.ratio.toFixed(1)}× your average{t.errorRate >= 0.1 ? ` and misses ${Math.round(t.errorRate * 100)}% of the time` : ""}.
                                </span>
                                <Link
                                    href={`/?mode=practice&keys=${t.from},${t.to}`}
                                    className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85"
                                >
                                    Drill {t.from}{t.to}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {records.length > 0 && (
                <div data-testid="records-timeline" className="rounded-lg border border-base-content/10 bg-base-100/45 p-4">
                    <div className="mb-3 text-lg font-semibold text-base-content">Records</div>
                    <ul className="space-y-2">
                        {records.slice(0, 8).map((event) => (
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
    );
};

const Progress: NextPage = () => {
    const { data: sessionData, status } = useSession();
    const router = useRouter();
    const recordsQuery = api.test.getProgressRecords.useQuery(undefined, {
        enabled: !!sessionData?.user,
    });

    const records: ProgressRecord[] = useMemo(
        () =>
            (recordsQuery.data ?? []).map((row) => ({
                wpm: row.wpm,
                accuracy: row.accuracy,
                consistency: row.consistency,
                createdAt: new Date(row.createdAt),
            })),
        [recordsQuery.data],
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
        setGuestRecords(readLocalProgress().map((e) => ({ wpm: e.wpm, accuracy: e.accuracy, consistency: e.c, createdAt: new Date(e.t) })));
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
                {status === "loading" || (sessionData?.user && recordsQuery.isLoading) ? (
                    <div className="mt-16 text-base-content/50">Loading your progress…</div>
                ) : !sessionData?.user ? (
                    guestRecords.length > 0 ? (
                        <div className="w-full max-w-3xl space-y-4">
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
