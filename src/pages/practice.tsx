import { type NextPage } from "next"
import Head from "next/head"
import { useSession } from "next-auth/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Keyboard } from "~/components/typer/Keyboard"
import { Typer, type TestCompletionResult } from "~/components/typer/Typer"
import { TestGramScopes, TestGramSources, TestModes, TestSubModes } from "~/components/typer/types"
import { ensureLanguageLoaded, getWords } from "~/components/typer/utils"
import { useGuestEvidence } from "~/hooks/useGuestEvidence"
import { useLanguage } from "~/hooks/useLanguage"
import { useLayout } from "~/hooks/useLayout"
import {
    compileCustomKeysPractice,
    completeCustomKeysPractice,
    customKeysPracticeRecord,
    type CustomKeysPracticePreferences,
    type CustomKeysPracticeRun,
} from "~/lib/customKeysPractice"
import { readCustomKeysPracticePreferences, writeCustomKeysPracticePreferences } from "~/lib/customKeysPreferences"
import { PRACTICE_DURATIONS_SECONDS, PRACTICE_TEXT_STYLES, type PracticeDurationSeconds, type PracticeTextStyle } from "~/lib/evidenceContext"
import { boardFor, sequenceFor, statsPoolFor } from "~/lib/keyboardLayout"
import { api } from "~/utils/api"

const PRACTICE_WORDS = 1_400

function signed(value: number): string {
    return `${value >= 0 ? "+" : ""}${Math.round(value)}`
}

