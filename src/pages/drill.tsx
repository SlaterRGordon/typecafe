import { type NextPage } from "next"
import Head from "next/head"
import Link from "next/link"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Typer, type TestCompletionResult } from "~/components/typer/Typer"
import { useRestartShortcut } from "~/components/typer/hooks/useRestartShortcut"
import { typingFocusFadeClass } from "~/components/typer/typingFocus"
import { TestGramScopes, TestGramSources, TestModes, TestSubModes } from "~/components/typer/types"
import { applyTextOptions, ensureLanguageLoaded, getWords } from "~/components/typer/utils"
import { useLanguage } from "~/hooks/useLanguage"
import { compileDrillText } from "~/lib/drill"
import { evidenceContextForRun } from "~/lib/evidenceContext"
import { parseCoachingTargetQuery, targetAccuracyPolicy, targetDisplayLabel } from "~/lib/coachingTarget"
import type { EvidenceContext } from "~/lib/evidenceContext"
import {
    currentDailyStep,
    DAILY_COACHING_UPDATED_EVENT,
    FOCUS_SETS_GOAL,
    GUEST_DAILY_SCOPE,
    localDateKey,
    readLocalDailySession,
    recordDailySet,
    targetMatchesDrill,
    writeLocalDailySession,
    type DailyCoachingSession,
} from "~/lib/dailyCoaching"
import { isDrillMark, isDrillDigit, isDrillableKey, isPracticeLetter } from "~/lib/drillKeys"
import { attemptsFromEvents, keyDrillDelta, keysBaseline, mergeAttempts, nextDrillFinding, transitionBaseline, transitionDrillDelta, type DrillDelta, type DrillFinding } from "~/lib/drillProgress"
import { decodeTimeline } from "~/lib/keystrokes"
import { readLocalKeyStats, type LocalKeyStat } from "~/lib/localSync"
import { readLocalTransitions } from "~/lib/localTransitions"
import { statsPoolFor } from "~/lib/keyboardLayout"
import { useLayout } from "~/hooks/useLayout"
import { isAnyModalOpen } from "~/lib/modals"
import { aggregateTransitions, mergeTransitions, type TransitionAggregate } from "~/lib/transitions"
import { api } from "~/utils/api"

const DRILL_EVIDENCE_CONTEXT = evidenceContextForRun({ surface: "drill", mode: TestModes.normal })

type DrillKind = "keys" | "transitions" | "words" | "timed"

interface DrillConfig {
    kind: DrillKind,
    labels: string[],
    // The raw drilled targets (pairs or keys); empty for a timed warm-up.
    targets: string[],
    text: string,
    // Duration for a timed drill (warm-up); absent for word drills.
    seconds?: number,
    evidenceContext: EvidenceContext,
    eyebrow?: string,
    accuracyGoalPct?: number,
}

interface LifetimeEvidence {
    transitions: TransitionAggregate[],
    keyStats: LocalKeyStat[],
}

// A drill is a quick, clearly-ending rep - short enough that finishing it and
// moving on (e.g. to the next plan step) never feels like an endless test.
const DEFAULT_DRILL_WORDS = 20

const parseLength = (value: string | string[] | undefined): number => {
    const raw = Array.isArray(value) ? value[0] : value
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return DEFAULT_DRILL_WORDS
    return Math.min(Math.max(Math.floor(parsed), 1), 120)
}

const parseSeconds = (value: string | string[] | undefined): number => {
    const raw = Array.isArray(value) ? value[0] : value
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return 0
    return Math.min(Math.max(Math.floor(parsed), 0), 600)
}

const parseKeys = (value: string | string[] | undefined): string[] => {
    const raw = Array.isArray(value) ? value.join(",") : value ?? ""
    // Accented letters (é, ü, ą) are drillable targets alongside a–z/digits/marks.
    return Array.from(new Set(raw
        .split(",")
        .map((key) => key.trim().toLowerCase())
        .filter((key) => isDrillableKey(key) || isPracticeLetter(key))))
}

