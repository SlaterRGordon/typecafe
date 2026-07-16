import { type NextPage } from "next"
import Head from "next/head"
import Link from "next/link"
import { useDailyCoachingSession } from "~/hooks/useDailyCoachingSession"
import {
    baselineResult,
    coldCheck,
    currentDailyStep,
    focusProof,
    focusStep,
    FOCUS_SETS_GOAL,
    stepGoalMet,
    transferProof,
    type DailyStep,
} from "~/lib/dailyCoaching"
import type { DrillDelta, DrillFinding } from "~/lib/drillProgress"

function findingHeadline(finding: DrillFinding): React.ReactNode {
    const reason = finding.evidence?.reason
    if (reason?.code === "transition_latency_above_baseline") {
        return <>your <span className="font-mono">{reason.pair[0]}→{reason.pair[1]}</span> transition is {reason.ratio.toFixed(1)}× slower than your typical one.</>
    }
    if (reason?.code === "transition_error_rate_high") {
        return <>your <span className="font-mono">{reason.pair[0]}→{reason.pair[1]}</span> transition misses {reason.errorRatePct.toFixed(0)}% of natural attempts.</>
    }
    if (reason?.code === "key_latency_above_baseline") {
        return <>your <span className="font-mono">{reason.key}</span> key arrives {reason.ratio.toFixed(1)}× slower than your typical key.</>
    }
    if (reason?.code === "key_accuracy_below_threshold") {
        return <>your <span className="font-mono">{reason.key}</span> key is {reason.accuracyPct.toFixed(0)}% accurate in natural typing.</>
    }
    if (reason?.code === "correction_confusion_recurs") {
        return <>you corrected <span className="font-mono">{reason.typed}</span> for <span className="font-mono">{reason.expected}</span> {reason.errors} times.</>
    }
    return finding.kind === "transition"
        ? <>your <span className="font-mono">{finding.from}→{finding.to}</span> transition is {finding.ratio.toFixed(1)}× slower than your typical one.</>
        : <>your weakest keys are <span className="font-mono">{finding.keys.join(" ")}</span>.</>
}

function formatMetric(value: number, unit: "ms" | "%" | "wpm"): string {
    return unit === "ms" ? `${Math.round(value)}ms` : unit === "wpm" ? `${value.toFixed(1)} WPM` : `${value.toFixed(1)}%`
}

function stepSummary(step: DailyStep, direction?: "lower" | "higher"): string | null {
    if (step.sets.length === 0) return null
    if (step.kind === "baseline" || step.kind === "calibration") {
        const set = step.sets[0]!
        return `${set.netWpm.toFixed(1)} WPM · ${set.accuracy.toFixed(1)}% accuracy`
    }
    const deltas = step.sets.map((set) => set.targetDelta).filter((d): d is DrillDelta => !!d)
    if (deltas.length === 0) return `${step.sets.length} ${step.sets.length === 1 ? "set" : "sets"}`
    const best = deltas.reduce((a, b) => (direction ?? a.direction ?? (a.unit === "ms" ? "lower" : "higher")) === "lower"
        ? (b.after < a.after ? b : a)
        : (b.after > a.after ? b : a))
    return `${step.sets.length} ${step.sets.length === 1 ? "set" : "sets"} · best ${formatMetric(best.after, best.unit)}`
}

const primaryCta = "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
const secondaryCta = "inline-flex min-h-11 items-center justify-center rounded-md border border-base-content/15 px-5 py-2.5 text-sm font-semibold text-base-content transition hover:bg-base-content/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"

