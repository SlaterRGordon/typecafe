import React, { useCallback, useEffect, useRef, useState } from "react"
import { TestSubModes, TestModes } from "./types"
import type { QuoteLength, TestCompletionResult } from "./types"
import { Text } from "./Text"
import { useTimer } from "~/hooks/timer/useTimer"
import { api } from "~/utils/api"
import type { Level } from "./train/levels"
import { buildWpmSamples, computeStats, worstKeysFromAttempts } from "~/lib/stats"
import type { TypedSegment } from "~/lib/stats"
import { encodeTimeline } from "~/lib/keystrokes"
import { createKeystrokeRecorder } from "~/lib/keystrokeRecorder"
import type { KeystrokeRecorder } from "~/lib/keystrokeRecorder"
import { isAnyModalOpen } from "~/lib/modals"
import { isRankableTimeline } from "~/lib/antiCheat"
import { runWhenIdle } from "~/lib/idle"
import { drillTargetToken, type CoachingTarget } from "~/lib/coachingTarget"
import { evidenceContextForRun, persistsSkillEvidence, type EvidenceContext, type PracticeRecord } from "~/lib/evidenceContext"
import { publishActiveKey } from "./keySignal"
import { generateTestText } from "./hooks/useTestText"
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
    count: number,
    punctuation?: boolean,
    capitals?: boolean,
    numbers?: boolean,
    customLength?: boolean,
    level?: Level,
    levelRequirements?: { wpm: number, accuracy: number },
    // Boss levels: pace the typist against a line moving at this net WPM.
    pacerWpm?: number,
    // No-miss levels: a single error ends the run and fails it (never persisted).
    failOnMiss?: boolean,
    evidenceContext?: EvidenceContext,
    // Custom/Guided Practice metadata. A supplied record turns Practice into a
    // finite timer run; Typer stamps elapsed/completed at the persistence seam.
    practiceRecord?: PracticeRecord,
    // Evidence-free Practice infinity keeps Practice visuals while using the
    // relaxed count-up engine and a focus-aware text stream.
    practiceInfinite?: boolean,
    streamText?: () => string,
    // The coaching Target a drill was launched for; persisted in the saved
    // test's options slot so analysis can attribute the run to that Target.
    drillTarget?: CoachingTarget,
    onTestComplete?: (result: TestCompletionResult) => void,
    // Render the result instantly and patch in server fields when the save settles
    // (home only - see useTestPersistence). Pairs with onSavingChange for the loader.
    eagerResult?: boolean,
    onSavingChange?: (saving: boolean) => void,
    onTypingFocusChange?: (isTyping: boolean) => void,
    showStats: boolean,
    modalOpen: boolean,
    restartSignal?: number,
    onRestart?: () => void,
    onRunRestart?: () => void,
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
        count, showStats,
        punctuation = false, capitals = false, numbers = false,
        customLength = false,
        level,
        levelRequirements,
        charAttemptsRef,
        onRestart,
        onRunRestart,
    } = props

    const [text, setText] = useState("")
    const [started, setStarted] = useState(false)
    const [restarted, setRestarted] = useState(true)
    // Bumped on every restart so the text view always re-renders fresh - even when
    // the regenerated text is identical (e.g. a grams level produces the same
    // deterministic gram), where `restarted`/`text` alone wouldn't change.
    const [restartNonce, setRestartNonce] = useState(0)
    // The recorder owns every per-keystroke capture for the attempt - the raw
    // event log plus the derived timeline, net counts and per-character attempts.
    // It's a ref (not state) so typing never re-renders Typer; the visible numbers
    // (wpm/accuracy/typedCount) refresh by reading it on a 250ms interval.
    const recorderRef = useRef<KeystrokeRecorder | null>(null)
    recorderRef.current ??= createKeystrokeRecorder()
    const recorder = recorderRef.current
    const [typedCount, setTypedCount] = useState(0)
    const [wpm, setWpm] = useState(0.00)
    const [accuracy, setAccuracy] = useState(0.00)
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

    const evidenceContext: EvidenceContext = props.evidenceContext ?? evidenceContextForRun({
        surface: level ? "train" : "test",
        mode,
    })
    const { sessionData, persistCompletion, persistActivity, persistGuestTimeline, syncCharAttempts, syncTransitions, isSaving } = useTestPersistence({
        evidenceContext,
        charAttemptsRef,
        onTestComplete: props.onTestComplete,
        eagerResult: props.eagerResult,
    })
    // Authentication can resolve after the user starts typing. Keep the latest
    // persistence destination without making that session change look like a
    // test-config change that restarts the prompt.
    const syncCharAttemptsRef = useRef(syncCharAttempts)
    useEffect(() => {
        syncCharAttemptsRef.current = syncCharAttempts
    }, [syncCharAttempts])

    // Surface the save's in-flight state so the result card can show a loader while
    // the server-derived fields (share link, brag, delta, streak) are still coming.
    const onSavingChangeRef = useRef(props.onSavingChange)
    useEffect(() => { onSavingChangeRef.current = props.onSavingChange }, [props.onSavingChange])
    useEffect(() => { onSavingChangeRef.current?.(isSaving) }, [isSaving])

    // The countdown is a Normal/Timed concept only. Other modes can carry a
    // leftover subMode of "timed" (e.g. a persisted setting, or a programmatic
    // mode switch that didn't reset it); without this gate the timer would be a
    // decremental-to-0 countdown that fires onTimeOver the instant the test
    // starts, ending Practice/Grams/Relaxed immediately.
    const isPracticeTimed = !!props.practiceRecord
    const isTimed = (subMode === TestSubModes.timed && mode === TestModes.normal) || isPracticeTimed
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

    const getStats = useCallback((finalCharacterCount: number, finalIncorrectCount: number) => {
        return computeStats({
            timeline: recorder.timeline,
            characterCount: finalCharacterCount,
            incorrectCount: finalIncorrectCount,
            isTimed,
            timedDurationSeconds: count,
            fallbackStartTime: actualStartTime,
        })
    }, [recorder, actualStartTime, isTimed, count])

    // Coalesces the rapid double-restart that fires when settings load right after
    // mount (default `normal` config → then the persisted mode). Only the *latest*
    // scheduled restart runs, so its fresh mode/config wins - the old boolean flag
    // let the first-fired (stale) closure win, which loaded normal text over the
    // returning grams/practice mode.
    const restartSeqRef = useRef(0)
    const textRequestRef = useRef(0)
    const persistInterruptedRef = useRef<() => void>(() => undefined)

    const handleRestart = useCallback(() => {
        persistInterruptedRef.current()
        const seq = ++restartSeqRef.current
        // Capture this at restart time. The idle callback may not run until the
        // next attempt has begun, and must not mistake those fresh keystrokes
        // for leftovers from the attempt being restarted.
        const hasPendingCharAttempts = charAttemptsRef.current.size > 0
        setTimeout(() => {
            if (seq === restartSeqRef.current) {
                // Off the restart frame: the sync round-trip/localStorage write
                // must not delay the fresh text paint (typing-feel §3).
                if (hasPendingCharAttempts) {
                    runWhenIdle(() => syncCharAttemptsRef.current())
                }

                // A daily challenge uses fixed seeded text - same for every client,
                // never regenerated or appended.
                if (props.fixedText) {
                    setText(props.fixedText)
                } else {
                    // Generation is async (non-English word lists load on demand);
                    // the token discards stale results if another restart raced it.
                    const requestToken = ++textRequestRef.current
                    void generateTestText({
                        mode, subMode, count, language, quoteLength, punctuation, capitals, numbers,
                        level,
                    }).then((newText) => {
                        if (textRequestRef.current === requestToken) setText(newText)
                    })
                }

                setInitialTime(isTimed ? count : 0)
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
                onRestartRef.current?.()
            }
        }, 0)
    }, [recorder, count, language, quoteLength, level, mode, pause, punctuation, capitals, numbers, setInitialTime, subMode, props.fixedText, charAttemptsRef, isTimed])

    useEffect(() => {
        handleRestart()
    }, [handleRestart])

    // A user-initiated restart (button or tab+enter) re-runs the current test. In
    // grams this restarts the current level (regenerating its deterministic gram
    // and clearing the attempt), keeping the drill progression - switching
    // scope/source is what resets back to level 1.
    const restartTest = useCallback(() => {
        onRunRestart?.()
        handleRestart()
    }, [handleRestart, onRunRestart])

    // Read the latest restartTest without depending on it: it's recreated whenever
    // settings change, and depending on it here would re-fire this effect.
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
        const durationSeconds = isTimed
            ? count
            : finalStats.durationSeconds
        const wpmSamples = buildWpmSamples(recorder.timeline)
        const timeline = encodeTimeline(recorder.evidence)
        // Quotes vary in length/difficulty, and train levels are short/targeted
        // (a single key set, a boss pacer), so neither posts to a leaderboard or
        // counts toward best WPM - they still persist a timeline and feed
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
            numbers,
            ranked,
            levelName: level?.name,
            pacerCaught: pacerCaughtRef.current,
            typeId: testType?.id,
            persisted: false,
        }
    }, [recorder, isTimed, mode, count, punctuation, capitals, numbers, customLength, level, testType?.id, text])

    persistInterruptedRef.current = () => {
        if (!props.practiceRecord || !activeAttemptRef.current) return
        const finalCharacterCount = recorder.characterCount
        const finalIncorrectCount = recorder.incorrectCount
        const completion = buildCompletion(getStats(finalCharacterCount, finalIncorrectCount), finalCharacterCount, finalIncorrectCount)
        const elapsedActivityMs = Math.max(0, Date.now() - actualStartTime)
        const practice: PracticeRecord = {
            ...props.practiceRecord,
            elapsedActivityMs,
            completed: false,
        }
        if (sessionData?.user && testType?.id) {
            persistActivity({
                typeId: testType.id,
                count,
                options: "",
                punctuation: false,
                capitals: false,
                numbers: false,
                timeline: completion.timeline,
                context: evidenceContext,
                practice,
                utcOffsetMinutes: -new Date().getTimezoneOffset(),
            })
        } else if (!sessionData?.user) {
            persistGuestTimeline(completion, {
                mode,
                subMode,
                count,
                options: "",
                punctuation: false,
                capitals: false,
                numbers: false,
                language,
                utcOffsetMinutes: -new Date().getTimezoneOffset(),
            }, practice)
        }
        activeAttemptRef.current = null
    }

    useEffect(() => () => persistInterruptedRef.current(), [])

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

        if (isPracticeTimed && currentConfig.mode === TestModes.practice) return source === "timer"
        if (currentConfig.mode !== TestModes.normal) return true

        if (currentConfig.subMode === TestSubModes.timed) return source === "timer"
        if (currentConfig.subMode === TestSubModes.words) return source === "text"

        return false
    }, [isPracticeTimed])

    // Latest onTestComplete without making it a dependency of handleComplete -
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
        // completion), so its counts already include the final character - no
        // lag-correction needed.
        const finalCharacterCount = recorder.characterCount
        const finalIncorrectCount = recorder.incorrectCount
        const finalStats = getStats(finalCharacterCount, finalIncorrectCount)
        const completion = buildCompletion(finalStats, finalCharacterCount, finalIncorrectCount)
        const passedAttempt = !pacerCaughtRef.current &&
            !(props.failOnMiss && finalStats.accuracy < 100) &&
            !(levelRequirements && finalStats.netWpm < levelRequirements.wpm)

        window.gtag?.("event", "test_completed", {
            mode,
            wpm: Math.round(finalStats.netWpm),
            accuracy: Math.round(finalStats.accuracy),
            signed_in: !!sessionData?.user,
        })

        if (props.practiceRecord) {
            const practice: PracticeRecord = {
                ...props.practiceRecord,
                elapsedActivityMs: count * 1_000,
                completed: true,
            }
            if (sessionData?.user && testType?.id) {
                persistCompletion(completion, {
                    typeId: testType.id,
                    count,
                    options: "",
                    punctuation: false,
                    capitals: false,
                    numbers: false,
                    timeline: completion.timeline,
                    context: evidenceContext,
                    practice,
                    utcOffsetMinutes: -new Date().getTimezoneOffset(),
                })
            } else {
                onTestCompleteRef.current?.(completion)
            }
        } else if (mode === TestModes.normal || mode === TestModes.quotes) {
            // An overtake (boss) or any error (no-miss) is a loss no matter what net
            // WPM the typed span measured - always the fail path, never persisted.
            if (
                !passedAttempt
            ) {
                onTestCompleteRef.current?.(completion)
            } else {
                if (sessionData?.user && testType?.id) {
                    persistCompletion(completion, {
                        typeId: testType.id,
                        count: count,
                        options: level ? level.name : props.drillTarget ? drillTargetToken(props.drillTarget) : "",
                        punctuation,
                        capitals,
                        numbers,
                        timeline: completion.timeline,
                        context: evidenceContext,
                        utcOffsetMinutes: -new Date().getTimezoneOffset(),
                        challengeDate: props.challengeDate,
                    })
                } else {
                    onTestCompleteRef.current?.(completion)
                }
            }
        }

        // Analytics ride an idle callback, not the completion paint (typing-feel
        // §3): aggregation + sync round-trips would otherwise stutter the result
        // render. `events` is captured by reference - reset() replaces the array,
        // so a restart can't mutate what the deferred aggregation reads.
        const events = recorder.events
        runWhenIdle(() => {
            if (!props.practiceRecord) syncCharAttempts()
            // Transition analytics come from normal-mode tests - including drills
            // (owner decision, ADR-0004 reversal): every rep counts toward the
            // lifetime pair data. Grams/practice text stays excluded.
            if (mode === TestModes.normal) syncTransitions(events)
            const eligibleGuestTimeline = mode === TestModes.normal || mode === TestModes.quotes || !!props.practiceRecord
            if (!sessionData?.user && passedAttempt && eligibleGuestTimeline && persistsSkillEvidence(evidenceContext)) {
                const practice = props.practiceRecord ? {
                    ...props.practiceRecord,
                    elapsedActivityMs: count * 1_000,
                    completed: true,
                } : undefined
                persistGuestTimeline(completion, {
                    mode,
                    subMode,
                    count,
                    options: level?.name ?? (props.drillTarget ? drillTargetToken(props.drillTarget) : ""),
                    punctuation,
                    capitals,
                    numbers,
                    language,
                    utcOffsetMinutes: -new Date().getTimezoneOffset(),
                }, practice)
            }
        })

        pacerCaughtRef.current = false
    }, [
        recorder, isCompletionValid, isTimed, pause, getStats, buildCompletion, mode, levelRequirements,
        sessionData, testType, persistCompletion, count, level, punctuation,
        capitals, numbers, props.challengeDate, props.drillTarget, props.failOnMiss, syncCharAttempts, syncTransitions,
        evidenceContext, persistGuestTimeline, subMode, language, props.practiceRecord,
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
        recorder.append(attempt.expected, attempt.typed, attempt.correct)
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

            setTypedCount(characterCount)
        }

        update()
        const intervalId = setInterval(update, 250)
        return () => clearInterval(intervalId)
    }, [recorder, actualStartTime, started, mode])

    useRestartShortcut(null, restartTest, isAnyModalOpen)

    // Before any keystroke of an attempt there is nothing meaningful to show. In
    const statsPending = typedCount === 0

    // Live stats line: rounded wpm, floored accuracy (so 100% always means
    // perfect), "-" while there's nothing measurable yet.
    const wpmBlank = statsPending
    const liveWpmText = wpmBlank ? "-" : String(Math.round(wpm))
    const liveAccText = statsPending ? "-" : String(Math.floor(accuracy))

    // Word-count modes: words completed = spaces consumed in the prompt so far.
    const isWordCounted = mode === TestModes.normal && subMode === TestSubModes.words
    const isInfiniteWords = mode === TestModes.relaxed && subMode === TestSubModes.words
    const typedWords = (isWordCounted || isInfiniteWords)
        ? (text.slice(0, typedCount).match(/ /g)?.length ?? 0)
        : 0

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
            numbers={numbers}
            noAppend={!!props.fixedText && !props.streamText}
            appendText={props.streamText}
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
                            lines and scrolls, and shrinks to fit below that - so a short
                            prompt sits right above the live stats with no gap. */}
                        {textNode}
                    </div>
                    {showStats && (mode === TestModes.practice || props.practiceInfinite ?
                        <div
                            data-testid="practice-status-bar"
                            className="flex items-center justify-center gap-4 font-mono text-xs text-base-content/45 select-none"
                        >
                            <p data-testid="live-stats" className="flex items-baseline gap-1.5">
                                <span data-testid="stat-wpm" className="text-sm font-semibold text-base-content/75">{liveWpmText}</span>
                                <span>wpm</span>
                                <span className="mx-1 h-3 w-px self-center bg-base-content/15" aria-hidden="true" />
                                <span className="inline-flex items-baseline">
                                    <span data-testid="stat-acc" className="text-sm font-semibold text-base-content/75">{liveAccText}</span>
                                    <span>%</span>
                                </span>
                                <span>accuracy</span>
                            </p>
                            <span className="h-4 w-px bg-base-content/15" aria-hidden="true" />
                            <p className={typingFocusFadeClass(started, "flex items-center gap-1.5 whitespace-nowrap")}>
                                <kbd className="kbd kbd-xs">tab</kbd> + <kbd className="kbd kbd-xs">enter</kbd>
                                <span aria-hidden="true">/</span>
                                <kbd className="kbd kbd-xs">space</kbd>
                                <span>restart</span>
                            </p>
                        </div>
                        :
                        <p data-testid="live-stats" className="font-mono text-sm text-base-content/45 select-none">
                            <span data-testid="stat-wpm">{liveWpmText}</span> wpm · <span data-testid="stat-acc">{liveAccText}</span>%
                        </p>
                    )}
                    {isWordCounted &&
                        <div className="w-[280px] pt-3">
                            <div className="h-0.5 overflow-hidden rounded-full bg-base-content/10">
                                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min((typedWords / Math.max(count, 1)) * 100, 100)}%` }} />
                            </div>
                        </div>
                    }
                    {mode !== TestModes.practice && !props.practiceInfinite &&
                        <p className={typingFocusFadeClass(started, "mt-6 font-mono text-sm text-base-content/40 select-none")}>
                            <kbd className="kbd kbd-xs">tab</kbd> + <kbd className="kbd kbd-xs">enter</kbd> / <kbd className="kbd kbd-xs">space</kbd> - restart
                        </p>
                    }
            </>
        </div>
    )
}