// Words to drill verbatim (letters-only, lowercased, deduped) - the toughest-words
// handoff from a diagnosis. Non-letter tokens are dropped (can't form drill text);
// accented words (für, café) pass, matching compileDrillText's normalizeWord.
const parseWords = (value: string | string[] | undefined): string[] => {
    const raw = Array.isArray(value) ? value.join(",") : value ?? ""
    return Array.from(new Set(raw
        .split(",")
        .map((word) => word.trim().toLowerCase())
        .filter((word) => /^\p{L}+$/u.test(word))))
}

const parseTransitions = (value: string | string[] | undefined): string[] => {
    const raw = Array.isArray(value) ? value.join(",") : value ?? ""
    return Array.from(new Set(raw
        .split(",")
        .map((pair) => pair.toLowerCase().split("").filter(isDrillableKey).join(""))
        .filter((pair) => pair.length >= 2)
        .map((pair) => pair.slice(0, 2))))
}

function transitionLabel(pair: string) {
    return `${pair[0]}→${pair[1]}`
}

// Delta over absolutes: lead with how this rep moved against the lifetime
// baseline on the drilled target.
function DeltaLine({ delta }: { delta: DrillDelta }) {
    const diff = delta.unit === "ms" ? Math.round(Math.abs(delta.after - delta.before)) : Math.abs(delta.after - delta.before)
    const flat = delta.unit === "ms" ? diff === 0 : diff < 0.05
    const change = flat
        ? "even with"
        : delta.unit === "ms"
            ? `${diff}ms ${delta.improved ? "faster" : "slower"} than`
            : `${diff.toFixed(1)} pts ${delta.improved ? "above" : "below"}`
    const rep = delta.unit === "ms" ? `${Math.round(delta.after)}ms` : `${delta.after.toFixed(1)}%`
    const lifetime = delta.unit === "ms" ? `${Math.round(delta.before)}ms` : `${delta.before.toFixed(1)}%`
    return (
        <p data-testid="drill-delta" className="mt-4 text-sm text-base-content/75">
            <span className="font-mono font-bold text-base-content">{delta.label}</span>{": "}
            <span className={flat ? "" : delta.improved ? "font-semibold text-success" : "font-semibold text-warning"}>{change}</span>
            {" "}your recent average - {rep} this rep vs {lifetime}.
        </p>
    )
}

