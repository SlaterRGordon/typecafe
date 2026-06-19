import React, { useCallback, useEffect, useRef, useState } from "react"
import { TestSubModes, TestModes } from "./types"
import type { TestCompletionResult, TestGramScopes, TestGramSources } from "./types"
import { getGramLevelText } from "./utils"
import { Text } from "./Text"
import { Stats } from "./Stats"
import { useTimer } from "~/hooks/timer/useTimer"
import { api } from "~/utils/api"
import type { Level } from "./learn/levels"
import { useDispatch } from "react-redux"
import { addAlert } from "~/state/alert/alertSlice"
import { buildWpmSamples, computeStats, consistencyFromSamples, isReliableWpmSample, worstKeysFromAttempts } from "~/lib/stats"
import type { Keystroke, TypedSegment } from "~/lib/stats"
import { encodeTimeline } from "~/lib/keystrokes"
import type { KeystrokeEvent } from "~/lib/keystrokes"
import { isAnyModalOpen } from "~/lib/modals"
import { generateTestText } from "./hooks/useTestText"
import { useGramProgression } from "./hooks/useGramProgression"
import { useRestartShortcut } from "./hooks/useRestartShortcut"
import { useTestPersistence } from "./hooks/useTestPersistence"

type CompletionSource = "text" | "timer"

export type { WpmSample, TypedSegment } from "~/lib/stats"
export type { TestCompletionResult } from "./types"

interface TyperProps {
    language: string,
    mode: TestModes,
    subMode: TestSubModes,
    selectedKeys?: string[],
    setSelectedKeys?: (keys: string[]) => void,
    gramSource: TestGramSources,
    gramScope: TestGramScopes,
    gramCombination: number,
    gramRepetition: number,
    gramWpmThreshold: number,
    gramAccuracyThreshold: number,
    count: number,
    punctuation?: boolean,
    capitals?: boolean,
    customLength?: boolean,
    level?: Level,
    levelRequirements?: { wpm: number, accuracy: number },
    onKeyChange: (key: string) => void,
    onAttemptChange?: () => void,
    onTestComplete?: (result: TestCompletionResult) => void,
    showStats: boolean,
    modalOpen: boolean,
    showConfig: boolean,
    fullscreen: boolean,
    setFullscreen(fullscreen: boolean): void,
    restartSignal?: number,
    onRestart?: () => void,
    hideInterface?: boolean,
    showControls?: boolean,
    // Fixed seeded text (daily challenge): skip generation and never append.
    fixedText?: string,
    // Stamps the saved Test row as belonging to this day's challenge (YYYY-MM-DD).
    challengeDate?: string,
    charAttemptsRef: React.MutableRefObject<Map<string, { attempts: number, correct: number }>>
}

