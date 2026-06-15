import { type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { TrendChart } from "~/components/progress/TrendChart";
import {
    PROGRESS_PERIODS,
    averageAccuracy,
    averageWpm,
    bestWpm,
    filterByPeriod,
    headlineDelta,
    trendSeries,
    type ProgressPeriod,
    type ProgressRecord,
} from "~/lib/progress";
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

function StatCell(props: { label: string; value: string }) {
    return (
        <div className="flex flex-col rounded-lg border border-base-content/10 bg-base-100/45 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-base-content/45">{props.label}</span>
            <span className="mt-1 font-mono text-2xl text-base-content">{props.value}</span>
        </div>
    );
}

const ProgressDashboard = (props: { records: ProgressRecord[] }) => {
    const [period, setPeriod] = useState<ProgressPeriod>(30);
    const now = useMemo(() => new Date(), []);

    const delta = useMemo(() => headlineDelta(props.records, period, now), [props.records, period, now]);
    const series = useMemo(() => trendSeries(props.records, period, now), [props.records, period, now]);
    const inPeriod = useMemo(() => filterByPeriod(props.records, period, now), [props.records, period, now]);

    const hasData = series.points.length > 0;

    return (
        <div className="w-full max-w-3xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-mono text-3xl font-bold tracking-tight">Progress</h1>
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

            {/* Headline delta — the largest number on the page; the one question
                "am I getting faster?" answered before any other detail. */}
            <div data-testid="headline-delta" className="rounded-xl border border-base-content/10 bg-base-100/45 p-6">
                {delta.delta !== null ? (
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

            {hasData && (
                <>
                    <TrendChart title="WPM over time" points={series.points} rollingWpm={series.rollingWpm} />

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatCell label="Avg WPM" value={averageWpm(inPeriod).toFixed(1)} />
                        <StatCell label="Best WPM" value={bestWpm(inPeriod).toFixed(1)} />
                        <StatCell label="Avg accuracy" value={`${averageAccuracy(inPeriod).toFixed(1)}%`} />
                        <StatCell label="Tests" value={String(inPeriod.length)} />
                    </div>
                </>
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
                createdAt: new Date(row.createdAt),
            })),
        [recordsQuery.data],
    );

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
                    // Local-first guest history is a later slice; for now signing in
                    // is how progression is kept. The page itself is the pitch.
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
                ) : (
                    <ProgressDashboard records={records} />
                )}
            </div>
        </>
    );
};

export default Progress;
