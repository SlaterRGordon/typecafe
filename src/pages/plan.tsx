import { type NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { generatePlan, type DrillStep, type Plan } from "~/lib/plan";
import {
    completeStep,
    initialSession,
    nextDay,
    parseSession,
    PLAN_SESSION_KEY,
    reconcile,
    type PlanSessionState,
} from "~/lib/planSession";
import { worstKeysFromAttempts } from "~/lib/stats";
import { worstTransitions } from "~/lib/transitions";
import type { KeyAttempt } from "~/lib/heatmap";
import { useGuestEvidence } from "~/hooks/useGuestEvidence";
import { api } from "~/utils/api";

const DAY_MS = 24 * 60 * 60 * 1000;
// ponytail: a fixed benchmark config; "the user's main config" can replace this
// once we read their most-used mode/length.
const BENCHMARK = { subMode: "timed" as const, count: 60 };

// A step that launches a test deep-links out and comes back as /plan?step=done.
function withReturn(href: string): string {
    return `${href}${href.includes("?") ? "&" : "?"}return=plan`;
}

const COACH_HEADLINE: Record<DrillStep["kind"], string> = {
    warmup: "Warm up",
    keys: "Drill your weak keys",
    transition: "Drill the transition",
    benchmark: "Benchmark",
    calibration: "Calibration test",
};

function readSession(): PlanSessionState | null {
    if (typeof window === "undefined") return null;
    return parseSession(window.localStorage.getItem(PLAN_SESSION_KEY));
}

const GuidedPlan = (props: { plan: Plan }) => {
    const { plan } = props;
    const router = useRouter();
    const [session, setSession] = useState<PlanSessionState>(initialSession);
    const [loaded, setLoaded] = useState(false);

    // Resume the saved position (client-only to avoid a hydration mismatch).
    useEffect(() => {
        setSession(reconcile(readSession() ?? initialSession(), plan));
        setLoaded(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (loaded) {
            try { window.localStorage.setItem(PLAN_SESSION_KEY, JSON.stringify(session)); } catch { /* blocked */ }
        }
    }, [session, loaded]);

    // A drill/benchmark step returns here as /plan?step=done once its test is done.
    useEffect(() => {
        if (!router.isReady || !loaded) return;
        if (router.query.step !== "done") return;
        setSession((s) => completeStep(reconcile(s, plan), plan));
        void router.replace("/plan", undefined, { shallow: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady, router.query.step, loaded]);

    const safe = useMemo(() => reconcile(session, plan), [session, plan]);
    const day = plan.days[safe.day - 1]!;
    const step = day.steps[safe.stepIndex];
    const isLastDay = safe.day >= plan.days.length;

    const advance = () => setSession(completeStep(safe, plan));
    const startNextDay = () => setSession(nextDay(safe, plan));
    const restart = () => setSession(initialSession());

    const doneDays = safe.status === "plan-done" ? plan.days.length : safe.day - 1;

    return (
        <div className="w-full max-w-2xl space-y-6">
            <div>
                <h1 className="font-mono text-3xl font-bold tracking-tight">Your plan</h1>
                <p className="mt-1 text-base-content/60">
                    {plan.kind === "calibration"
                        ? "Calibration week — varied tests to build your profile, then your targeted plan begins."
                        : "A 30-day plan built from your weakest keys and transitions."}
                    {" "}{doneDays}/{plan.days.length} days done.
                </p>
            </div>

            {safe.status === "plan-done" ? (
                <div data-testid="plan-finished" className="rounded-xl border border-success/40 bg-success/10 p-6">
                    <h2 className="text-2xl font-bold text-success">Plan complete 🎉</h2>
                    <p className="mt-1 text-base-content/70">You worked every day of the plan. Set a fresh goal and regenerate to keep climbing.</p>
                    <button type="button" onClick={restart} className="mt-4 inline-flex items-center rounded-md border border-base-content/20 px-4 py-2 text-sm font-semibold text-base-content/80 transition hover:bg-base-content/5">
                        Restart plan
                    </button>
                </div>
            ) : safe.status === "day-done" ? (
                <div data-testid="plan-day-done" className="rounded-xl border border-success/40 bg-success/10 p-6">
                    <p className="text-xs font-semibold uppercase tracking-wide text-success">Day {safe.day} complete</p>
                    <h2 className="mt-1 text-2xl font-bold text-base-content">Nice — that&apos;s today&apos;s session done.</h2>
                    <p className="mt-1 text-base-content/70">Come back tomorrow, or keep the momentum going.</p>
                    <button type="button" onClick={startNextDay} data-testid="plan-next-day" className="mt-4 inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-content transition hover:opacity-85">
                        {isLastDay ? "Finish plan →" : `Start day ${safe.day + 1} →`}
                    </button>
                </div>
            ) : step ? (
                <>
                    {/* One active step at a time, with the coach's framing. */}
                    <div>
                        <div className="mb-2 flex items-center justify-between text-sm text-base-content/55">
                            <span>Day {safe.day} of {plan.days.length}</span>
                            <span>Step {safe.stepIndex + 1} of {day.steps.length}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-base-content/10">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(safe.stepIndex / day.steps.length) * 100}%` }} />
                        </div>
                    </div>

                    <div data-testid="plan-active-step" className="rounded-xl border border-primary/30 bg-primary/10 p-6">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                            {day.isBenchmark ? "Benchmark day" : `Day ${safe.day}`}
                        </p>
                        <h2 className="mt-1 text-2xl font-bold text-base-content">{COACH_HEADLINE[step.kind]}</h2>
                        <p className="mt-1 text-base-content/70">{step.label}</p>

                        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
                            {/* Every step launches on /drill (or home for grams) and advances
                                on completion; Skip is the manual fallback so nobody's stuck.
                                Full-page nav so the test surface mounts cleanly with ?return=plan. */}
                            <a href={withReturn(step.href)} data-testid="plan-start-step" className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                {step.kind === "warmup" ? "Start warm-up →" : "Start →"}
                            </a>
                            <button type="button" onClick={advance} data-testid="plan-advance" className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-base-content/55 transition hover:text-base-content">
                                Skip →
                            </button>
                        </div>
                    </div>
                </>
            ) : null}

            <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-base-content/45">All {plan.days.length} days</p>
                <div className="grid grid-cols-7 gap-2">
                    {plan.days.map((d) => {
                        const isDone = safe.status === "plan-done" || d.day < safe.day;
                        const isToday = safe.status === "active" && d.day === safe.day;
                        return (
                            <div
                                key={d.day}
                                title={`Day ${d.day}${d.isBenchmark ? " — benchmark" : ""}`}
                                className={`flex h-9 items-center justify-center rounded-md text-xs font-semibold ${
                                    isDone
                                        ? "bg-primary text-primary-content"
                                        : isToday
                                            ? "border border-primary text-primary"
                                            : "border border-base-content/15 text-base-content/50"
                                }`}
                            >
                                {d.isBenchmark ? "★" : d.day}
                            </div>
                        );
                    })}
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

    const guest = useGuestEvidence();

    const plan = useMemo(() => {
        const dates = signedIn ? (recordsQuery.data ?? []).map((r) => new Date(r.createdAt).getTime()) : (guest?.progress ?? []).map((e) => e.t);
        const keyAttempts: Record<string, KeyAttempt> = signedIn
            ? Object.fromEntries((practiceStatsQuery.data ?? []).map((s) => [s.character, { attempts: s.total, correct: s.correct }]))
            : Object.fromEntries((guest?.keyStats ?? []).map((s) => [s.key, { attempts: s.attempts, correct: s.correct }]));
        const transitions = signedIn ? (transitionsQuery.data ?? []) : (guest?.transitions ?? []);

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
                <meta name="description" content="Your personalized practice plan: a coach-guided daily session built from your weakest keys and transitions." />
            </Head>
            <div className="flex h-full w-full justify-center overflow-auto px-4 py-8">
                {loading ? <div className="mt-16 text-base-content/50">Building your plan…</div> : <GuidedPlan plan={plan} />}
            </div>
        </>
    );
};

export default PlanPage;
