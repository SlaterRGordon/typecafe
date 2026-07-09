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
import { isDrillMark, isDrillDigit, isDrillableKey } from "~/lib/drillKeys"
import { attemptsFromEvents, keyDrillDelta, keysBaseline, mergeAttempts, nextDrillFinding, transitionBaseline, transitionDrillDelta, type DrillDelta, type DrillFinding } from "~/lib/drillProgress"
import { decodeTimeline } from "~/lib/keystrokes"
import { readLocalKeyStats, type LocalKeyStat } from "~/lib/localSync"
import { readLocalTransitions } from "~/lib/localTransitions"
import { statsPoolFor } from "~/lib/keyboardLayout"
import { useLayout } from "~/hooks/useLayout"
import { isAnyModalOpen } from "~/lib/modals"
import { aggregateTransitions, mergeTransitions, type TransitionAggregate } from "~/lib/transitions"
import { api } from "~/utils/api"

type DrillKind = "keys" | "transitions" | "words" | "timed"

interface DrillConfig {
    kind: DrillKind,
    labels: string[],
    // The raw drilled targets (pairs or keys); empty for a timed warm-up.
    targets: string[],
    text: string,
    // Duration for a timed drill (warm-up); absent for word drills.
    seconds?: number,
}

interface LifetimeEvidence {
    transitions: TransitionAggregate[],
    keyStats: LocalKeyStat[],
}

// A drill is a quick, clearly-ending rep — short enough that finishing it and
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
    return Array.from(new Set(raw
        .split(",")
        .map((key) => key.trim().toLowerCase())
        .filter(isDrillableKey)))
}

// Words to drill verbatim (letters-only, lowercased, deduped) — the toughest-words
// handoff from a diagnosis. Non-letter tokens are dropped (can't form drill text).
const parseWords = (value: string | string[] | undefined): string[] => {
    const raw = Array.isArray(value) ? value.join(",") : value ?? ""
    return Array.from(new Set(raw
        .split(",")
        .map((word) => word.trim().toLowerCase())
        .filter((word) => /^[a-z]+$/.test(word))))
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
            {" "}your recent average — {rep} this rep vs {lifetime}.
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

        if (words.length > 0) {
            return {
                kind: "words",
                labels: words,
                targets: words,
                text: compileDrillText({ words, wordList, length }),
            }
        }

        if (transitions.length > 0) {
            return {
                kind: "transitions",
                labels: transitions.map(transitionLabel),
                targets: transitions,
                text: compileDrillText({ transitions, wordList, length }),
            }
        }

        if (keys.length > 0) {
            // Letters build the words; locked digits/marks get sprinkled in (the
            // same tested sprinkler Practice uses), so a weak ; or 5 gets real reps
            // in natural prose instead of being stripped out.
            const letters = keys.filter((key) => /^[a-z]$/.test(key))
            const marks = keys.filter(isDrillMark)
            const digits = keys.filter(isDrillDigit)
            return {
                kind: "keys",
                labels: keys,
                targets: keys,
                text: applyTextOptions(compileDrillText({ keys: letters, wordList, length }), false, false, { marks, digits }),
            }
        }

        // A timed warm-up: a generic timed test, no target keys.
        if (seconds > 0) {
            return { kind: "timed", labels: [`${seconds}s`], targets: [], text: "", seconds }
        }

        return null
    }, [router.isReady, langReady, language, router.query.keys, router.query.length, router.query.transitions, router.query.words, router.query.seconds])

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
    // and offers the next pick straight from lifetime evidence — no completed
    // rep required, so a restart never strands the user without a way forward.
    const headerStat = useMemo(() => {
        if (!config) return null
        if (config.kind === "transitions") {
            for (const pair of config.targets) {
                const base = transitionBaseline(pair, baseline.transitions)
                if (base) return `${Math.round(base.meanMs)}ms on this jump — ${base.ratio.toFixed(1)}× your typical transition. Beat it below.`
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

    // What the rep proved (delta vs lifetime) and what to drill next — the next
    // finding recomputes from baseline + this rep's keystrokes (reps count toward
    // lifetime data — ADR-0004 reversal), excluding the just-drilled target so it
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

    // This session's reps on the drilled target (delta.after per completed rep).
    // The lifetime baseline moves too (reps sync into it — ADR-0004 reversal),
    // but slowly once the pair has history; the trail shows each rep landing.
    const [sessionReps, setSessionReps] = useState<number[]>([])
    const recordedRepRef = useRef<TestCompletionResult["timeline"] | null>(null)
    useEffect(() => {
        if (!completed || !outcome?.delta) return
        // The eager completion is re-reported once the save settles with the same
        // timeline array (spread copy) — reference equality dedupes the rep.
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
    // A drill launched from a plan step returns to the guided player, which
    // advances to the next step (Phase 4 §4.4).
    const returnToPlan = router.query.return === "plan"

    // Full-page navigation, like Re-measure: the drill page must remount so the
    // new target compiles fresh text and the baseline re-snapshots.
    const nextDrillHref = (finding: DrillFinding) => `${finding.href}${rmToken ? `&rm=${encodeURIComponent(rmToken)}` : ""}`
    const nextDrillLabel = (finding: DrillFinding) => finding.kind === "transition" ? transitionLabel(finding.pair) : finding.keys.join(" ")

    return (
        <>
            <Head>
                <title>Drill — TypeCafe</title>
                <meta name="description" content="Targeted typing drills built from your weak keys and transitions." />
            </Head>
            <div className="flex h-full w-full justify-center overflow-auto px-4 py-8">
                <main className="flex w-full max-w-5xl flex-col justify-center mb-[12rem] gap-5">
                    {config ? (
                        <>
                            <section data-testid="drill-header" className={typingFocusFadeClass(typingFocused, "rounded-lg border border-base-content/10 bg-base-100/45 p-4 sm:p-5")}>
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                                                {config.kind === "transitions" ? "Transition drill" : config.kind === "words" ? "Word drill" : config.kind === "timed" ? "Timed warm-up" : "Key drill"}
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
                                                            ? " — 1 rep"
                                                            : ` best · ${fmt(last)} last · ${sessionReps.length} reps`}
                                                    </p>
                                                )
                                            })()}
                                        </div>
                                        {/* Hidden once the rep completes — the result card offers a
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
                                        onTestComplete={setCompleted}
                                        // setCompleted is idempotent under the eager double-report:
                                        // the persisted upgrade just re-sets the same card.
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
                                        {returnToPlan ? (
                                            <Link href="/plan?step=done" data-testid="drill-continue-plan" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                                Next step →
                                            </Link>
                                        ) : (
                                            // A full-page navigation (not next/link): home must mount with
                                            // ?rm already in the URL so it applies the diagnosed config before
                                            // the typer's first text generation, avoiding a restart race.
                                            <a href={reMeasureHref} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                                Re-measure
                                            </a>
                                        )}
                                        {!returnToPlan && outcome?.next && (
                                            <a
                                                href={nextDrillHref(outcome.next)}
                                                data-testid="drill-next"
                                                className="inline-flex items-center justify-center rounded-md border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10"
                                            >
                                                Next drill: {nextDrillLabel(outcome.next)}
                                            </a>
                                        )}
                                        <button ref={resultRestartRef} type="button" onClick={restartDrill} className="inline-flex items-center justify-center rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-base-content transition hover:bg-base-content/5">
                                            {returnToPlan ? "Restart" : "Drill again"}
                                        </button>
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
