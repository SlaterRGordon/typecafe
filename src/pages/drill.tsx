import { type NextPage } from "next"
import Head from "next/head"
import Link from "next/link"
import { useRouter } from "next/router"
import { useMemo, useRef, useState } from "react"
import { Typer, type TestCompletionResult } from "~/components/typer/Typer"
import { TestGramScopes, TestGramSources, TestModes, TestSubModes } from "~/components/typer/types"
import { getWords } from "~/components/typer/utils"
import { compileDrillText } from "~/lib/drill"

type DrillKind = "keys" | "transitions"

interface DrillConfig {
    kind: DrillKind,
    labels: string[],
    text: string,
}

const DEFAULT_DRILL_WORDS = 60

const parseLength = (value: string | string[] | undefined): number => {
    const raw = Array.isArray(value) ? value[0] : value
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return DEFAULT_DRILL_WORDS
    return Math.min(Math.max(Math.floor(parsed), 1), 120)
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
    const [restartSignal, setRestartSignal] = useState(0)
    const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())

    const config = useMemo<DrillConfig | null>(() => {
        if (!router.isReady) return null

        const length = parseLength(router.query.length)
        const keys = parseKeys(router.query.keys)
        const transitions = parseTransitions(router.query.transitions)
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

        return null
    }, [router.isReady, router.query.keys, router.query.length, router.query.transitions])

    const restartDrill = () => {
        setCompleted(null)
        setRestartSignal((signal) => signal + 1)
    }

    const wordCount = config?.text.split(" ").filter(Boolean).length ?? DEFAULT_DRILL_WORDS

    return (
        <>
            <Head>
                <title>Drill — TypeCafe</title>
                <meta name="description" content="Targeted typing drills built from your weak keys and transitions." />
            </Head>
            <div className="flex h-full w-full justify-center overflow-auto px-4 py-8">
                <main className="flex w-full max-w-5xl flex-col gap-5">
                    {config ? (
                        <>
                            <section className="rounded-lg border border-base-content/10 bg-base-100/45 p-4 sm:p-5">
                                <div className="flex flex-col gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                                            {config.kind === "transitions" ? "Transition drill" : "Key drill"}
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
                                <section data-testid="drill-typer" className="rounded-lg border border-base-content/10 bg-base-100/30 px-2 py-10 sm:px-4">
                                    <Typer
                                        language="english"
                                        mode={TestModes.normal}
                                        subMode={TestSubModes.words}
                                        gramSource={TestGramSources.bigrams}
                                        gramScope={TestGramScopes.fifty}
                                        gramCombination={2}
                                        gramRepetition={1}
                                        gramWpmThreshold={0}
                                        gramAccuracyThreshold={0}
                                        count={wordCount}
                                        customLength
                                        fixedText={config.text}
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
                                            <p className="text-xs font-semibold uppercase text-base-content/50">Words</p>
                                            <p className="mt-1 font-mono text-3xl font-bold text-base-content">{wordCount}</p>
                                        </div>
                                    </div>
                                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                                        <Link href="/?mode=timed&count=30" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                                            Re-measure
                                        </Link>
                                        <button type="button" onClick={restartDrill} className="inline-flex items-center justify-center rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-base-content transition hover:bg-base-content/5">
                                            Drill again
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