export const Typer = (props: TyperProps) => {
    const {
        language,
        mode, subMode,
        selectedKeys,
        gramSource, gramScope, gramCombination, gramRepetition,
        count, showStats, showConfig,
        punctuation = false, capitals = false,
        customLength = false,
        level,
        levelRequirements,
        fullscreen,
        charAttemptsRef,
        onKeyChange,
        onAttemptChange,
        onRestart,
        showControls = true,
    } = props

    const dispatch = useDispatch();

    const [text, setText] = useState("")
    const [started, setStarted] = useState(false)
    const [restarted, setRestarted] = useState(true)
    // Bumped on every restart so the text view always re-renders fresh — even when
    // the regenerated text is identical (e.g. a grams level produces the same
    // deterministic gram), where `restarted`/`text` alone wouldn't change.
    const [restartNonce, setRestartNonce] = useState(0)
    // Per-keystroke counts live in refs so typing never re-renders Typer; the
    // visible numbers (wpm/accuracy/typedCount) refresh on a 250ms interval.
    const characterCountRef = useRef(0)
    const incorrectCountRef = useRef(0)
    const [typedCount, setTypedCount] = useState(0)
    const [wpm, setWpm] = useState(0.00)
    const [accuracy, setAccuracy] = useState(0.00)
    // Grams levels can be as short as two characters; until a sample is long
    // enough to measure (see isReliableWpmSample) the WPM/avg show "—" rather
    // than an extrapolated spike like "500 wpm". Only ever set in grams mode.
    const [wpmPending, setWpmPending] = useState(false)
    const typedTextRef = useRef("")
    const typedSegmentsRef = useRef<TypedSegment[]>([])
    // Per-attempt accuracy by expected character, reset on every restart — the
    // source for the "toughest keys" line on the results card.
    const testCharAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())
    const keystrokeTimelineRef = useRef<Keystroke[]>([])
    // Per-keystroke events (expected key + correctness + timestamp), the raw
    // material for the persisted timeline and for per-key latency diagnosis.
    const keyEventsRef = useRef<KeystrokeEvent[]>([])
    const onRestartRef = useRef(onRestart)
    const activeAttemptRef = useRef<{
        mode: TestModes,
        subMode: TestSubModes,
        count: number,
        language: string,
    } | null>(null)
    const currentConfigRef = useRef({
        mode,
        subMode,
        count,
        language,
    })

    useEffect(() => {
        currentConfigRef.current = {
            mode,
            subMode,
            count,
            language,
        }
    }, [count, language, mode, subMode])

    useEffect(() => {
        onRestartRef.current = onRestart
    }, [onRestart])

    // fetch types
    const { data: testType } = api.type.get.useQuery({ mode, subMode, language })

    const { sessionData, persistCompletion, syncCharAttempts, syncTransitions } = useTestPersistence({
        mode,
        charAttemptsRef,
        onTestComplete: props.onTestComplete,
    })

    const { gramLevel, gramWpm, resetProgression, recordPassedLevel } = useGramProgression(gramScope)

    // The countdown is a Normal/Timed concept only. Other modes can carry a
    // leftover subMode of "timed" (e.g. a persisted setting, or a programmatic
    // mode switch that didn't reset it); without this gate the timer would be a
    // decremental-to-0 countdown that fires onTimeOver the instant the test
    // starts, ending Practice/Grams/Relaxed immediately.
    const isTimed = subMode === TestSubModes.timed && mode === TestModes.normal

    const { time, start, pause, setInitialTime, actualStartTime } = useTimer({
        _initialTime: isTimed ? count : 0,
        timerType: isTimed ? 'DECREMENTAL' : 'INCREMENTAL',
        endTime: isTimed ? 0 : 999999,
        onTimeOver: () => {
            handleComplete(false, false, "timer")
        },
    })

    useEffect(() => {
        if (isTimed) setInitialTime(count)
        else setInitialTime(0)
    }, [count, setInitialTime, isTimed])

    useEffect(() => {
        if (mode === TestModes.ngrams) {
            resetProgression()
        }
    }, [mode, subMode, gramSource, gramScope, gramCombination, gramRepetition, resetProgression])

    // ref for restart button
    const restartRef = useRef<HTMLButtonElement>(null)

    const getStats = useCallback((finalCharacterCount: number, finalIncorrectCount: number) => {
        return computeStats({
            timeline: keystrokeTimelineRef.current,
            characterCount: finalCharacterCount,
            incorrectCount: finalIncorrectCount,
            isTimed: subMode === TestSubModes.timed && mode === TestModes.normal,
            timedDurationSeconds: count,
            fallbackStartTime: actualStartTime,
        })
    }, [actualStartTime, subMode, mode, count])

    const cancelRestartRef = useRef(false)
    const textRequestRef = useRef(0)

    const handleRestart = useCallback((targetLevel?: number) => {
        cancelRestartRef.current = true;
        setTimeout(() => {
            if (cancelRestartRef.current) {
                cancelRestartRef.current = false; // Reset the cancel flag
                if (mode !== TestModes.ngrams) syncCharAttempts()

                // A daily challenge uses fixed seeded text — same for every client,
                // never regenerated or appended.
                if (props.fixedText) {
                    setText(props.fixedText)
                } else if (!(mode === TestModes.practice && !selectedKeys)) {
                    // Practice mode without selected keys has nothing to generate
                    // from; keep the existing text rather than blanking it.
                    // Generation is async (non-English word lists load on demand);
                    // the token discards stale results if another restart raced it.
                    const requestToken = ++textRequestRef.current
                    void generateTestText({
                        mode, subMode, count, language, punctuation, capitals,
                        level, selectedKeys,
                        gramSource, gramScope, gramCombination, gramRepetition,
                    }, targetLevel ?? gramLevel).then((newText) => {
                        if (textRequestRef.current === requestToken) setText(newText)
                    })
                }

                setInitialTime(mode === TestModes.normal && subMode === TestSubModes.timed ? count : 0)
                pause()
                setStarted(false)
                activeAttemptRef.current = null
                typedTextRef.current = ""
                typedSegmentsRef.current = []
                testCharAttemptsRef.current = new Map()
                keystrokeTimelineRef.current = []
                keyEventsRef.current = []
                setRestarted(true)
                setRestartNonce((nonce) => nonce + 1)
                characterCountRef.current = 0
                incorrectCountRef.current = 0
                setTypedCount(0)
                // Blank the WPM in grams until a level produces a measurable sample.
                setWpmPending(mode === TestModes.ngrams)
                onRestartRef.current?.()
            }
        }, 0)
    }, [count, gramCombination, gramLevel, gramRepetition, gramScope, gramSource, syncCharAttempts, language, level, mode, pause, punctuation, capitals, selectedKeys, setInitialTime, subMode, props.fixedText])

    useEffect(() => {
        handleRestart()
    }, [handleRestart])

    // A user-initiated restart (button or tab+enter). In grams this restarts the
    // whole drill from level 1 — otherwise restart regenerates the same
    // deterministic gram for the current level and appears to do nothing.
    const restartTest = useCallback(() => {
        if (mode === TestModes.ngrams) {
            resetProgression()
            handleRestart(1)
        } else {
            handleRestart()
        }
    }, [mode, resetProgression, handleRestart])

    // Read the latest restartTest without depending on it: it's recreated whenever
    // gramLevel changes (advancement), and depending on it here would re-fire this
    // effect on every level-up and reset the drill back to level 1.
    const restartTestRef = useRef(restartTest)
    useEffect(() => {
        restartTestRef.current = restartTest
    }, [restartTest])

    useEffect(() => {
        if (!props.restartSignal) return
        restartTestRef.current()
    }, [props.restartSignal])

    const handleStart = useCallback(() => {
        activeAttemptRef.current = {
            mode,
            subMode,
            count,
            language,
        }
        start()
        setStarted(true)
    }, [mode, subMode, count, language, start])

    const buildCompletion = useCallback((
        finalStats: ReturnType<typeof getStats>,
        finalCharacterCount: number,
        finalIncorrectCount: number,
    ): TestCompletionResult => {
        const correctKeystrokes = Math.max(finalCharacterCount - finalIncorrectCount, 0)
        const durationSeconds = subMode === TestSubModes.timed && mode === TestModes.normal
            ? count
            : finalStats.durationSeconds
        const wpmSamples = buildWpmSamples(keystrokeTimelineRef.current)

        return {
            speed: finalStats.rawWpm,
            rawWpm: finalStats.rawWpm,
            netWpm: finalStats.netWpm,
            accuracy: finalStats.accuracy,
            durationSeconds,
            totalKeystrokes: finalCharacterCount,
            correctKeystrokes,
            incorrectKeystrokes: finalIncorrectCount,
            typedText: typedTextRef.current,
            typedSegments: [...typedSegmentsRef.current],
            worstKeys: worstKeysFromAttempts(testCharAttemptsRef.current),
            timeline: encodeTimeline(keyEventsRef.current),
            wpmSamples,
            punctuation,
            capitals,
            ranked: !customLength,
            levelName: level?.name,
            typeId: testType?.id,
            persisted: false,
        }
    }, [subMode, mode, count, punctuation, capitals, customLength, level, testType?.id])

    const isCompletionValid = useCallback((source: CompletionSource) => {
        const attempt = activeAttemptRef.current
        const currentConfig = currentConfigRef.current

        if (!attempt) return false
        if (
            attempt.mode !== currentConfig.mode ||
            attempt.subMode !== currentConfig.subMode ||
            attempt.count !== currentConfig.count ||
            attempt.language !== currentConfig.language
        ) return false

        if (currentConfig.mode !== TestModes.normal) return true

        if (currentConfig.subMode === TestSubModes.timed) return source === "timer"
        if (currentConfig.subMode === TestSubModes.words) return source === "text"

        return false
    }, [])

    // Latest onTestComplete without making it a dependency of handleComplete —
    // parents recreate it every render, which would otherwise defeat memo(Text).
    const onTestCompleteRef = useRef(props.onTestComplete)
    useEffect(() => {
        onTestCompleteRef.current = props.onTestComplete
    }, [props.onTestComplete])

    const handleComplete = useCallback((correct: boolean, includeFinalCharacter = true, source: CompletionSource = "text") => {
        if (!isCompletionValid(source)) return

        // Timed Normal tests run to the clock, so the timer pauses itself; every
        // other mode is a stopwatch we stop here on completion.
        if (!isTimed) pause()
        setStarted(false)
        setRestarted(false)
        activeAttemptRef.current = null

        const characterCount = characterCountRef.current
        const incorrectCount = incorrectCountRef.current
        const finalCharacterCount = includeFinalCharacter ? characterCount + 1 : characterCount
        const finalIncorrectCount = includeFinalCharacter && !correct ? incorrectCount + 1 : incorrectCount
        const finalStats = getStats(finalCharacterCount, finalIncorrectCount)
        const completion = buildCompletion(finalStats, finalCharacterCount, finalIncorrectCount)

        if (mode === TestModes.normal) {
            if (
                levelRequirements &&
                (finalStats.speed < levelRequirements.wpm || finalStats.accuracy < levelRequirements.accuracy)
            ) {
                dispatch(addAlert({
                    message: `Need ${levelRequirements.wpm} WPM and ${levelRequirements.accuracy}% accuracy to complete this level.`,
                    type: "warning",
                }))
            } else {
                if (sessionData?.user && testType?.id) {
                    persistCompletion(completion, {
                        typeId: testType.id,
                        accuracy: finalStats.accuracy,
                        speed: finalStats.speed,
                        consistency: consistencyFromSamples(completion.wpmSamples),
                        score: finalStats.speed * finalStats.accuracy,
                        count: count,
                        options: level ? level.name : "",
                        punctuation,
                        capitals,
                        ranked: !customLength,
                        challengeDate: props.challengeDate,
                    })
                } else {
                    onTestCompleteRef.current?.(completion)
                }
            }
        } else if (mode === TestModes.ngrams) {
            setWpm(finalStats.rawWpm)
            setAccuracy(finalStats.accuracy)
            setWpmPending(!isReliableWpmSample(finalStats.durationSeconds, finalCharacterCount))
            if (finalStats.speed >= props.gramWpmThreshold &&
                finalCharacterCount > 0 &&
                finalStats.durationSeconds > 0 &&
                finalStats.accuracy >= props.gramAccuracyThreshold
            ) {
                recordPassedLevel(finalStats.speed)
            }
        }

        if (mode !== TestModes.ngrams) syncCharAttempts()
        // Transition analytics come from normal-mode tests, where the text is real
        // language (grams/practice text would skew the bigram picture).
        if (mode === TestModes.normal) syncTransitions(keyEventsRef.current)
    }, [
        isCompletionValid, isTimed, pause, getStats, buildCompletion, mode, levelRequirements,
        dispatch, sessionData, testType, persistCompletion, count, level, punctuation,
        capitals, customLength, props.gramWpmThreshold, props.gramAccuracyThreshold,
        props.challengeDate, recordPassedLevel, syncCharAttempts, syncTransitions,
    ])

    // Stable identities for parent-provided callbacks (parents recreate them every
    // render); without these, memo(Text) would never skip a render.
    const onKeyChangeRef = useRef(onKeyChange)
    const onAttemptChangeRef = useRef(onAttemptChange)
    useEffect(() => {
        onKeyChangeRef.current = onKeyChange
        onAttemptChangeRef.current = onAttemptChange
    }, [onKeyChange, onAttemptChange])
    const stableOnKeyChange = useCallback((key: string) => {
        onKeyChangeRef.current(key)
    }, [])
    const stableOnAttemptChange = useCallback(() => {
        onAttemptChangeRef.current?.()
    }, [])

    const handleSetCharacterCount = useCallback((charCount: number) => {
        characterCountRef.current = charCount
    }, [])
    const handleSetIncorrectCount = useCallback((charCount: number) => {
        incorrectCountRef.current = charCount
    }, [])
    const handleCharacterAttempt = useCallback((attempt: { expected: string, typed: string, correct: boolean }) => {
        typedTextRef.current += attempt.typed
        // Keep the correctness segments in lock-step with typedText so the rendered
        // text and its per-character highlight stay index-aligned.
        typedSegmentsRef.current.push({ ch: attempt.typed, correct: attempt.correct })
        // Timestamp the keystroke against the expected character for latency diagnosis.
        keyEventsRef.current.push({ key: attempt.expected, correct: attempt.correct, t: Date.now() })

        const entry = testCharAttemptsRef.current.get(attempt.expected) ?? { attempts: 0, correct: 0 }
        entry.attempts += 1
        if (attempt.correct) entry.correct += 1
        testCharAttemptsRef.current.set(attempt.expected, entry)
    }, [])
    // Record every keystroke (and backspace) with a real timestamp. This timeline is
    // the source of truth for the live WPM and the over-time chart.
    const handleProgress = useCallback((chars: number) => {
        keystrokeTimelineRef.current.push({ t: Date.now(), chars })
    }, [])

    useEffect(() => {
        if (!started) return

        // Live WPM is a pure cumulative figure off the real timeline: total chars over
        // the time since the first keystroke. No lower-bound suppression, so even a
        // sub-second test shows its exact WPM. The first keystroke sits at elapsed 0
        // (there is no measurable time before it), which reads as 0 rather than infinity.
        // Refreshing on an interval (rather than per keystroke) keeps typing from
        // re-rendering the whole Typer tree on every key.
        const update = () => {
            const characterCount = characterCountRef.current
            const incorrectCount = incorrectCountRef.current
            const timeline = keystrokeTimelineRef.current
            const startTime = timeline.length > 0 ? timeline[0]!.t : actualStartTime
            const elapsedMinutes = (Date.now() - startTime) / 60000
            setWpm(elapsedMinutes <= 0 ? 0 : (characterCount / 5) / elapsedMinutes)

            // calculate accuracy
            const correct = characterCount - incorrectCount
            if (characterCount == 0) setAccuracy(0)
            else setAccuracy(correct / characterCount * 100)

            // In grams, hold the WPM at "—" until the current level has produced a
            // measurable sample, so a 2-char level never flashes a 500-wpm spike.
            if (mode === TestModes.ngrams) {
                const elapsedSeconds = (Date.now() - startTime) / 1000
                setWpmPending(!isReliableWpmSample(elapsedSeconds, characterCount))
            }

            setTypedCount(characterCount)
        }

        update()
        const intervalId = setInterval(update, 250)
        return () => clearInterval(intervalId)
    }, [actualStartTime, started, mode])

    useRestartShortcut(restartRef, restartTest, isAnyModalOpen)

    // Before any keystroke of an attempt there is nothing meaningful to show. In
    // n-grams mode the displayed numbers are the last completed gram's, so only
    // treat them as pending until the first gram has produced a score.
    const statsPending = mode === TestModes.ngrams
        ? typedCount === 0 && wpm === 0 && accuracy === 0
        : typedCount === 0

    if (props.hideInterface) {
        return null
    }

    const textNode = (
        <Text
            text={text}
            language={language}
            mode={mode}
            subMode={subMode}
            punctuation={punctuation}
            capitals={capitals}
            noAppend={!!props.fixedText}
            started={started} restarted={restarted} restartNonce={restartNonce}
            modalOpen={props.modalOpen}
            charAttempts={charAttemptsRef.current}
            onStart={handleStart}
            onComplete={handleComplete}
            setCharacterCount={handleSetCharacterCount}
            setIncorrectCount={handleSetIncorrectCount}
            onKeyChange={stableOnKeyChange}
            onCharacterAttempt={handleCharacterAttempt}
            onProgress={handleProgress}
            onAttemptChange={stableOnAttemptChange}
        />
    )

    return (
        <div className="flex w-full flex-col px-4 py-8 sm:py-0 sm:justify-center items-center space-y-2">
            {showControls &&
            <div className="relative w-full max-w-screen-xl flex items-center justify-center gap-2">
                <div className={`absolute flex items-center h-full left-0 invisible ${text.length > 38 ? "md:visible" : ""}`}>
                    {showStats &&
                        <Stats mode={mode} wpm={wpm} accuracy={accuracy} pending={statsPending} wpmPending={wpmPending}
                            averageWpm={gramWpm} levelText={getGramLevelText(gramLevel, gramCombination, gramScope)}
                        />
                    }
                </div>
                {/* settings button */}
                {showConfig &&
                    <label className="btn btn-ghost btn-circle" htmlFor="configModal" aria-label="Open typing settings" title="Open typing settings">
                        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-7 h-7" viewBox="1.5 1.5 13 13"><path fill="currentColor" d="M8 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4ZM7 8a1 1 0 1 1 2 0a1 1 0 0 1-2 0Zm3.618-3.602a.708.708 0 0 1-.824-.567l-.26-1.416a.354.354 0 0 0-.275-.282a6.072 6.072 0 0 0-2.519 0a.354.354 0 0 0-.275.282l-.259 1.416a.71.71 0 0 1-.936.538l-1.359-.484a.355.355 0 0 0-.382.095a5.99 5.99 0 0 0-1.262 2.173a.352.352 0 0 0 .108.378l1.102.931a.704.704 0 0 1 0 1.076l-1.102.931a.352.352 0 0 0-.108.378A5.986 5.986 0 0 0 3.53 12.02a.355.355 0 0 0 .382.095l1.36-.484a.708.708 0 0 1 .936.538l.258 1.416c.026.14.135.252.275.281a6.075 6.075 0 0 0 2.52 0a.353.353 0 0 0 .274-.281l.26-1.416a.71.71 0 0 1 .936-.538l1.359.484c.135.048.286.01.382-.095a5.99 5.99 0 0 0 1.262-2.173a.352.352 0 0 0-.108-.378l-1.102-.931a.703.703 0 0 1 0-1.076l1.102-.931a.352.352 0 0 0 .108-.378A5.985 5.985 0 0 0 12.47 3.98a.355.355 0 0 0-.382-.095l-1.36.484a.71.71 0 0 1-.111.03Zm-6.62.58l.937.333a1.71 1.71 0 0 0 2.255-1.3l.177-.97a5.105 5.105 0 0 1 1.265 0l.178.97a1.708 1.708 0 0 0 2.255 1.3L12 4.977c.255.334.467.698.63 1.084l-.754.637a1.704 1.704 0 0 0 0 2.604l.755.637a4.99 4.99 0 0 1-.63 1.084l-.937-.334a1.71 1.71 0 0 0-2.255 1.3l-.178.97a5.099 5.099 0 0 1-1.265 0l-.177-.97a1.708 1.708 0 0 0-2.255-1.3L4 11.023a4.987 4.987 0 0 1-.63-1.084l.754-.638a1.704 1.704 0 0 0 0-2.603l-.755-.637a5.06 5.06 0 0 1 .63-1.084Z" /></svg>
                    </label>
                }
                {/* restart button */}
                <button className="btn btn-ghost btn-circle focus:outline-0" ref={restartRef} onClick={() => restartTest()} tabIndex={0} aria-label="Restart test" title="Restart test">
                    <svg id="restart" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-7 h-7" viewBox="0.8 1 22 22"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"><path d="M12 3a9 9 0 1 1-5.657 2" /><path d="M3 4.5h4v4" /></g></svg>
                </button>
                {/* fullscreen button */}
                <button className="btn btn-ghost btn-circle focus:outline-0" onClick={() => props.setFullscreen(!fullscreen)} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
                    {fullscreen ?
                        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-7 h-7" viewBox="15 -940 920 920" width="24px" fill="currentColor"><path d="M240-120v-120H120v-80h200v200h-80Zm400 0v-200h200v80H720v120h-80ZM120-640v-80h120v-120h80v200H120Zm520 0v-200h80v120h120v80H640Z" /></svg>
                        :
                        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-7 h-7" viewBox="15 -940 920 920" width="24px" fill="currentColor"><path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z" /></svg>
                    }
                </button>
            </div>
            }
            {showControls ?
                <>
                    {textNode}
                    <div className="flex flex-col relative items-center w-full">
                        {/* Countdown is Normal/Timed only — see the isTimed note above. */}
                        {isTimed &&
                            <div className={`py-2`}>
                                <span className={`flex font-mono text-4xl gap-4`}>
                                    <span className="flex">{time}</span>
                                </span>
                            </div>
                        }
                        <div className={`visible ${text.length > 38 ? "md:invisible" : ""}`} >
                            {showStats &&
                                <Stats mode={mode} wpm={wpm} accuracy={accuracy} pending={statsPending} wpmPending={wpmPending}
                                    averageWpm={gramWpm} levelText={getGramLevelText(gramLevel, gramCombination, gramScope)}
                                />
                            }
                        </div>
                        <p className="mt-2 font-mono text-xs text-base-content/40 select-none">
                            <kbd className="kbd kbd-xs">tab</kbd> + <kbd className="kbd kbd-xs">enter</kbd> — restart
                        </p>
                    </div>
                </>
                :
                <>
                    {/* Phase 2.5/2.6: the typing text is the visual center, with WPM/accuracy
                        (the timed countdown, or the grams level progress) stacked above it
                        on the left. Stats returns null when there's nothing to show. */}
                    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-5">
                        <Stats layout="stacked" mode={mode} wpm={wpm} accuracy={accuracy} pending={statsPending} wpmPending={wpmPending}
                            averageWpm={gramWpm} levelText={getGramLevelText(gramLevel, gramCombination, gramScope)}
                            isTimed={isTimed} time={time} showLiveStats={showStats}
                        />
                        {textNode}
                    </div>
                    <p className="mt-6 font-mono text-xs text-base-content/40 select-none">
                        <kbd className="kbd kbd-xs">tab</kbd> + <kbd className="kbd kbd-xs">enter</kbd> — restart
                    </p>
                </>
            }
        </div>
    )
}
