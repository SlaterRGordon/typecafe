import React, { useCallback, useEffect, useRef, useState } from "react"
import { TestSubModes, TestModes } from "./types"
import type { QuoteLength, TestCompletionResult, TestGramScopes, TestGramSources } from "./types"
import { Text } from "./Text"
import { useTimer } from "~/hooks/timer/useTimer"
import { api } from "~/utils/api"
import type { Level } from "./train/levels"
import { buildWpmSamples, computeStats, consistencyFromSamples, isReliableWpmSample, worstKeysFromAttempts } from "~/lib/stats"
import type { TypedSegment } from "~/lib/stats"
import { encodeTimeline } from "~/lib/keystrokes"
import { createKeystrokeRecorder } from "~/lib/keystrokeRecorder"
import type { KeystrokeRecorder } from "~/lib/keystrokeRecorder"
import { isAnyModalOpen } from "~/lib/modals"
import { isRankableTimeline } from "~/lib/antiCheat"
import { runWhenIdle } from "~/lib/idle"
import { publishActiveKey } from "./keySignal"
import { generateTestText } from "./hooks/useTestText"
import { useGramProgression } from "./hooks/useGramProgression"
import { useRestartShortcut } from "./hooks/useRestartShortcut"
import { useTestPersistence } from "./hooks/useTestPersistence"
import { typingFocusFadeClass } from "./typingFocus"

type CompletionSource = "text" | "timer"

export type { WpmSample, TypedSegment } from "~/lib/stats"
export type { TestCompletionResult } from "./types"

interface TyperProps {
    language: string,
    quoteLength?: QuoteLength,
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
    // Boss levels: pace the typist against a line moving at this net WPM.
    pacerWpm?: number,
    // No-miss levels: a single error ends the run and fails it (never persisted).
    failOnMiss?: boolean,
    onTestComplete?: (result: TestCompletionResult) => void,
    // Render the result instantly and patch in server fields when the save settles
    // (home only — see useTestPersistence). Pairs with onSavingChange for the loader.
    eagerResult?: boolean,
    onSavingChange?: (saving: boolean) => void,
    onTypingFocusChange?: (isTyping: boolean) => void,
    showStats: boolean,
    modalOpen: boolean,
    restartSignal?: number,
    onRestart?: () => void,
    hideInterface?: boolean,
    // Fixed seeded text (daily challenge): skip generation and never append.
    fixedText?: string,
    // Stamps the saved Test row as belonging to this day's challenge (YYYY-MM-DD).
    challengeDate?: string,
    charAttemptsRef: React.MutableRefObject<Map<string, { attempts: number, correct: number }>>
}