const Drill: NextPage = () => {
    const router = useRouter()
    const [completed, setCompleted] = useState<TestCompletionResult | null>(null)
    const [typingFocused, setTypingFocused] = useState(false)
    const [restartSignal, setRestartSignal] = useState(0)
    const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
    const resultRestartRef = useRef<HTMLButtonElement>(null)
    const [dailySession, setDailySession] = useState<DailyCoachingSession | null>(null)
    // Keeps the coaching strip visible after a recorded set advances/finishes
    // the session (the next step may not match this drill's config anymore).
    const recordedHereRef = useRef(false)
    // One recorded set per rep: the eager and persisted completion reports share
    // the same timeline array, so reference equality dedupes them.
    const recordedSetRef = useRef<TestCompletionResult["timeline"] | null>(null)
    // This session's reps on the drilled target (delta.after per completed rep).
    const [sessionReps, setSessionReps] = useState<number[]>([])

    // Drill words follow the global language. Load its list before compiling text,
    // so the drill is built once from the right words (getWords falls back to
    // English until loaded). English is bundled, so this resolves immediately.
    const [language] = useLanguage()
    const [langReady, setLangReady] = useState(false)
    useEffect(() => {
        let active = true
        setLangReady(false)
        void ensureLanguageLoaded(language).then(() => { if (active) setLangReady(true) })
        return () => { active = false }
    }, [language])

    const config = useMemo<DrillConfig | null>(() => {
        if (!router.isReady || !langReady) return null

        const length = parseLength(router.query.length)
        const keys = parseKeys(router.query.keys)
        const transitions = parseTransitions(router.query.transitions)
        const words = parseWords(router.query.words)
        const seconds = parseSeconds(router.query.seconds)
        const wordList = getWords(language)
        const coaching = parseCoachingTargetQuery(router.query)

        if (coaching && !coaching.legacy && coaching.target.kind !== "endurance") {
            const target = coaching.target
            const accuracyPolicy = targetAccuracyPolicy(target)
            const kind: DrillKind = target.kind === "transition"
                ? "transitions"
                : target.kind === "key" || target.kind === "correction" ? "keys" : "words"
            const targets = target.kind === "transition"
                ? [target.pair]
                : target.kind === "key"
                    ? target.keys
                    : target.kind === "correction" ? [target.expected] : []
            return {
                kind,
                labels: [targetDisplayLabel(target)],
                targets,
                text: compileDrillText({
                    target,
                    policy: coaching.policy,
                    seenWords: coaching.seenWords,
                    wordList,
                    length,
                }),
                evidenceContext: coaching.policy,
                eyebrow: target.kind === "movement"
                    ? "Movement drill"
                    : target.kind === "gram" ? "Pattern drill" : accuracyPolicy ? "Accuracy drill" : undefined,
                ...(accuracyPolicy ? { accuracyGoalPct: accuracyPolicy.goalPct } : {}),
            }
        }

        if (words.length > 0) {
            return {
                kind: "words",
                labels: words,
                targets: words,
                text: compileDrillText({ words, wordList, length }),
                evidenceContext: DRILL_EVIDENCE_CONTEXT,
            }
        }

        if (transitions.length > 0) {
            return {
                kind: "transitions",
                labels: transitions.map(transitionLabel),
                targets: transitions,
                text: compileDrillText({ transitions, wordList, length }),
                evidenceContext: DRILL_EVIDENCE_CONTEXT,
            }
        }

        if (keys.length > 0) {
            // Letters build the words; locked digits/marks get sprinkled in (the
            // same tested sprinkler Practice uses), so a weak ; or 5 gets real reps
            // in natural prose instead of being stripped out.
            const letters = keys.filter(isPracticeLetter)
            const marks = keys.filter(isDrillMark)
            const digits = keys.filter(isDrillDigit)
            return {
                kind: "keys",
                labels: keys,
                targets: keys,
                text: applyTextOptions(compileDrillText({ keys: letters, wordList, length }), false, false, {
                    marks,
                    digits,
                    language,
                    targeted: true,
                }),
                evidenceContext: DRILL_EVIDENCE_CONTEXT,
            }
        }

        // A timed warm-up: a generic timed test, no target keys.
        if (seconds > 0) {
            return { kind: "timed", labels: [`${seconds}s`], targets: [], text: "", seconds, evidenceContext: DRILL_EVIDENCE_CONTEXT }
        }

        return null
    }, [router.isReady, langReady, language, router.query])

    const restartDrill = () => {
        setCompleted(null)
        setRestartSignal((signal) => signal + 1)
    }

    useRestartShortcut(resultRestartRef, restartDrill, isAnyModalOpen, { enabled: !!completed })

    const { data: sessionData } = useSession()
    const signedIn = !!sessionData?.user
    // Lifetime key/transition evidence follows the active layout's stats pool
    // (docs/features/keyboard-layouts.md decision 6).
    const [activeLayout] = useLayout()
    const pool = statsPoolFor(activeLayout)
    const transitionsQuery = api.transitionStats.get.useQuery({ pool }, { enabled: signedIn })
    const practiceStatsQuery = api.practiceStats.get.useQuery({ pool }, { enabled: signedIn })

    // Lifetime evidence snapshotted while the rep runs and frozen at completion,
    // so the result's before→after delta compares against the data as it stood
    // *before* this rep (completion syncs the rep into the lifetime data).
    const [baseline, setBaseline] = useState<LifetimeEvidence>({ transitions: [], keyStats: [] })
    useEffect(() => {
        if (completed) return
        setBaseline(signedIn
            ? {
                transitions: transitionsQuery.data ?? [],
                keyStats: (practiceStatsQuery.data ?? []).map((s) => ({ key: s.character, attempts: s.total, correct: s.correct })),
            }
            : { transitions: readLocalTransitions(pool), keyStats: readLocalKeyStats(pool) })
    }, [completed, restartSignal, signedIn, pool, transitionsQuery.data, practiceStatsQuery.data])

    // The header states the baseline being drilled against (the number to beat)
    // and offers the next pick straight from lifetime evidence - no completed
    // rep required, so a restart never strands the user without a way forward.
    const headerStat = useMemo(() => {
        if (!config) return null
        if (config.accuracyGoalPct) return `Accuracy goal: ${config.accuracyGoalPct}%. Slow down; a clean sample matters more than speed.`
        if (config.kind === "transitions") {
            for (const pair of config.targets) {
                const base = transitionBaseline(pair, baseline.transitions)
                if (base) return `${Math.round(base.meanMs)}ms on this jump - ${base.ratio.toFixed(1)}× your typical transition. Beat it below.`
            }
            return null
        }
        if (config.kind === "keys") {
            const base = keysBaseline(config.targets, baseline.keyStats)
            if (base) return `${base.accuracy.toFixed(1)}% recent accuracy on ${config.targets.length > 1 ? "these keys" : "this key"}. Beat it below.`
        }
        return null
    }, [config, baseline])

    const headerNext = useMemo<DrillFinding | null>(() => {
        // Words drills have no per-word lifetime baseline to suggest a next pick from.
        if (!config || config.kind === "timed" || config.kind === "words") return null
        return nextDrillFinding(
            baseline.transitions,
            mergeAttempts(baseline.keyStats, new Map()),
            config.kind === "transitions" ? { pairs: config.targets } : { keys: config.targets },
        )
    }, [config, baseline])

    // What the rep proved (delta vs lifetime) and what to drill next - the next
    // finding recomputes from baseline + this rep's keystrokes (reps count toward
    // lifetime data - ADR-0004 reversal), excluding the just-drilled target so it
    // never re-suggests the drill just finished.
    const outcome = useMemo(() => {
        if (!completed || !config || config.kind === "timed" || config.kind === "words") return null
        const repEvents = decodeTimeline(completed.timeline)

        let delta: DrillDelta | null = null
        if (config.kind === "transitions") {
            for (const pair of config.targets) {
                delta = transitionDrillDelta(pair, baseline.transitions, repEvents)
                if (delta) break
            }
        } else {
            delta = keyDrillDelta(config.targets, baseline.keyStats, repEvents)
        }

        const next = nextDrillFinding(
            mergeTransitions(baseline.transitions, aggregateTransitions(repEvents)),
            mergeAttempts(baseline.keyStats, attemptsFromEvents(repEvents)),
            config.kind === "transitions" ? { pairs: config.targets } : { keys: config.targets },
        )
        return { delta, next }
    }, [completed, config, baseline])

    // Client-side navigation can swap the drill target without remounting this
    // page (a coaching next-step link, the coach tab flyout). A new target must
    // start fresh: drop the previous rep's result card (so the typer shows, not
    // a stale "Drill complete") and re-arm the coaching strip. recordedSetRef is
    // deliberately kept - the old rep must never record against the new step.
    const targetKey = config ? `${config.kind}:${config.targets.join(",")}` : null
    useEffect(() => {
        recordedHereRef.current = false
        setCompleted(null)
        setSessionReps([])
    }, [targetKey])

    // Today's coaching adopts drills by what they train, not how they were
    // launched: when the active step's target matches this drill's config, reps
    // count as sets. Reading by (date, pool, language) pins the session to the
    // evidence pool actually being typed - a language/layout switch mid-session
    // simply stops matching instead of polluting the prescription.
    const dailyScope = sessionData?.user?.id ?? GUEST_DAILY_SCOPE
    useEffect(() => {
        const read = () => {
            const stored = readLocalDailySession(dailyScope, { dateKey: localDateKey(), pool, language })
            const active = stored ? currentDailyStep(stored) : null
            const matches = !!(active?.target && config && (config.kind === "keys" || config.kind === "transitions") &&
                targetMatchesDrill(active.target, { kind: config.kind, targets: config.targets }))
            setDailySession(matches || recordedHereRef.current ? stored : null)
        }
        read()
        window.addEventListener(DAILY_COACHING_UPDATED_EVENT, read)
        return () => window.removeEventListener(DAILY_COACHING_UPDATED_EVENT, read)
    }, [config, dailyScope, language, pool])

    // A set is recorded only from a real Typer completion. Query parameters and
    // navigation never count as proof by themselves.
    useEffect(() => {
        if (!completed || !dailySession || recordedSetRef.current === completed.timeline) return
        const active = currentDailyStep(dailySession)
        if (!active) return
        recordedSetRef.current = completed.timeline
        const next = recordDailySet(dailySession, active.id, {
            netWpm: completed.netWpm,
            accuracy: completed.accuracy,
            ...(outcome?.delta ? { targetDelta: outcome.delta } : {}),
        })
        if (next === dailySession) return
        recordedHereRef.current = true
        writeLocalDailySession(dailyScope, next)
        setDailySession(next)
    }, [completed, dailySession, dailyScope, outcome?.delta])

    // Append this rep's delta.after to the session trail. The lifetime baseline
    // moves too (reps sync into it - ADR-0004 reversal), but slowly once the
    // pair has history; the trail shows each rep landing.
    const recordedRepRef = useRef<TestCompletionResult["timeline"] | null>(null)
    useEffect(() => {
        if (!completed || !outcome?.delta) return
        // The eager completion is re-reported once the save settles with the same
        // timeline array (spread copy) - reference equality dedupes the rep.
        if (recordedRepRef.current === completed.timeline) return
        recordedRepRef.current = completed.timeline
        const after = outcome.delta.after
        setSessionReps((reps) => [...reps, after])
    }, [completed, outcome])

    const wordCount = config?.text.split(" ").filter(Boolean).length ?? DEFAULT_DRILL_WORDS

    // A diagnosis hands off the just-completed test's config as an opaque `rm`
    // token. Forward it home so Re-measure re-runs that exact test and headlines a
    // before→after delta; without it, fall back to a generic timed re-measure.
    const rmToken = typeof router.query.rm === "string" ? router.query.rm : null
    const reMeasureHref = rmToken ? `/?rm=${encodeURIComponent(rmToken)}` : "/?mode=timed&count=30"
    const dailyActiveStep = dailySession ? currentDailyStep(dailySession) : null
    // Still the same step after this rep → the primary action is another set.
    const dailyNeedsMoreSets = !!(dailyActiveStep?.target && config && (config.kind === "keys" || config.kind === "transitions") &&
        targetMatchesDrill(dailyActiveStep.target, { kind: config.kind, targets: config.targets }))

    // Full-page navigation, like Re-measure: the drill page must remount so the
    // new target compiles fresh text and the baseline re-snapshots.
    const nextDrillHref = (finding: DrillFinding) => `${finding.href}${rmToken ? `&rm=${encodeURIComponent(rmToken)}` : ""}`
    const nextDrillLabel = (finding: DrillFinding) => finding.kind === "transition" ? transitionLabel(finding.pair) : finding.keys.join(" ")

    return (
        <>
            <Head>
                <title>Drill - TypeCafe</title>
                <meta name="description" content="Targeted typing drills built from your weak keys and transitions." />
            </Head>
            <div className="flex h-full w-full justify-center overflow-auto px-4 py-8">
                <main className={`flex w-full max-w-5xl flex-col gap-5 ${dailySession ? "justify-start pb-24" : "mb-[12rem] justify-center"}`}>
                    {config ? (
                        <>
                            {dailySession && (
                                <section data-testid="daily-session-strip" className={typingFocusFadeClass(typingFocused, "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3")} aria-label="Today's coaching progress">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-primary">Today&apos;s coaching</p>
                                        <p className="mt-0.5 text-sm font-semibold text-base-content">
                                            {dailySession.status === "completed"
                                                ? "Session complete"
                                                : dailyActiveStep?.kind === "focus"
                                                    ? `${dailyActiveStep.title} · set ${Math.min(dailyActiveStep.sets.length + 1, FOCUS_SETS_GOAL)} of up to ${FOCUS_SETS_GOAL}`
                                                    : dailyActiveStep?.title}
                                        </p>
                                    </div>
                                    <span className="text-sm text-base-content/65">
                                        {dailySession.status === "completed" ? "All steps done" : `Step ${dailySession.currentStepIndex + 1} of ${dailySession.steps.length}`}
                                    </span>
                                </section>
                            )}
                            <section data-testid="drill-header" className={typingFocusFadeClass(typingFocused, "rounded-lg border border-base-content/10 bg-base-100/45 p-4 sm:p-5")}>
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                                                {config.eyebrow ?? (config.kind === "transitions" ? "Transition drill" : config.kind === "words" ? "Word drill" : config.kind === "timed" ? "Timed warm-up" : "Key drill")}
                                            </p>
                                            <h1 className="mt-1 font-mono text-2xl font-bold text-base-content">
                                                {config.labels.join(", ")}
                                            </h1>
                                            {headerStat && (
                                                <p data-testid="drill-header-stat" className="mt-2 text-sm text-base-content/70">
                                                    {headerStat}
                                                </p>
                                            )}
                                            {sessionReps.length > 0 && (() => {
                                                const fmt = (v: number) => config.kind === "transitions" ? `${Math.round(v)}ms` : `${v.toFixed(1)}%`
                                                const best = config.kind === "transitions" ? Math.min(...sessionReps) : Math.max(...sessionReps)
                                                const last = sessionReps[sessionReps.length - 1]!
                                                return (
                                                    <p data-testid="drill-session" className="mt-1 text-sm text-base-content/70">
                                                        This session:{" "}
                                                        <span className="font-semibold text-base-content">{fmt(best)}</span>
                                                        {sessionReps.length === 1
                                                            ? " - 1 rep"
                                                            : ` best · ${fmt(last)} last · ${sessionReps.length} reps`}
                                                    </p>
                                                )
                                            })()}
                                        </div>
                                        {/* Hidden once the rep completes - the result card offers a
                                            fresher pick recomputed with this rep included. */}
                                        {!completed && headerNext && (
                                            <a
                                                href={nextDrillHref(headerNext)}
                                                data-testid="drill-header-next"
                                                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-primary/20"
                                            >
                                                Next drill: {nextDrillLabel(headerNext)}
                                            </a>
                                        )}
                                    </div>
                                    {/* Chips only earn their space when there's more than one target;
                                        for a single target they'd repeat the heading. */}
                                    {config.labels.length > 1 && (
                                        <div className="flex flex-wrap gap-2">
                                            {config.labels.map((label) => (
                                                <span key={label} className="min-w-10 rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-center text-sm font-semibold text-primary">
                                                    {label}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {!completed ? (
                                <section data-testid="drill-typer" className={`px-2 py-10 transition-colors duration-300 motion-reduce:transition-none sm:px-4 ${typingFocused ? "border border-transparent bg-transparent" : "rounded-lg border border-base-content/10 bg-base-100/30"}`}>
                                    <Typer
                                        language={language}
                                        mode={TestModes.normal}
                                        evidenceContext={config.evidenceContext}
                                        subMode={config.kind === "timed" ? TestSubModes.timed : TestSubModes.words}
                                        gramSource={TestGramSources.bigrams}
                                        gramScope={TestGramScopes.fifty}
                                        gramCombination={2}
                                        gramRepetition={1}
                                        gramWpmThreshold={0}
                                        gramAccuracyThreshold={0}
                                        count={config.kind === "timed" ? config.seconds! : wordCount}
                                        customLength
                                        fixedText={config.kind === "timed" ? undefined : config.text}
                                        showStats
                                        modalOpen={false}
                                        restartSignal={restartSignal}
                                        onRestart={() => setCompleted(null)}
                                        // The drill card uses no server-derived fields, so drop the
                                        // persisted re-report: a slow save settling after the user
                                        // moved on (next set, next step's drill) must not resurrect
                                        // the old result card over the typer.
                                        onTestComplete={(result) => { if (!result.persisted) setCompleted(result) }}
                                        eagerResult
                                        onTypingFocusChange={setTypingFocused}
                                        charAttemptsRef={charAttemptsRef}
                                    />
                                </section>
                            ) : (
                                <section data-testid="drill-result" className="rounded-lg border border-primary/30 bg-primary/10 p-5">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Drill complete</p>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase text-base-content/50">WPM</p>
                                            <p className="mt-1 font-mono text-3xl font-bold text-base-content">{completed.netWpm.toFixed(1)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold uppercase text-base-content/50">Accuracy</p>
                                            <p className="mt-1 font-mono text-3xl font-bold text-base-content">{completed.accuracy.toFixed(1)}%</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold uppercase text-base-content/50">{config.kind === "timed" ? "Time" : "Words"}</p>
                                            <p className="mt-1 font-mono text-3xl font-bold text-base-content">{config.kind === "timed" ? `${config.seconds}s` : wordCount}</p>
                                        </div>
                                    </div>
                                    {outcome?.delta && <DeltaLine delta={outcome.delta} />}
                                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                                        {dailySession ? (
                                            dailySession.status === "completed" ? (
                                                <Link href="/plan" data-testid="daily-session-continue" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                                                    See today&apos;s result →
                                                </Link>
                                            ) : dailyNeedsMoreSets ? (
                                                <button ref={resultRestartRef} type="button" onClick={restartDrill} data-testid="daily-session-continue" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                                                    Next set →
                                                </button>
                                            ) : (
                                                <Link href={dailyActiveStep!.href} data-testid="daily-session-continue" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                                                    Next: {dailyActiveStep!.title} →
                                                </Link>
                                            )
                                        ) : (
                                            // A full-page navigation (not next/link): home must mount with
                                            // ?rm already in the URL so it applies the diagnosed config before
                                            // the typer's first text generation, avoiding a restart race.
                                            <a href={reMeasureHref} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                                Re-measure
                                            </a>
                                        )}
                                        {!dailySession && outcome?.next && (
                                            <a
                                                href={nextDrillHref(outcome.next)}
                                                data-testid="drill-next"
                                                className="inline-flex items-center justify-center rounded-md border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10"
                                            >
                                                Next drill: {nextDrillLabel(outcome.next)}
                                            </a>
                                        )}
                                        {!(dailySession && dailySession.status === "active" && dailyNeedsMoreSets) && (
                                            <button ref={resultRestartRef} type="button" onClick={restartDrill} className="inline-flex items-center justify-center rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-base-content transition hover:bg-base-content/5">
                                                {dailySession ? "Restart" : "Drill again"}
                                            </button>
                                        )}
                                    </div>
                                </section>
                            )}
                        </>
                    ) : (
                        <section data-testid="drill-empty" className="mx-auto mt-16 max-w-md rounded-lg border border-base-content/10 bg-base-100/45 p-6 text-center">
                            <h1 className="font-mono text-2xl font-bold text-base-content">Choose a drill</h1>
                            <p className="mt-2 text-sm text-base-content/60">Open a key or transition drill from a diagnosis, progress insight, or plan step.</p>
                            <Link href="/" className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                Take a test
                            </Link>
                        </section>
                    )}
                </main>
            </div>
        </>
    )
}

export default Drill
