import React, { useCallback, useEffect, useRef, useState } from "react"
import { TestSubModes, TestModes } from "./types"
import type { TestGramScopes, TestGramSources } from "./types"
import { applyTextOptions, generateBetterPseudoText, generateNGram, generateText, getGramLevelText } from "./utils"
import { Text } from "./Text"
import { Stats } from "./Stats"
import { useTimer } from "~/hooks/timer/useTimer"
import { api } from "~/utils/api"
import type { Level } from "./learn/levels"
import { useSession } from "next-auth/react"
import { useDispatch } from "react-redux"
import { addAlert } from "~/state/alert/alertSlice"

interface Keys {
    [key: string]: boolean
}

type CompletionSource = "text" | "timer"

// Rolling-window settings for the WPM-over-time chart. The headline WPM stays a
// pure cumulative figure (chars / 5 over total elapsed time); these constants only
// shape the instantaneous samples plotted on the graph.
const WPM_WINDOW_SECONDS = 1
const WPM_MIN_WINDOW_SECONDS = 0.2
const WPM_SAMPLE_TARGET_POINTS = 60
const WPM_MIN_SAMPLE_STEP_SECONDS = 0.1

export interface WpmSample {
    elapsedSeconds: number,
    wpm: number,
}

// One entry per keystroke: the wall-clock time it happened and the net character
// count at that moment (backspaces lower the count). This raw timeline is the
// single source of truth for both the live WPM and the over-time chart.
interface Keystroke {
    t: number,
    chars: number,
}

// Net characters typed at or before `elapsedSec` (seconds since the first keystroke).
function charsAtElapsed(timeline: Keystroke[], t0: number, elapsedSec: number) {
    let chars = 0
    for (const stroke of timeline) {
        if ((stroke.t - t0) / 1000 <= elapsedSec + 1e-9) chars = stroke.chars
        else break
    }
    return chars
}

// Instantaneous raw WPM over a trailing window ending at `elapsedSec`. The window
// shrinks toward the start of the test but never below WPM_MIN_WINDOW_SECONDS, so a
// lone early keystroke does not extrapolate to an unbounded spike.
function instantaneousWpm(timeline: Keystroke[], t0: number, elapsedSec: number) {
    const windowSeconds = Math.min(WPM_WINDOW_SECONDS, Math.max(elapsedSec, WPM_MIN_WINDOW_SECONDS))
    const charsInWindow = charsAtElapsed(timeline, t0, elapsedSec) - charsAtElapsed(timeline, t0, elapsedSec - windowSeconds)
    if (charsInWindow <= 0) return 0
    return (charsInWindow / 5) / (windowSeconds / 60)
}

// Real-data samples for the chart: walk evenly from the first keystroke to the last,
// reading instantaneous WPM straight from the recorded timeline. Nothing is
// backfilled or interpolated from a stale cumulative count.
function buildWpmSamples(timeline: Keystroke[]): WpmSample[] {
    if (timeline.length === 0) return []
    const t0 = timeline[0]!.t
    const endElapsed = (timeline[timeline.length - 1]!.t - t0) / 1000
    if (endElapsed <= 0) return [{ elapsedSeconds: 0, wpm: 0 }]

    const step = Math.max(endElapsed / WPM_SAMPLE_TARGET_POINTS, WPM_MIN_SAMPLE_STEP_SECONDS)
    const samples: WpmSample[] = []
    for (let elapsed = step; elapsed < endElapsed; elapsed += step) {
        samples.push({ elapsedSeconds: elapsed, wpm: instantaneousWpm(timeline, t0, elapsed) })
    }
    samples.push({ elapsedSeconds: endElapsed, wpm: instantaneousWpm(timeline, t0, endElapsed) })
    return samples
}