export const Typer = (props: TyperProps) => {
    const {
        language,
        quoteLength = "all",
        mode, subMode,
        selectedKeys,
        gramSource, gramScope, gramCombination, gramRepetition,
        count, showStats,
        punctuation = false, capitals = false,
        customLength = false,
        level,
        levelRequirements,
        charAttemptsRef,
        onRestart,
    } = props

    const [text, setText] = useState("")
    const [started, setStarted] = useState(false)
    const [restarted, setRestarted] = useState(true)
    // Bumped on every restart so the text view always re-renders fresh — even when
    // the regenerated text is identical (e.g. a grams level produces the same
    // deterministic gram), where `restarted`/`text` alone wouldn't change.
    const [restartNonce, setRestartNonce] = useState(0)
    // The recorder owns every per-keystroke capture for the attempt — the raw
    // event log plus the derived timeline, net counts and per-character attempts.
    // It's a ref (not state) so typing never re-renders Typer; the visible numbers
    // (wpm/accuracy/typedCount) refresh by reading it on a 250ms interval.
    const recorderRef = useRef<KeystrokeRecorder | null>(null)
    recorderRef.current ??= createKeystrokeRecorder()
    const recorder = recorderRef.current
    const [typedCount, setTypedCount] = useState(0)
    const [wpm, setWpm] = useState(0.00)
    const [accuracy, setAccuracy] = useState(0.00)
    // Grams levels can be as short as two characters; until a sample is long
    // enough to measure (see isReliableWpmSample) the WPM/avg show "—" rather
    // than an extrapolated spike like "500 wpm". Only ever set in grams mode.
    const [wpmPending, setWpmPending] = useState(false)
    const typedTextRef = useRef("")
    const typedSegmentsRef = useRef<TypedSegment[]>([])
    // Set the instant the pacer overtakes the typist; read by handleComplete to
    // force a fail, then cleared. A ref (not state) so it's readable synchronously
    // inside the completion that the overtake itself triggers.
    const pacerCaughtRef = useRef(false)
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

    const { sessionData, persistCompletion, syncCharAttempts, syncTransitions, isSaving } = useTestPersistence({
        mode,
        charAttemptsRef,
        onTestComplete: props.onTestComplete,
        eagerResult: props.eagerResult,
    })

    // Surface the save's in-flight state so the result card can show a loader while
    // the server-derived fields (share link, brag, delta, streak) are still coming.
    const onSavingChangeRef = useRef(props.onSavingChange)
    useEffect(() => { onSavingChangeRef.current = props.onSavingChange }, [props.onSavingChange])
    useEffect(() => { onSavingChangeRef.current?.(isSaving) }, [isSaving])

    const { gramLevel, gramWpm, resetProgression, recordPassedLevel } = useGramProgression(gramScope)

    // The countdown is a Normal/Timed concept only. Other modes can carry a
    // leftover subMode of "timed" (e.g. a persisted setting, or a programmatic
    // mode switch that didn't reset it); without this gate the timer would be a
    // decremental-to-0 countdown that fires onTimeOver the instant the test
    // starts, ending Practice/Grams/Relaxed immediately.
    const isTimed = subMode === TestSubModes.timed && mode === TestModes.normal
    // Timed ∞ (no timer): the relaxed engine on the timed sub-mode shows a rising
    // stopwatch instead of a countdown.
    const isCountUp = mode === TestModes.relaxed && subMode === TestSubModes.timed

    const { time, start, pause, setInitialTime, actualStartTime } = useTimer({
        _initialTime: isTimed ? count : 0,
        timerType: isTimed ? 'DECREMENTAL' : 'INCREMENTAL',
        endTime: isTimed ? 0 : 999999,
        countUp: isCountUp,
        onTimeOver: () => {
            handleComplete("timer")
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

    const getStats = useCallback((finalCharacterCount: number, finalIncorrectCount: number) => {
        return computeStats({
            timeline: recorder.timeline,
            characterCount: finalCharacterCount,
            incorrectCount: finalIncorrectCount,
            isTimed: subMode === TestSubModes.timed && mode === TestModes.normal,
            timedDurationSeconds: count,
            fallbackStartTime: actualStartTime,
        })
    }, [recorder, actualStartTime, subMode, mode, count])

    // Coalesces the rapid double-restart that fires when settings load right after
    // mount (default `normal` config → then the persisted mode). Only the *latest*
    // scheduled restart runs, so its fresh mode/config wins — the old boolean flag
    // let the first-fired (stale) closure win, which loaded normal text over the
    // returning grams/practice mode.
    const restartSeqRef = useRef(0)
    const textRequestRef = useRef(0)

    const handleRestart = useCallback((targetLevel?: number) => {
        const seq = ++restartSeqRef.current
        setTimeout(() => {
            if (seq === restartSeqRef.current) {
                // Off the restart frame: the sync round-trip/localStorage write
                // must not delay the fresh text paint (typing-feel §3).
                if (mode !== TestModes.ngrams) runWhenIdle(syncCharAttempts)

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
                        mode, subMode, count, language, quoteLength, punctuation, capitals,
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
                pacerCaughtRef.current = false
                recorder.reset()
                setRestarted(true)
                setRestartNonce((nonce) => nonce + 1)
                setTypedCount(0)
                // Blank the WPM in grams until a level produces a measurable sample.
                setWpmPending(mode === TestModes.ngrams)
                onRestartRef.current?.()
            }
        }, 0)
    }, [recorder, count, gramCombination, gramLevel, gramRepetition, gramScope, gramSource, syncCharAttempts, language, quoteLength, level, mode, pause, punctuation, capitals, selectedKeys, setInitialTime, subMode, props.fixedText])

    useEffect(() => {
        handleRestart()
    }, [handleRestart])

    // A user-initiated restart (button or tab+enter) re-runs the current test. In
    // grams this restarts the current level (regenerating its deterministic gram
    // and clearing the attempt), keeping the drill progression — switching
    // scope/source is what resets back to level 1.
    const restartTest = useCallback(() => {
        handleRestart()
    }, [handleRestart])

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
        const wpmSamples = buildWpmSamples(recorder.timeline)
        const timeline = encodeTimeline(recorder.events)
        // Quotes vary in length/difficulty, and train levels are short/targeted
        // (a single key set, a boss pacer), so neither posts to a leaderboard or
        // counts toward best WPM — they still persist a timeline and feed
        // diagnosis, streak, and activity, just unranked. `level` marks a train run.
        const ranked = mode !== TestModes.quotes && !customLength && !level && isRankableTimeline(timeline)

        return {
            speed: finalStats.rawWpm,
            rawWpm: finalStats.rawWpm,
            netWpm: finalStats.netWpm,
            accuracy: finalStats.accuracy,
            durationSeconds,
            totalKeystrokes: finalCharacterCount,
            correctKeystrokes,
            incorrectKeystrokes: finalIncorrectCount,
            promptText: text,
            typedText: typedTextRef.current,
            typedSegments: [...typedSegmentsRef.current],
            worstKeys: worstKeysFromAttempts(recorder.charAttempts),
            timeline,
            wpmSamples,
            punctuation,
            capitals,
            ranked,
            levelName: level?.name,
            pacerCaught: pacerCaughtRef.current,
            typeId: testType?.id,
            persisted: false,
        }
    }, [recorder, subMode, mode, count, punctuation, capitals, customLength, level, testType?.id, text])

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

    const onTypingFocusChangeRef = useRef(props.onTypingFocusChange)
    useEffect(() => {
        onTypingFocusChangeRef.current = props.onTypingFocusChange
    }, [props.onTypingFocusChange])

    useEffect(() => {
        onTypingFocusChangeRef.current?.(started)
        if (typeof document !== "undefined") {
            if (started) document.documentElement.dataset.typingFocus = "active"
            else delete document.documentElement.dataset.typingFocus
        }

        return () => {
            onTypingFocusChangeRef.current?.(false)
            if (typeof document !== "undefined") delete document.documentElement.dataset.typingFocus
        }
    }, [started])

    const handleComplete = useCallback((source: CompletionSource = "text") => {
        if (!isCompletionValid(source)) return

        // Timed Normal tests run to the clock, so the timer pauses itself; every
        // other mode is a stopwatch we stop here on completion.
        if (!isTimed) pause()
        setStarted(false)
        setRestarted(false)
        activeAttemptRef.current = null

        // The recorder records each keystroke synchronously (append fires before
        // completion), so its counts already include the final character — no
        // lag-correction needed.
        const finalCharacterCount = recorder.characterCount
        const finalIncorrectCount = recorder.incorrectCount
        const finalStats = getStats(finalCharacterCount, finalIncorrectCount)
        const completion = buildCompletion(finalStats, finalCharacterCount, finalIncorrectCount)

        window.gtag?.("event", "test_completed", {
            mode,
            wpm: Math.round(finalStats.netWpm),
            accuracy: Math.round(finalStats.accuracy),
            signed_in: !!sessionData?.user,
        })

        if (mode === TestModes.normal || mode === TestModes.quotes) {
            // An overtake (boss) or any error (no-miss) is a loss no matter what net
            // WPM the typed span measured — always the fail path, never persisted.
            if (
                pacerCaughtRef.current ||
                (props.failOnMiss && finalStats.accuracy < 100) ||
                (levelRequirements && finalStats.netWpm < levelRequirements.wpm)
            ) {
                onTestCompleteRef.current?.(completion)
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
                        ranked: completion.ranked,
                        timeline: completion.timeline,
                        utcOffsetMinutes: -new Date().getTimezoneOffset(),
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

        // Analytics ride an idle callback, not the completion paint (typing-feel
        // §3): aggregation + sync round-trips would otherwise stutter the result
        // render. `events` is captured by reference — reset() replaces the array,
        // so a restart can't mutate what the deferred aggregation reads.
        const events = recorder.events
        runWhenIdle(() => {
            if (mode !== TestModes.ngrams) syncCharAttempts()
            // Transition analytics come from normal-mode tests — including drills
            // (owner decision, ADR-0004 reversal): every rep counts toward the
            // lifetime pair data. Grams/practice text stays excluded.
            if (mode === TestModes.normal) syncTransitions(events)
        })

        pacerCaughtRef.current = false
    }, [
        recorder, isCompletionValid, isTimed, pause, getStats, buildCompletion, mode, levelRequirements,
        sessionData, testType, persistCompletion, count, level, punctuation,
        capitals, props.gramWpmThreshold, props.gramAccuracyThreshold,
        props.challengeDate, props.failOnMiss, recordPassedLevel, syncCharAttempts, syncTransitions,
    ])

    // The pacer caught the typist: flag the loss, then run completion (which reads
    // the flag, forces the fail path, and clears it).
    const handlePacerCaught = useCallback(() => {
        pacerCaughtRef.current = true
        handleComplete("text")
    }, [handleComplete])

    const handleCharacterAttempt = useCallback((attempt: { expected: string, typed: string, correct: boolean }) => {
        typedTextRef.current += attempt.typed
        // Keep the correctness segments in lock-step with typedText so the rendered
        // text and its per-character highlight stay index-aligned.
        typedSegmentsRef.current.push({ ch: attempt.typed, correct: attempt.correct })
        // Hand the committed keystroke to the recorder: it stamps the event,
        // advances the timeline + counts, and tallies the per-character attempt.
        recorder.append(attempt.expected, attempt.correct)
    }, [recorder])
    // A committed key was walked back; the recorder lowers the net count and
    // records the dip on the timeline (the source for live WPM and the chart).
    const handleBackspace = useCallback(() => {
        recorder.backspace()
    }, [recorder])

    useEffect(() => {
        if (!started) return

        // Live WPM is a pure cumulative figure off the real timeline: total chars over
        // the time since the first keystroke. No lower-bound suppression, so even a
        // sub-second test shows its exact WPM. The first keystroke sits at elapsed 0
        // (there is no measurable time before it), which reads as 0 rather than infinity.
        // Refreshing on an interval (rather than per keystroke) keeps typing from
        // re-rendering the whole Typer tree on every key.
        const update = () => {
            const characterCount = recorder.characterCount
            const incorrectCount = recorder.incorrectCount
            const timeline = recorder.timeline
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
    }, [recorder, actualStartTime, started, mode])

    useRestartShortcut(null, restartTest, isAnyModalOpen)

    // Before any keystroke of an attempt there is nothing meaningful to show. In
    // n-grams mode the displayed numbers are the last completed gram's, so only
    // treat them as pending until the first gram has produced a score.
    const statsPending = mode === TestModes.ngrams
        ? typedCount === 0 && wpm === 0 && accuracy === 0
        : typedCount === 0

    // Live stats line: rounded wpm, floored accuracy (so 100% always means
    // perfect), "—" while there's nothing measurable yet.
    const wpmBlank = statsPending || wpmPending
    const liveWpmText = wpmBlank ? "—" : String(Math.round(wpm))
    const liveAccText = statsPending ? "—" : String(Math.floor(accuracy))
    const liveAvgText = wpmBlank ? "—" : String(Math.round(gramWpm))

    // Word-count modes: words completed = spaces consumed in the prompt so far.
    const isWordCounted = mode === TestModes.normal && subMode === TestSubModes.words
    const isInfiniteWords = mode === TestModes.relaxed && subMode === TestSubModes.words
    const typedWords = (isWordCounted || isInfiniteWords)
        ? (text.slice(0, typedCount).match(/ /g)?.length ?? 0)
        : 0
    const gramTotalLevels = Math.ceil(gramScope / Math.max(gramCombination, 1))

    if (props.hideInterface) {
        return null
    }

    // The mode's counter rides inside Text's shrink-wrapped block so it follows
    // the text when a short prompt centers. The min-h reserves the row so modes
    // without one (grams, quotes, practice) never shift the text vertically.
    const counterNode = (
        <div className="mb-3 flex min-h-[1.75rem] items-end">
            {(isTimed || isCountUp) &&
                <span data-testid="timed-countdown" className="font-mono text-lg leading-none text-primary">
                    <span data-testid="stat-time">{time}</span>
                </span>
            }
            {isWordCounted &&
                <span data-testid="word-counter" className="font-mono text-[15px] leading-none text-primary">
                    {typedWords}<span className="text-base-content/40"> / {count}</span>
                </span>
            }
            {isInfiniteWords &&
                <span data-testid="word-counter" className="font-mono text-[15px] leading-none text-primary">
                    {typedWords}<span className="text-base-content/40"> words</span>
                </span>
            }
        </div>
    )

    const textNode = (
        <Text
            text={text}
            counter={counterNode}
            language={language}
            mode={mode}
            subMode={subMode}
            punctuation={punctuation}
            capitals={capitals}
            noAppend={!!props.fixedText}
            pacerWpm={props.pacerWpm}
            onPacerCaught={handlePacerCaught}
            failOnMiss={props.failOnMiss}
            appendKeys={level?.keys}
            started={started} restarted={restarted} restartNonce={restartNonce}
            modalOpen={props.modalOpen}
            charAttempts={charAttemptsRef.current}
            onStart={handleStart}
            onComplete={handleComplete}
            onKeyChange={publishActiveKey}
            onCharacterAttempt={handleCharacterAttempt}
            onBackspace={handleBackspace}
        />
    )

    return (
        <div className="flex w-full flex-col px-4 py-8 sm:py-0 sm:justify-center items-center space-y-2">
            <>
                    {/* Redesign skeleton (docs/features/typecafe-redesign-reference.html):
                        the mode's counter (countdown / word count) rides directly above the
                        text where the eyes already are (inside Text's shrink-wrapped block,
                        so it follows a centered short prompt); live wpm · % renders under
                        the text; then the mode's progress element; then the restart hint. */}
                    <div className="mx-auto flex w-full max-w-screen-xl flex-col">
                        {/* No reserved height: the #words block (in Text) caps at three
                            lines and scrolls, and shrinks to fit below that — so a short
                            prompt sits right above the live stats with no gap. */}
                        {textNode}
                    </div>
                    {showStats &&
                        <p data-testid="live-stats" className="font-mono text-sm text-base-content/45 select-none">
                            <span data-testid="stat-wpm">{liveWpmText}</span> wpm · <span data-testid="stat-acc">{liveAccText}</span>%
                            {mode === TestModes.ngrams && <> · <span data-testid="stat-avg">{liveAvgText}</span> avg</>}
                        </p>
                    }
                    {isWordCounted &&
                        <div className="w-[280px] pt-3">
                            <div className="h-0.5 overflow-hidden rounded-full bg-base-content/10">
                                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min((typedWords / Math.max(count, 1)) * 100, 100)}%` }} />
                            </div>
                        </div>
                    }
                    {mode === TestModes.ngrams &&
                        <div data-testid="gram-progress" className="w-[280px] pt-3">
                            <div className="mb-1.5 flex justify-between font-mono text-xs text-base-content/55">
                                <span>level {gramLevel}</span>
                                <span className="text-base-content/35">/ {gramTotalLevels}</span>
                            </div>
                            <div className="h-0.5 overflow-hidden rounded-full bg-base-content/10">
                                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min((gramLevel / Math.max(gramTotalLevels, 1)) * 100, 100)}%` }} />
                            </div>
                        </div>
                    }
                    <p className={typingFocusFadeClass(started, "mt-6 font-mono text-sm text-base-content/40 select-none")}>
                        <kbd className="kbd kbd-xs">tab</kbd> + <kbd className="kbd kbd-xs">enter</kbd> / <kbd className="kbd kbd-xs">space</kbd> — restart
                    </p>
            </>
        </div>
    )
}
