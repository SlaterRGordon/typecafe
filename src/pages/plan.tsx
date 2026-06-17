import { type NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { generatePlan, type Plan, type PlanDay } from "~/lib/plan";
import { worstKeysFromAttempts } from "~/lib/stats";
import { worstTransitions, type TransitionAggregate } from "~/lib/transitions";
import type { KeyAttempt } from "~/lib/heatmap";
import { readLocalProgress } from "~/lib/progressHistory";
import { readLocalKeyStats } from "~/lib/localSync";
import { readLocalTransitions } from "~/lib/localTransitions";
import { api } from "~/utils/api";

const DONE_KEY = "typecafe:planDone";
const DAY_MS = 24 * 60 * 60 * 1000;
// ponytail: a fixed benchmark config; "the user's main config" can replace this
// once we read their most-used mode/length.
const BENCHMARK = { subMode: "timed" as const, count: 60 };

function readDoneDays(): number[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = JSON.parse(window.localStorage.getItem(DONE_KEY) ?? "[]") as unknown;
        return Array.isArray(raw) ? raw.filter((d): d is number => typeof d === "number") : [];
    } catch {
        return [];
    }
}

function DayCard(props: { entry: PlanDay; done: boolean; isToday: boolean }) {
    const { entry, done, isToday } = props;
    return (
        <div
            data-testid={isToday ? "plan-today" : undefined}
            className={`rounded-xl border p-5 ${isToday ? "border-primary/50 bg-primary/10" : done ? "border-base-content/10 bg-base-100/30 opacity-70" : "border-base-content/10 bg-base-100/45"}`}
        >
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-base-content">
                    Day {entry.day}{isToday ? " · today" : ""}{entry.isBenchmark ? " · benchmark" : ""}
                </p>
                {done && <span className="text-xs font-semibold text-success">Done</span>}
            </div>
            <ul className="mt-3 flex flex-col gap-2">
                {entry.steps.map((step, i) => (
                    <li key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm text-base-content/80">{step.label}</span>
                        <Link
                            href={step.href}
                            className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-content transition hover:opacity-85"
                        >
                            Start
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const PlanView = (props: { plan: Plan }) => {
    const { plan } = props;
    const [done, setDone] = useState<number[]>([]);
    useEffect(() => setDone(readDoneDays()), []);

    const doneSet = useMemo(() => new Set(done), [done]);
    const todayDay = plan.days.find((d) => !doneSet.has(d.day))?.day ?? null;

    const markTodayDone = () => {
        if (todayDay === null) return;
        const next = [...new Set([...done, todayDay])];
        try { window.localStorage.setItem(DONE_KEY, JSON.stringify(next)); } catch { /* blocked */ }
        setDone(next);
    };

    const today = plan.days.find((d) => d.day === todayDay) ?? null;

    return (
        <div className="w-full max-w-2xl space-y-6">
            <div>
                <h1 className="font-mono text-3xl font-bold tracking-tight">Your plan</h1>
                <p className="mt-1 text-base-content/60">
                    {plan.kind === "calibration"
                        ? "Calibration week — varied tests to build your profile, then your targeted plan begins."
                        : "A 30-day plan built from your weakest keys and transitions."}
                    {" "}{doneSet.size}/{plan.days.length} days done.
                </p>
            </div>

            {today ? (
                <div className="space-y-3">
                    <DayCard entry={today} done={false} isToday />
                    <button
                        type="button"
                        onClick={markTodayDone}
                        data-testid="plan-complete-day"
                        className="inline-flex items-center rounded-md border border-base-content/20 px-4 py-2 text-sm font-semibold text-base-content/80 transition hover:bg-base-content/5"
                    >
                        Mark day {today.day} complete
                    </button>
                </div>
            ) : (
                <div data-testid="plan-finished" className="rounded-xl border border-success/40 bg-success/10 p-5 text-success">
                    Plan complete — time to set a fresh goal and regenerate.
                </div>
            )}

            <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-base-content/45">All {plan.days.length} days</p>
                <div className="grid grid-cols-7 gap-2">
                    {plan.days.map((d) => (
                        <div
                            key={d.day}
                            title={`Day ${d.day}${d.isBenchmark ? " — benchmark" : ""}`}
                            className={`flex h-9 items-center justify-center rounded-md text-xs font-semibold ${
                                doneSet.has(d.day)
                                    ? "bg-primary text-primary-content"
                                    : d.day === todayDay
                                        ? "border border-primary text-primary"
                                        : "border border-base-content/15 text-base-content/50"
                            }`}
                        >
                            {d.isBenchmark ? "★" : d.day}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const PlanPage: NextPage = () => {
    const { data: sessionData, status } = useSession();
    const signedIn = !!sessionData?.user;

    const recordsQuery = api.test.getProgressRecords.useQuery(undefined, { enabled: signedIn });
    const practiceStatsQuery = api.practiceStats.get.useQuery(undefined, { enabled: signedIn });
    const transitionsQuery = api.transitionStats.get.useQuery(undefined, { enabled: signedIn });

    const [guest, setGuest] = useState<{ dates: number[]; keyAttempts: Record<string, KeyAttempt>; transitions: TransitionAggregate[] } | null>(null);
    useEffect(() => {
        if (signedIn) return;
        const keyAttempts: Record<string, KeyAttempt> = {};
        for (const s of readLocalKeyStats()) keyAttempts[s.key] = { attempts: s.attempts, correct: s.correct };
        setGuest({ dates: readLocalProgress().map((e) => e.t), keyAttempts, transitions: readLocalTransitions() });
    }, [signedIn]);

    const plan = useMemo(() => {
        const dates = signedIn ? (recordsQuery.data ?? []).map((r) => new Date(r.createdAt).getTime()) : guest?.dates ?? [];
        const keyAttempts: Record<string, KeyAttempt> = signedIn
            ? Object.fromEntries((practiceStatsQuery.data ?? []).map((s) => [s.character, { attempts: s.total, correct: s.correct }]))
            : guest?.keyAttempts ?? {};
        const transitions = signedIn ? (transitionsQuery.data ?? []) : guest?.transitions ?? [];

        const historyDays = dates.length > 0 ? (Date.now() - Math.min(...dates)) / DAY_MS : 0;
        return generatePlan({
            worstKeys: worstKeysFromAttempts(new Map(Object.entries(keyAttempts)), 6),
            worstTransitions: worstTransitions(transitions),
            benchmark: BENCHMARK,
            historyDays,
        });
    }, [signedIn, recordsQuery.data, practiceStatsQuery.data, transitionsQuery.data, guest]);

    const loading = status === "loading" || (signedIn && (recordsQuery.isLoading || practiceStatsQuery.isLoading || transitionsQuery.isLoading));

    return (
        <>
            <Head>
                <title>Your plan — TypeCafe</title>
                <meta name="description" content="Your personalized practice plan: daily targeted drills built from your weakest keys and transitions." />
            </Head>
            <div className="flex h-full w-full justify-center overflow-auto px-4 py-8">
                {loading ? <div className="mt-16 text-base-content/50">Building your plan…</div> : <PlanView plan={plan} />}
            </div>
        </>
    );
};

export default PlanPage;