const Practice: NextPage = () => {
    const { data: session } = useSession()
    const signedIn = !!session?.user
    const [language] = useLanguage()
    const [layout] = useLayout()
    const pool = statsPoolFor(layout)
    const guestEvidence = useGuestEvidence()
    const [preferences, setPreferences] = useState<CustomKeysPracticePreferences>({ keys: ["e", "r"], durationSeconds: 60, textStyle: "varied" })
    const [ready, setReady] = useState(false)
    const [corpus, setCorpus] = useState<string[]>([])
    const [seed, setSeed] = useState(1)
    const [running, setRunning] = useState(false)
    const [restartSignal, setRestartSignal] = useState(0)
    const [completed, setCompleted] = useState<{ result: TestCompletionResult, run: CustomKeysPracticeRun } | null>(null)
    const [shiftLayer, setShiftLayer] = useState(false)
    const [altgrLayer, setAltgrLayer] = useState(false)
    const charAttemptsRef = useRef(new Map<string, { attempts: number, correct: number }>())
    const board = useMemo(() => boardFor(layout), [layout])
    const hasAltGr = board.rows.some((row) => row.some((key) => key.altgr !== undefined))

    useEffect(() => {
        setPreferences(readCustomKeysPracticePreferences())
        setSeed(Date.now())
        setReady(true)
    }, [])

    useEffect(() => {
        if (!ready) return
        setPreferences((current) => {
            const keys = current.keys.filter((key) => sequenceFor(key, layout).length > 0).slice(0, 8)
            const repaired = keys.length > 0 ? keys : ["e", "r"].filter((key) => sequenceFor(key, layout).length > 0)
            return repaired.join("\0") === current.keys.join("\0") ? current : { ...current, keys: repaired }
        })
    }, [layout, ready])

    useEffect(() => {
        let active = true
        void ensureLanguageLoaded(language).then(() => {
            const typeable = getWords(language).filter((word) => [...word.normalize("NFC")]
                .every((character) => sequenceFor(character.toLowerCase(), layout).length > 0))
            if (active) setCorpus(typeable)
        })
        return () => { active = false }
    }, [language, layout])

    useEffect(() => {
        if (ready) writeCustomKeysPracticePreferences(preferences)
    }, [preferences, ready])

    const timelines = api.test.getLatestTimelines.useQuery(
        { language, pool },
        { enabled: signedIn, retry: false },
    )
    const history = useMemo<CustomKeysPracticeRun[]>(() => {
        const evidence = signedIn ? timelines.data ?? [] : guestEvidence?.timelines ?? []
        return evidence.flatMap((item, index): CustomKeysPracticeRun[] => item.practice ? [{
            id: `history-${item.completedAt}-${index}`,
            completedAt: item.completedAt,
            practice: item.practice,
            timeline: item.timeline,
        }] : [])
    }, [guestEvidence?.timelines, signedIn, timelines.data])

    const prompt = useMemo(() => compileCustomKeysPractice({
        keys: preferences.keys,
        corpus,
        language,
        textStyle: preferences.textStyle,
        seed,
        wordCount: PRACTICE_WORDS,
    }), [corpus, language, preferences.keys, preferences.textStyle, seed])
    const baseRecord = useMemo(
        () => customKeysPracticeRecord(preferences, 0, false),
        [preferences],
    )

    const recap = useMemo(() => completed ? completeCustomKeysPractice({
        current: completed.run,
        history,
    }) : null, [completed, history])

    const update = (patch: Partial<CustomKeysPracticePreferences>) => {
        if (running) return
        setCompleted(null)
        setPreferences((current) => ({ ...current, ...patch }))
        setSeed((value) => value + 1)
    }
    const setKeys = (keys: string[]) => {
        const unique = [...new Set(keys.map((key) => key.normalize("NFC")))].filter((key) => sequenceFor(key, layout).length > 0).slice(0, 8)
        update({ keys: unique })
    }
    const repeat = () => {
        setCompleted(null)
        charAttemptsRef.current = new Map()
        setSeed((value) => value + 1)
        setRestartSignal((value) => value + 1)
    }
    const stop = () => {
        setRestartSignal((value) => value + 1)
        setRunning(false)
        charAttemptsRef.current = new Map()
        setSeed((value) => value + 1)
    }
    const onComplete = (result: TestCompletionResult) => {
        const completedAt = Date.now()
        setRunning(false)
        setCompleted({
            result,
            run: {
                id: `current-${completedAt}`,
                completedAt,
                practice: customKeysPracticeRecord(preferences, preferences.durationSeconds * 1_000, true),
                timeline: result.timeline,
            },
        })
    }

    return (
        <div data-testid="custom-keys-workspace" className="h-full w-full overflow-y-auto bg-base-100 px-3 py-6 sm:px-6 md:py-10">
            <Head><title>Custom Keys Practice | TypeCafe</title></Head>
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Practice · Custom Keys</p>
                        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Build speed where you choose.</h1>
                    </div>
                    {running && <button type="button" className="btn btn-sm btn-ghost" onClick={stop}>Stop run</button>}
                </header>

                <section aria-label="Practice controls" className="rounded-2xl border border-base-content/10 bg-base-200/45 p-3 sm:p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                        <div>
                            <span className="text-xs font-semibold uppercase tracking-wide text-base-content/50">Keys</span>
                            <div data-testid="selected-practice-keys" className="mt-2 flex min-h-8 flex-wrap gap-1.5">
                                {preferences.keys.length > 0 ? preferences.keys.map((key) => (
                                    <button key={key} type="button" disabled={running} onClick={() => setKeys(preferences.keys.filter((item) => item !== key))} className="kbd kbd-sm border-primary/35 bg-primary/10 font-mono text-primary" aria-label={`Remove ${key}`}>
                                        {key}<span aria-hidden="true" className="ml-1 opacity-50">×</span>
                                    </button>
                                )) : <span className="text-sm text-warning">Choose at least one key below.</span>}
                            </div>
                        </div>
                        <fieldset disabled={running}>
                            <legend className="text-xs font-semibold uppercase tracking-wide text-base-content/50">Duration</legend>
                            <div className="mt-2 join" role="group" aria-label="Duration">
                                {PRACTICE_DURATIONS_SECONDS.map((duration) => <button key={duration} type="button" onClick={() => update({ durationSeconds: duration as PracticeDurationSeconds })} className={`btn btn-xs join-item ${preferences.durationSeconds === duration ? "btn-primary" : "btn-ghost"}`}>{duration}s</button>)}
                            </div>
                        </fieldset>
                        <fieldset disabled={running}>
                            <legend className="text-xs font-semibold uppercase tracking-wide text-base-content/50">Style</legend>
                            <div className="mt-2 join" role="group" aria-label="Text style">
                                {PRACTICE_TEXT_STYLES.map((style) => <button key={style} type="button" onClick={() => update({ textStyle: style as PracticeTextStyle })} className={`btn btn-xs join-item capitalize ${preferences.textStyle === style ? "btn-primary" : "btn-ghost"}`}>{style}</button>)}
                            </div>
                        </fieldset>
                    </div>
                </section>

                <section aria-label="Practice run" className="flex min-h-[16rem] items-center rounded-2xl border border-base-content/10 bg-base-200/20 py-2">
                    {completed && recap ? (
                        <div data-testid="practice-recap" className="w-full px-5 py-5 sm:px-8">
                            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Run complete</p>
                            <h2 className="mt-1 text-2xl font-bold">Your focus response</h2>
                            {!recap.baselineReady && <p className="mt-2 text-sm text-base-content/60">Building your practice baseline.</p>}
                            <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                {recap.keys.map((row) => (
                                    <article key={row.key} className="rounded-xl bg-base-200 p-3" data-testid={`practice-key-${row.key}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <kbd className="kbd font-mono text-primary">{row.key}</kbd>
                                            <span className="font-mono text-xs text-base-content/55">{row.attempts} attempt{row.attempts === 1 ? "" : "s"}</span>
                                        </div>
                                        <p className="mt-2 text-sm"><strong>{row.accuracy.toFixed(1)}%</strong> Accuracy{row.speedWpm !== null && <> · <strong>{Math.round(row.speedWpm)}</strong> response WPM</>}</p>
                                        {row.delta && <p className="mt-1 text-xs text-base-content/60">Practice delta: <span className={row.delta.accuracyPoints >= 0 ? "text-success" : "text-warning"}>{signed(row.delta.accuracyPoints)} Accuracy pts</span>{row.delta.speedWpm !== null && <> · <span className={row.delta.speedWpm >= 0 ? "text-success" : "text-warning"}>{signed(row.delta.speedWpm)} response WPM</span></>}</p>}
                                    </article>
                                ))}
                            </div>
                            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-base-content/10 pt-4">
                                <p className="font-mono text-sm text-base-content/55">Overall <strong className="text-base-content">{Math.round(completed.result.netWpm)} WPM</strong> · <strong className="text-base-content">{completed.result.accuracy.toFixed(1)}%</strong> Accuracy</p>
                                <button type="button" className="btn btn-sm btn-primary" onClick={repeat}>Repeat with fresh text</button>
                            </div>
                        </div>
                    ) : prompt && preferences.keys.length > 0 ? (
                        <Typer
                            language={language}
                            mode={TestModes.practice}
                            subMode={TestSubModes.timed}
                            selectedKeys={preferences.keys}
                            gramSource={TestGramSources.bigrams}
                            gramScope={TestGramScopes.fifty}
                            gramCombination={1}
                            gramRepetition={1}
                            gramWpmThreshold={0}
                            gramAccuracyThreshold={0}
                            count={preferences.durationSeconds}
                            customLength
                            evidenceContext="custom-practice"
                            practiceRecord={baseRecord}
                            fixedText={prompt}
                            onTestComplete={onComplete}
                            onTypingFocusChange={setRunning}
                            onRestart={() => setRunning(false)}
                            onRunRestart={() => setSeed((value) => value + 1)}
                            restartSignal={restartSignal}
                            showStats
                            modalOpen={false}
                            charAttemptsRef={charAttemptsRef}
                        />
                    ) : <p className="mx-auto text-sm text-base-content/55">Choose a key on the keyboard to prepare a run.</p>}
                </section>

                <section aria-label="Focus key editor" className="rounded-2xl border border-base-content/10 bg-base-200/25 pb-2">
                    <div className="px-4 pt-4">
                        <h2 className="font-semibold">Focus key editor</h2>
                        <p className="text-sm text-base-content/55">Selected keys get extra reps; supporting characters keep the text useful.</p>
                    </div>
                    <Keyboard
                        mode={TestModes.practice}
                        selectedKeys={preferences.keys}
                        setSelectedKeys={setKeys}
                        charAttemptsRef={charAttemptsRef}
                        shiftToggle={shiftLayer}
                        altgrToggle={altgrLayer}
                        hasAltGr={hasAltGr}
                        onToggleShift={() => setShiftLayer((value) => !value)}
                        onToggleAltgr={() => setAltgrLayer((value) => !value)}
                        punctuation
                        numbers
                    />
                </section>
            </div>
        </div>
    )
}

export default Practice