export interface TestCompletionResult {
    speed: number,
    rawWpm: number,
    netWpm: number,
    accuracy: number,
    durationSeconds: number,
    totalKeystrokes: number,
    correctKeystrokes: number,
    incorrectKeystrokes: number,
    typedText: string,
    wpmSamples: WpmSample[],
    punctuation: boolean,
    capitals: boolean,
    ranked: boolean,
    levelName?: string,
    persisted: boolean,
    testId?: string,
}

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
    onTestComplete?(result: TestCompletionResult): void,
    showStats: boolean,
    modalOpen: boolean,
    showConfig: boolean,
    fullscreen: boolean,
    setFullscreen(fullscreen: boolean): void,
    restartSignal?: number,
    onRestart?: () => void,
    hideInterface?: boolean,
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
        modalOpen,
        fullscreen,
        charAttemptsRef,
        onKeyChange,
        onAttemptChange,
        onRestart
    } = props

    const { data: sessionData } = useSession();
    const dispatch = useDispatch();

    const [text, setText] = useState("")
    const [started, setStarted] = useState(false)
    const [restarted, setRestarted] = useState(true)
    const [characterCount, setCharacterCount] = useState(0)
    const [incorrectCount, setIncorrectCount] = useState(0)
    const [wpm, setWpm] = useState(0.00)
    const [gramWpm, setGramWpm] = useState(0.00)
    const [accuracy, setAccuracy] = useState(0.00)
    const [gramLevel, setGramLevel] = useState<number>(1)
    const pendingCompletionRef = useRef<TestCompletionResult | null>(null)
    const typedTextRef = useRef("")
    const keystrokeTimelineRef = useRef<Keystroke[]>([])
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

    // create test
    const createTest = api.test.create.useMutation({
        onSuccess: (test) => {
            const completion = pendingCompletionRef.current
            if (completion) {
                props.onTestComplete?.({ ...completion, persisted: true, testId: test.id })
                pendingCompletionRef.current = null
            }
        },
        onError: (error) => {
            console.log(error)
        }
    })

    const { mutate: syncPracticeStats } = api.practiceStats.batchSync.useMutation({
        onError: (error) => {
            console.error(error)
        },
    })

    const { time, start, pause, setInitialTime, actualStartTime } = useTimer({
        _initialTime: subMode === TestSubModes.timed ? count : 0,
        timerType: subMode === TestSubModes.timed ? 'DECREMENTAL' : 'INCREMENTAL',
        endTime: subMode === TestSubModes.timed ? 0 : 999999,
        onTimeOver: () => {
            handleComplete(false, false, "timer")
        },
    })

    useEffect(() => {
        if (subMode === TestSubModes.timed && mode === TestModes.normal)
            setInitialTime(count)
        else setInitialTime(0)
    }, [count, setInitialTime, mode, subMode, language])

    useEffect(() => {
        if (mode === TestModes.ngrams) {
            setGramLevel(1)
            setGramWpm(0.00)
        }
    }, [mode, subMode, gramSource, gramScope, gramCombination, gramRepetition])

    // ref for restart button
    const restartRef = useRef(null)

    const getStats = useCallback((finalCharacterCount = characterCount, finalIncorrectCount = incorrectCount) => {
        const timeline = keystrokeTimelineRef.current
        // Timed tests always run the full configured duration. Otherwise measure from
        // the first keystroke to the last recorded one for millisecond-accurate timing.
        const isTimed = subMode === TestSubModes.timed && mode === TestModes.normal
        const startTime = timeline.length > 0 ? timeline[0]!.t : actualStartTime
        const endTime = timeline.length > 0 ? timeline[timeline.length - 1]!.t : Date.now()
        const durationSeconds = isTimed ? count : Math.max((endTime - startTime) / 1000, 0)
        const minutes = durationSeconds / 60
        const speed = minutes <= 0 ? 0 : (finalCharacterCount / 5) / minutes
        const correctCount = finalCharacterCount - finalIncorrectCount
        const finalAccuracy = finalCharacterCount === 0 ? 0 : correctCount / finalCharacterCount * 100
        const netWpm = minutes <= 0 ? 0 : Math.max(((correctCount - finalIncorrectCount) / 5) / minutes, 0)

        return { speed, rawWpm: speed, netWpm, accuracy: finalAccuracy, durationSeconds }
    }, [actualStartTime, characterCount, incorrectCount, subMode, mode, count])

    const handleCreateTest = (testWpm = wpm, testAccuracy = accuracy) => {
        if (!sessionData?.user) {
            return;
        }

        if (!testType?.id) return

        pendingCompletionRef.current ??= {
            speed: testWpm,
            rawWpm: testWpm,
            netWpm: testWpm,
            accuracy: testAccuracy,
            durationSeconds: 0,
            totalKeystrokes: 0,
            correctKeystrokes: 0,
            incorrectKeystrokes: 0,
            typedText: "",
            wpmSamples: [],
            punctuation,
            capitals,
            ranked: !customLength,
            levelName: level?.name,
            persisted: false,
        }

        createTest.mutate({
            typeId: testType.id,
            accuracy: testAccuracy,
            speed: testWpm,
            score: testWpm * testAccuracy,
            count: count,
            options: level ? level.name : "",
            punctuation,
            capitals,
            ranked: !customLength,
        })
    }

    const handleUpdateStats = useCallback(() => {
        if (mode !== TestModes.practice) return
        if (!sessionData?.user) return

        const stats = Array.from(charAttemptsRef.current.entries()).map(
            ([character, value]) => ({
                character,
                total: value.attempts,
                correct: value.correct,
            }),
        )

        if (stats.length === 0) return

        syncPracticeStats({ stats }, {
            onSuccess: () => {
                for (const key of stats.map((s) => s.character)) {
                    charAttemptsRef.current.delete(key)
                }
            },
        })
    }, [charAttemptsRef, mode, sessionData?.user, syncPracticeStats])

    const cancelRestartRef = useRef(false)

    const handleRestart = useCallback(() => {
        cancelRestartRef.current = true; 
        setTimeout(() => {
            if (cancelRestartRef.current) {
                cancelRestartRef.current = false; // Reset the cancel flag
                if (mode !== TestModes.ngrams) handleUpdateStats()
                if (mode === TestModes.normal) {
                    if (subMode === TestSubModes.timed) {
                        setText(applyTextOptions(generateText(500, language), punctuation, capitals))
                    } else if (subMode === TestSubModes.words) {
                        if (level) setText(applyTextOptions(generateBetterPseudoText(count, level.keys.split("")), punctuation, capitals))
                        else setText(applyTextOptions(generateText(count, language), punctuation, capitals))
                    }
                } else if (mode === TestModes.practice) {
                    if (selectedKeys) setText(applyTextOptions(generateBetterPseudoText(500, selectedKeys), punctuation, capitals))
                } else if (mode === TestModes.ngrams) {
                    setText(generateNGram(gramSource, gramScope, gramCombination, gramRepetition, gramLevel))
                } else if (mode === TestModes.relaxed) {
                    setText(applyTextOptions(generateText(50, language), punctuation, capitals))
                }
        
                setInitialTime(mode === TestModes.normal && subMode === TestSubModes.timed ? count : 0)
                pause()
                setStarted(false)
                activeAttemptRef.current = null
                typedTextRef.current = ""
                keystrokeTimelineRef.current = []
                setRestarted(true)
                setCharacterCount(0)
                setIncorrectCount(0)
                onRestartRef.current?.()
            }
        }, 0)
    }, [count, gramCombination, gramLevel, gramRepetition, gramScope, gramSource, handleUpdateStats, language, level, mode, pause, punctuation, capitals, selectedKeys, setInitialTime, subMode])

    useEffect(() => {
        handleRestart()
    }, [handleRestart])

    useEffect(() => {
        if (!props.restartSignal) return
        handleRestart()
    }, [handleRestart, props.restartSignal])

    const handleStart = () => {
        activeAttemptRef.current = {
            mode,
            subMode,
            count,
            language,
        }
        start()
        setStarted(true)
    }

    const buildCompletion = (
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
            wpmSamples,
            punctuation,
            capitals,
            ranked: !customLength,
            levelName: level?.name,
            persisted: false,
        }
    }

    const isCompletionValid = (source: CompletionSource) => {
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
    }

    const handleComplete = (correct: boolean, includeFinalCharacter = true, source: CompletionSource = "text") => {
        if (!isCompletionValid(source)) return

        if (subMode !== TestSubModes.timed) pause()
        setStarted(false)
        setRestarted(false)
        activeAttemptRef.current = null

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
                if (sessionData?.user) {
                    pendingCompletionRef.current = completion
                    handleCreateTest(finalStats.speed, finalStats.accuracy)
                } else {
                    props.onTestComplete?.(completion)
                }
            }
        } else if (mode === TestModes.ngrams) {
            setWpm(finalStats.rawWpm)
            setAccuracy(finalStats.accuracy)
            if (finalStats.speed >= props.gramWpmThreshold &&
                finalCharacterCount > 0 &&
                finalStats.durationSeconds > 0 &&
                finalStats.accuracy >= props.gramAccuracyThreshold
            ) {
                if (gramLevel < gramScope - 1) {
                    if (gramLevel !== 1) setGramWpm(((gramWpm * gramLevel) + finalStats.speed) / (gramLevel + 1))
                    else setGramWpm(finalStats.speed)

                    setGramLevel(gramLevel + 1)
                } else if (gramLevel == gramScope - 1) {
                    setGramWpm(0.00)
                    setGramLevel(1)
                }
            }
        }

        if (mode !== TestModes.ngrams) handleUpdateStats()
    }

    const handleSetCharacterCount = useCallback((charCount: number) => {
        setCharacterCount(charCount)
    }, [])
    const handleSetIncorrectCount = useCallback((charCount: number) => {
        setIncorrectCount(charCount)
    }, [])
    const handleCharacterAttempt = useCallback((attempt: { typed: string, correct: boolean }) => {
        typedTextRef.current += attempt.typed
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
        const timeline = keystrokeTimelineRef.current
        const startTime = timeline.length > 0 ? timeline[0]!.t : actualStartTime
        const elapsedMinutes = (Date.now() - startTime) / 60000
        setWpm(elapsedMinutes <= 0 ? 0 : (characterCount / 5) / elapsedMinutes)

        // calculate accuracy
        const correct = characterCount - incorrectCount
        if (characterCount == 0) setAccuracy(0)
        else setAccuracy(correct / characterCount * 100)
    }, [actualStartTime, characterCount, incorrectCount, started])

    useEffect(() => {

        let keys: Keys = {}
        let restarting = false

        const isShortcutModalOpen = () => {
            const configModal = document.getElementById("configModal") as HTMLInputElement | null
            const colorModal = document.getElementById("colorModal") as HTMLInputElement | null
            const signInModal = document.getElementById("signInModal") as HTMLInputElement | null
            const usernameModal = document.getElementById("usernameModal")

            return !!configModal?.checked ||
                !!colorModal?.checked ||
                !!signInModal?.checked ||
                !!usernameModal?.classList.contains("modal-open")
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isShortcutModalOpen() || keys[e.key] || e.repeat) return

            // add to currently pressed keys
            keys = { ...keys, [e.key]: true };

            if (keys['Tab']) {
                e.preventDefault()
                const restartBtn = restartRef.current as HTMLButtonElement | null
                if (restartBtn) {
                    restartBtn.classList.add("btn-active")
                    restartBtn.focus()
                }
            }

            const hasRestartKey = keys[' '] || keys['Space'] || keys['Spacebar'] || keys['Enter']

            if (keys['Tab'] && hasRestartKey && !restarting) {
                restarting = true
                handleRestart()
            }
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            if (isShortcutModalOpen()) return

            // remove from currently pressed keys
            keys = { ...keys, [e.key]: false };

            const hasRestartKey = keys[' '] || keys['Space'] || keys['Spacebar'] || keys['Enter']

            if (!(keys['Tab'] && hasRestartKey) && restarting) {
                restarting = false
            }

            if (e.key == 'Tab') {
                const restartBtn = restartRef.current as HTMLButtonElement | null
                if (restartBtn) {
                    restartBtn.classList.remove("btn-active")
                    restartBtn.blur()
                }
            }
        }

        document.addEventListener("keydown", handleKeyDown, true);
        document.addEventListener("keyup", handleKeyUp, true);

        return () => {
            document.removeEventListener("keydown", handleKeyDown, true);
            document.removeEventListener("keyup", handleKeyUp, true);
        };
    }, [mode, subMode, modalOpen, handleRestart]);

    if (props.hideInterface) {
        return null
    }

    return (
        <div className="flex w-full flex-col px-4 py-8 sm:py-0 sm:justify-center items-center space-y-2">
            <div className="flex relative justify-center items-center w-full gap-2 max-w-screen-xl">
                <div className={`absolute flex items-center h-full left-0 invisible ${text.length > 38 ? "md:visible" : ""}`}>
                    {showStats &&
                        <Stats mode={mode} wpm={wpm} accuracy={accuracy}
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
                <button className="btn btn-ghost btn-circle focus:outline-0" ref={restartRef} onClick={handleRestart} tabIndex={0} aria-label="Restart test" title="Restart test">
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
            <Text
                text={text}
                language={language}
                mode={mode}
                punctuation={punctuation}
                capitals={capitals}
                started={started} restarted={restarted}
                modalOpen={props.modalOpen}
                charAttempts={charAttemptsRef.current}
                onStart={handleStart}
                onComplete={handleComplete}
                setCharacterCount={handleSetCharacterCount}
                setIncorrectCount={handleSetIncorrectCount}
                onKeyChange={onKeyChange}
                onCharacterAttempt={handleCharacterAttempt}
                onProgress={handleProgress}
                onAttemptChange={onAttemptChange}
            />
            <div className="flex flex-col relative items-center w-full">
                {subMode === TestSubModes.timed &&
                    <div className={`py-2`}>
                        <span className={`flex font-mono text-4xl gap-4`}>
                            <span className="flex">{time}</span>
                        </span>
                    </div>
                }
                <div className={`visible ${text.length > 38 ? "md:invisible" : ""}`} >
                    {showStats &&
                        <Stats mode={mode} wpm={wpm} accuracy={accuracy}
                            averageWpm={gramWpm} levelText={getGramLevelText(gramLevel, gramCombination, gramScope)}
                        />
                    }
                </div>
            </div>
        </div>
    )
}