const DailyCoachingPage: NextPage = () => {
    const { session, loading, finding } = useDailyCoachingSession()

    if (loading || !session) {
        return (
            <div className="flex h-full w-full items-center justify-center" role="status" aria-live="polite">
                <span className="text-base-content/60">Preparing today&apos;s coaching…</span>
            </div>
        )
    }

    const active = currentDailyStep(session)
    const stepsDone = session.steps.filter(stepGoalMet).length
    const acquisitionProof = focusProof(session)
    const proof = transferProof(session) ?? (session.prescription ? null : acquisitionProof)
    const cold = coldCheck(session)
    const baseline = baselineResult(session)
    const focus = focusStep(session)
    const dateLabel = new Date(`${session.dateKey}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    })

    return (
        <>
            <Head>
                <title>Today&apos;s coaching - TypeCafe</title>
                <meta name="description" content="Your daily typing coaching session, built from your recent keys and transitions." />
            </Head>
            <div className="flex h-full w-full justify-center overflow-auto px-4 py-8 sm:py-12">
                <main className="w-full max-w-3xl pb-24">
                    <header>
                        <p className="text-sm font-semibold text-primary">{dateLabel}</p>
                        <h1 className="mt-1 font-mono text-3xl font-bold tracking-tight text-base-content sm:text-4xl">Today&apos;s coaching</h1>
                        <p className="mt-3 max-w-2xl text-base leading-7 text-base-content/75">{session.reason}</p>
                    </header>

                    {session.status === "completed" && session.kind === "calibration" ? (
                        <section data-testid="daily-session-complete" className="mt-8 rounded-xl border border-success/40 bg-success/10 p-5 sm:p-6" aria-labelledby="session-complete-title">
                            <p className="text-xs font-bold uppercase tracking-wide text-success">Mapping done</p>
                            {finding ? (
                                <>
                                    <h2 id="session-complete-title" className="mt-1 text-2xl font-bold text-base-content">
                                        Found it: {findingHeadline(finding)}
                                    </h2>
                                    <p className="mt-3 text-sm text-base-content/75">Tomorrow&apos;s session targets it - or start on it right now.</p>
                                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                                        <Link href={finding.href} data-testid="daily-first-finding-drill" className={primaryCta}>
                                            Drill it now
                                        </Link>
                                        <Link href="/" className={secondaryCta}>Back home</Link>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h2 id="session-complete-title" className="mt-1 text-2xl font-bold text-base-content">Your map is in.</h2>
                                    <p className="mt-3 text-sm text-base-content/75">No single weakness stands out yet - another Test or two will surface one, and tomorrow&apos;s session picks it up.</p>
                                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                                        <Link href="/" className={primaryCta}>Take another Test</Link>
                                    </div>
                                </>
                            )}
                        </section>
                    ) : session.status === "completed" ? (
                        <section data-testid="daily-session-complete" className="mt-8 rounded-xl border border-success/40 bg-success/10 p-5 sm:p-6" aria-labelledby="session-complete-title">
                            <p className="text-xs font-bold uppercase tracking-wide text-success">Session complete</p>
                            <h2 id="session-complete-title" className="mt-1 text-2xl font-bold text-base-content">You did the work today.</h2>
                            {proof ? (
                                <div className="mt-5 rounded-lg border border-base-content/10 bg-base-100/35 p-4">
                                    <p className="text-xs font-semibold uppercase text-base-content/55">{proof.label} · baseline → Transfer</p>
                                    <p data-testid="daily-proof" className={`mt-1 font-mono text-3xl font-bold ${proof.improved ? "text-success" : "text-base-content"}`}>
                                        {formatMetric(proof.before, proof.unit)} → {formatMetric(proof.after, proof.unit)}
                                    </p>
                                    <p className={`mt-2 text-sm ${proof.improved ? "text-success" : "text-base-content/70"}`}>
                                        {proof.improved ? "The change showed up in varied text." : "The warm practice did not transfer yet. That is useful evidence, not Mastery."}
                                    </p>
                                </div>
                            ) : (
                                <p className="mt-4 text-sm text-base-content/75">
                                    Sets logged, but not enough reps landed on the target to measure a change honestly.
                                </p>
                            )}
                            {acquisitionProof && session.prescription && (
                                <p className="mt-3 text-sm text-base-content/65">
                                    Best acquisition set: {formatMetric(acquisitionProof.after, acquisitionProof.unit)} from {formatMetric(acquisitionProof.before, acquisitionProof.unit)}.
                                </p>
                            )}
                            {cold && (
                                <p data-testid="daily-cold-check" className="mt-4 text-sm text-base-content/75">
                                    Cold check on yesterday&apos;s <span className="font-mono font-bold text-base-content">{cold.yesterday.label}</span>:{" "}
                                    <span className="font-semibold text-base-content">{formatMetric(cold.value, cold.unit)}</span>
                                    {" "}(started at {formatMetric(cold.yesterday.before, cold.unit)} before drilling) -{" "}
                                    {cold.held ? <span className="font-semibold text-success">the change stuck.</span> : <span className="font-semibold text-warning">it slipped; worth another pass.</span>}
                                </p>
                            )}
                            {baseline && (
                                <p className="mt-3 text-sm text-base-content/65">Today&apos;s warm-up: {baseline.netWpm.toFixed(1)} WPM · {baseline.accuracy.toFixed(1)}% accuracy.</p>
                            )}
                            <p className="mt-3 text-sm text-base-content/65">
                                {proof?.improved ? "This Transfer result is eligible for a later cold check." : "A cold check is earned only after a qualified Transfer improvement."}
                            </p>
                            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                                {focus ? (
                                    <Link href={focus.href} className={primaryCta}>Extra targeted practice</Link>
                                ) : (
                                    <Link href="/progress" className={primaryCta}>See your progress</Link>
                                )}
                                <Link href="/" className={secondaryCta}>Back home</Link>
                            </div>
                        </section>
                    ) : (
                        <section data-testid="daily-session-active" className="mt-8 rounded-xl border border-primary/30 bg-primary/10 p-5 sm:p-6" aria-labelledby="active-step-title">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span className="font-semibold text-primary">{stepsDone === 0 ? "Ready for today" : "Session in progress"}</span>
                                <span className="text-base-content/60">About {session.estimatedMinutes} min · {stepsDone}/{session.steps.length} steps</span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-base-content/10" role="progressbar" aria-valuemin={0} aria-valuemax={session.steps.length} aria-valuenow={stepsDone} aria-label="Daily coaching progress">
                                <div className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${(stepsDone / session.steps.length) * 100}%` }} />
                            </div>
                            <p className="mt-6 text-xs font-bold uppercase tracking-wide text-primary">
                                Up next · Step {session.currentStepIndex + 1}
                                {active?.kind === "focus" && active.sets.length > 0 && ` · set ${Math.min(active.sets.length + 1, FOCUS_SETS_GOAL)} of up to ${FOCUS_SETS_GOAL}`}
                            </p>
                            <h2 id="active-step-title" className="mt-1 text-2xl font-bold text-base-content">{active?.title}</h2>
                            <p className="mt-2 text-base-content/70">{active?.detail}</p>
                            <Link href={active?.href ?? "/"} data-testid="daily-session-start" className={`${primaryCta} mt-5 w-full sm:w-auto`}>
                                {stepsDone === 0 && (active?.sets.length ?? 0) === 0 ? "Start today's session" : "Resume session"}
                            </Link>
                        </section>
                    )}

                    <section className="mt-8" aria-labelledby="session-steps-title">
                        <div className="flex items-end justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-base-content/50">Today&apos;s prescription</p>
                                <h2 id="session-steps-title" className="mt-1 text-xl font-bold text-base-content">
                                    {session.kind === "calibration" ? "Measure once, then target" : "Cold if due → measure → acquire → Transfer"}
                                </h2>
                            </div>
                            <span className="text-sm text-base-content/55">Frozen for today</span>
                        </div>
                        <ol className="mt-4 space-y-2">
                            {session.steps.map((item, index) => {
                                const isDone = stepGoalMet(item)
                                const isActive = session.status === "active" && index === session.currentStepIndex
                                const summary = stepSummary(item, session.prescription?.direction)
                                return (
                                    <li key={item.id} className={`flex gap-3 rounded-lg border p-4 ${isActive ? "border-primary/35 bg-primary/5" : "border-base-content/10 bg-base-100/25"}`}>
                                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${isDone ? "border-success/50 bg-success/15 text-success" : isActive ? "border-primary bg-primary text-primary-content" : "border-base-content/20 text-base-content/45"}`} aria-hidden="true">
                                            {isDone ? "✓" : index + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-base-content">{item.title}</p>
                                            <p className="mt-0.5 text-sm text-base-content/60">{summary ?? item.detail}</p>
                                        </div>
                                    </li>
                                )
                            })}
                        </ol>
                    </section>
                </main>
            </div>
        </>
    )
}

export default DailyCoachingPage
