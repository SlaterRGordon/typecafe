import { type NextPage } from "next"
import Head from "next/head"
import Link from "next/link"
import { useRouter } from "next/router"
import { useMemo, useRef, useState } from "react"
import { Typer, type TestCompletionResult } from "~/components/typer/Typer"
import { useRestartShortcut } from "~/components/typer/hooks/useRestartShortcut"
import { typingFocusFadeClass } from "~/components/typer/typingFocus"
import { TestGramScopes, TestGramSources, TestModes, TestSubModes } from "~/components/typer/types"
import { getWords } from "~/components/typer/utils"
import { compileDrillText } from "~/lib/drill"
import { isAnyModalOpen } from "~/lib/modals"

type DrillKind = "keys" | "transitions" | "timed"

interface DrillConfig {
    kind: DrillKind,
    labels: string[],
    text: string,
    // Duration for a timed drill (warm-up); absent for word drills.
    seconds?: number,
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
        .filter((key) => /^[a-z]$/.test(key))))
}

const parseTransitions = (value: string | string[] | undefined): string[] => {
    const raw = Array.isArray(value) ? value.join(",") : value ?? ""
    return Array.from(new Set(raw
        .split(",")
        .map((pair) => pair.toLowerCase().replace(/[^a-z]/g, ""))
        .filter((pair) => pair.length >= 2)
        .map((pair) => pair.slice(0, 2))))
}

function transitionLabel(pair: string) {
    return `${pair[0]}→${pair[1]}`
}

const Drill: NextPage = () => {
    const router = useRouter()
    const [completed, setCompleted] = useState<TestCompletionResult | null>(null)
    const [typingFocused, setTypingFocused] = useState(false)
    const [restartSignal, setRestartSignal] = useState(0)
    const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
    const resultRestartRef = useRef<HTMLButtonElement>(null)

    const config = useMemo<DrillConfig | null>(() => {
        if (!router.isReady) return null

        const length = parseLength(router.query.length)
        const keys = parseKeys(router.query.keys)
        const transitions = parseTransitions(router.query.transitions)
        const seconds = parseSeconds(router.query.seconds)
        const wordList = getWords("english")

        if (transitions.length > 0) {
            return {
                kind: "transitions",
                labels: transitions.map(transitionLabel),
                text: compileDrillText({ transitions, wordList, length }),
            }
        }

        if (keys.length > 0) {
            return {
                kind: "keys",
                labels: keys,
                text: compileDrillText({ keys, wordList, length }),
            }
        }

        // A timed warm-up: a generic timed test, no target keys.
        if (seconds > 0) {
            return { kind: "timed", labels: [`${seconds}s`], text: "", seconds }
        }

        return null
    }, [router.isReady, router.query.keys, router.query.length, router.query.transitions, router.query.seconds])

    const restartDrill = () => {
        setCompleted(null)
        setRestartSignal((signal) => signal + 1)
    }

    useRestartShortcut(resultRestartRef, restartDrill, isAnyModalOpen, { enabled: !!completed })

    const wordCount = config?.text.split(" ").filter(Boolean).length ?? DEFAULT_DRILL_WORDS

    // A diagnosis hands off the just-completed test's config as an opaque `rm`
    // token. Forward it home so Re-measure re-runs that exact test and headlines a
    // before→after delta; without it, fall back to a generic timed re-measure.
    const rmToken = typeof router.query.rm === "string" ? router.query.rm : null
    const reMeasureHref = rmToken ? `/?rm=${encodeURIComponent(rmToken)}` : "/?mode=timed&count=30"
    // A drill launched from a plan step returns to the guided player, which
    // advances to the next step (Phase 4 §4.4).
    const returnToPlan = router.query.return === "plan"

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
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                                            {config.kind === "transitions" ? "Transition drill" : config.kind === "timed" ? "Timed warm-up" : "Key drill"}
                                        </p>
                                        <h1 className="mt-1 font-mono text-2xl font-bold text-base-content">
                                            {config.labels.join(", ")}
                                        </h1>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {config.labels.map((label) => (
                                            <span key={label} className="min-w-10 rounded-md border border-primary/30 bg-primary/10 px-3 py-1 text-center text-sm font-semibold text-primary">
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            {!completed ? (
                                <section data-testid="drill-typer" className={`px-2 py-10 transition-colors duration-300 motion-reduce:transition-none sm:px-4 ${typingFocused ? "border border-transparent bg-transparent" : "rounded-lg border border-base-content/10 bg-base-100/30"}`}>
                                    <Typer
                                        language="english"
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
                                        showConfig={false}
                                        showControls={false}
                                        modalOpen={false}
                                        fullscreen={false}
                                        setFullscreen={() => undefined}
                                        onKeyChange={() => undefined}
                                        restartSignal={restartSignal}
                                        onRestart={() => setCompleted(null)}
                                        onTestComplete={setCompleted}
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
