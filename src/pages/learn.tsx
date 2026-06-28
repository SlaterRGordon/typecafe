import { type NextPage } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Typer } from "~/components/typer/Typer";
import { TestGramScopes, TestGramSources, TestModes, TestSubModes } from "~/components/typer/types";
import type { Level } from "~/components/typer/learn/levels";
import { levels } from "~/components/typer/learn/levels";
import { api } from "~/utils/api";
import Select from 'react-select'
import type { SingleValue } from "react-select";
import { Keyboard } from "~/components/typer/Keyboard";
import { typingFocusFadeClass } from "~/components/typer/typingFocus";
import { useSession } from "next-auth/react";
import type { TestCompletionResult } from "~/components/typer/Typer";
import { starThresholds, type StarThresholds } from "~/lib/learnThresholds";
import {
    gradeResult,
    ladderState,
    levelNumber,
    nextLevel,
    resumeLevel,
    type DifficultyName,
    type LevelProgress,
} from "~/lib/learnProgression";
import { useLearnProgress } from "~/hooks/useLearnProgress";

type Option = { label: string, value: number | string, isDisabled: boolean, stars?: number }
type LearnCompletion = {
    levelName: string,
    netWpm: number,
    accuracy: number,
    stars: 0 | 1 | 2 | 3,
    thresholds: StarThresholds,
    nextLevelName: string | null,
    saved: boolean,
}

function formatNumber(value: number, digits = 1) {
    return value.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    })
}

function ResultMetric(props: { label: string, value: string, target: string, passed: boolean, testId: string }) {
    const toneClass = props.passed ? "text-success" : "text-error"

    return (
        <div
            data-testid={props.testId}
            className={`rounded-lg border p-3 ${props.passed ? "border-success/40 bg-success/10" : "border-error/40 bg-error/10"}`}
        >
            <p className="text-xs font-semibold uppercase tracking-wide text-base-content/50">{props.label}</p>
            <p className={`mt-1 font-mono text-3xl font-bold ${toneClass}`}>{props.value}</p>
            <p className={`mt-1 text-xs font-semibold ${toneClass}`}>
                {props.passed ? "Passed" : "Need"} {props.target}
            </p>
        </div>
    )
}

function NeutralMetric(props: { label: string, value: string, note: string, testId: string }) {
    return (
        <div
            data-testid={props.testId}
            className="rounded-lg border border-base-content/10 bg-base-200/35 p-3"
        >
            <p className="text-xs font-semibold uppercase tracking-wide text-base-content/50">{props.label}</p>
            <p className="mt-1 font-mono text-3xl font-bold text-base-content">{props.value}</p>
            <p className="mt-1 text-xs font-semibold text-base-content/55">{props.note}</p>
        </div>
    )
}

function StarThreshold(props: { stars: 1 | 2 | 3, netWpm: number, className?: string }) {
    const label = `${props.stars} ${props.stars === 1 ? "star" : "stars"}: ${formatNumber(props.netWpm, 0)} net WPM`

    return (
        <span className={props.className} aria-label={label}>
            <span className="text-primary" aria-hidden="true">{"★".repeat(props.stars)}</span>
            <span aria-hidden="true"> {formatNumber(props.netWpm, 0)} net WPM</span>
        </span>
    )
}

function BestStars(props: { stars?: number, className?: string }) {
    if (!props.stars) return null
    const label = `Best ${props.stars} ${props.stars === 1 ? "star" : "stars"}`

    return (
        <span className={props.className} aria-label={label}>
            <span className="text-primary" aria-hidden="true">{"★".repeat(props.stars)}</span>
        </span>
    )
}

const Learn: NextPage = () => {
    const { status: sessionStatus } = useSession()
    const language = "english"
    const mode = TestModes.normal
    const subMode = TestSubModes.words
    const gramSource = TestGramSources.bigrams
    const gramScope = TestGramScopes.fifty
    const gramCombination = 1
    const gramRepetition = 0
    const gramWpmThreshold = 20
    const gramAccuracyThreshold = 100
    const [difficulty, setDifficulty] = useState<DifficultyName>("easy")
    const [level, setLevel] = useState<Level>(levels[0] as Level)
    const [currentKey, setCurrentKey] = useState<string>("")
    const [levelChanged, setLevelChanged] = useState<boolean>(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [restartSignal, setRestartSignal] = useState(0)
    const [completion, setCompletion] = useState<LearnCompletion | null>(null)
    const [typingFocused, setTypingFocused] = useState(false)
    const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())

    const learn = useLearnProgress(difficulty)
    const completedProgress = learn.completedProgress

    // fetch types
    const { isLoading: isLoadingTestType } = api.type.get.useQuery({ mode, subMode, language: language })

    // The modal belongs to the page; clear it when the ladder changes.
    useEffect(() => {
        setCompletion(null)
    }, [difficulty])

    const difficultyOptions = [
        { value: "easy", label: 'Easy' },
        { value: "medium", label: 'Medium' },
        { value: "hard", label: 'Hard' },
        { value: "extreme", label: 'Extreme' },
        { value: "insane", label: 'Insane' },
    ]
    const handleChangeDifficulty = (value: SingleValue<{ value: string, label: string }>) => {
        if (value) {
            setDifficulty(value.value as DifficultyName)
            setLevelChanged(false)
        }
    }

    const levelOptions: Option[] = useMemo(
        () => ladderState(completedProgress, difficulty).map((status) => ({
            value: status.level.name,
            label: status.level.name,
            isDisabled: !status.unlocked,
            stars: status.stars,
        })),
        [completedProgress, difficulty],
    )
    const progressSelectedLevel = useMemo(
        () => resumeLevel(completedProgress, difficulty),
        [completedProgress, difficulty],
    )

    const advanceToNextLevel = useCallback((freshProgress: LevelProgress[]) => {
        const next = nextLevel(freshProgress, level.name, difficulty)

        if (next) {
            setLevel(next)
            setLevelChanged(true)
            return
        }

        setLevelChanged(false)
    }, [level.name, difficulty])

    // Import the guest mirror, then advance from the current level (page state).
    const importDeviceProgress = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        const fresh = await learn.importDevice({ silent })
        if (fresh) advanceToNextLevel(fresh)
    }, [learn.importDevice, advanceToNextLevel])

    const handleChangeLevel = (value: SingleValue<Option>) => {
        if (value && !value.isDisabled) {
            const level = levels.find(level => level.name == value.value)
            if (level) setLevel(level)
            setCompletion(null)
            setLevelChanged(true)
        }
    }

    const onKeyChange = (key: string) => {
        setCurrentKey(key)
    }

    const showCompletion = useCallback((
        result: TestCompletionResult,
        options: { saved: boolean, nextProgress?: LevelProgress[] } = { saved: false },
    ) => {
        const levelName = result.levelName ?? level.name
        const completedLevel = levels.find(item => item.name == levelName) ?? level
        const { thresholds, stars } = gradeResult(completedLevel, difficulty, { netWpm: result.netWpm, accuracy: result.accuracy })

        setCompletion({
            levelName,
            netWpm: result.netWpm,
            accuracy: result.accuracy,
            stars,
            thresholds,
            nextLevelName: stars > 0 && options.nextProgress ? (nextLevel(options.nextProgress, levelName, difficulty)?.name ?? null) : null,
            saved: options.saved,
        })
    }, [difficulty, level])

    const onTestComplete = (result: TestCompletionResult) => {
        const levelName = result.levelName ?? level.name
        const completedLevel = levels.find(item => item.name == levelName) ?? level
        const { stars, entry } = gradeResult(completedLevel, difficulty, { netWpm: result.netWpm, accuracy: result.accuracy })

        window.gtag?.("event", "learn_lesson_done", { level: levelName, difficulty, stars })

        if (stars === 0) {
            showCompletion(result)
            return
        }

        void learn.save(entry).then(({ saved, nextProgress }) => {
            showCompletion(result, saved ? { saved: true, nextProgress } : { saved: false })
        })
    }

    const isLearnProgressLoading = sessionStatus === "loading" ||
        isLoadingTestType ||
        learn.isLoading
    const isLevelSelectionLoading = !levelChanged && level.name !== progressSelectedLevel.name

    useEffect(() => {
        if (!learn.canSilentImport) return

        void importDeviceProgress({ silent: true })
    }, [learn.canSilentImport, importDeviceProgress])

    useEffect(() => {
        if (completion || levelChanged || isLearnProgressLoading) return

        setLevel(progressSelectedLevel)
    }, [completion, isLearnProgressLoading, progressSelectedLevel, levelChanged])

    const criteria = starThresholds(levelNumber(level.name), difficulty)
    const isLearnContentLoading = isLearnProgressLoading || isLevelSelectionLoading
    const activeLevelProgress = completedProgress.find(progress => progress.levelName === level.name)
    const activeLevelStars = activeLevelProgress?.stars ?? 0

    const retryLevel = () => {
        setCompletion(null)
        setRestartSignal(signal => signal + 1)
    }

    const goToNextLevel = () => {
        if (!completion?.nextLevelName) return
        const nextLevel = levels.find(level => level.name == completion.nextLevelName)
        if (!nextLevel) return
        setLevel(nextLevel)
        setLevelChanged(true)
        setCompletion(null)
    }

    return (
        <div className={`flex flex-col w-full h-full items-center overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 ${fullscreen ? 'absolute top-0 left-0 w-full h-full bg-base-100 z-[500]' : "relative md:w-10/12 md:self-center md:px-0 md:pt-8 md:pb-8"}`}>
            <div className="flex w-full flex-col items-center justify-center gap-6 py-4 md:min-h-full md:gap-12 md:py-8">
                <div data-testid="learn-controls" className={typingFocusFadeClass(typingFocused, "flex w-full max-w-screen-xl flex-col items-center gap-3 md:gap-4")}>
                    {learn.shouldShowImportPrompt &&
                        <div className="flex w-full items-center justify-between gap-3 rounded bg-base-300 px-4 py-3 text-base-content">
                            <span className="text-sm font-semibold">Device progress is available for this difficulty.</span>
                            <button
                                className="btn btn-primary btn-sm"
                                type="button"
                                disabled={learn.isImporting}
                                onClick={() => void importDeviceProgress()}
                            >
                                Import progress
                            </button>
                        </div>
                    }

                    {sessionStatus === "unauthenticated" &&
                        <label className="btn btn-primary btn-sm mr-auto" htmlFor="signInModal">
                            Sign in to save level progress
                        </label>
                    }
                    <div className="flex w-full flex-wrap items-center gap-2">
                        <div className="flex w-full flex-wrap align-center gap-2 md:w-8/12 lg:w-6/12">
                            {isLearnContentLoading ?
                                <div className="flex h-10 items-center" role="status" aria-live="polite">
                                    <div className="h-8 w-8 animate-spin rounded-full border border-solid border-t-transparent text-primary"></div>
                                    <span className="sr-only">Loading learn controls</span>
                                </div>
                                :
                                <>
                                    <Select
                                        instanceId="difficultySelect"
                                        defaultValue={difficultyOptions[0]}
                                        options={difficultyOptions}
                                        value={difficultyOptions.find(option => option.value == difficulty)}
                                        onChange={handleChangeDifficulty}
                                        isSearchable={false}
                                        className="my-react-select-container min-w-[8rem]"
                                        classNamePrefix="my-react-select"
                                    />
                                    <Select
                                        instanceId="levelSelect"
                                        defaultValue={levelOptions[0]}
                                        options={levelOptions}
                                        value={levelOptions.find(option => option.value == level.name)}
                                        onChange={handleChangeLevel}
                                        formatOptionLabel={(option: Option) => {
                                            if (option.isDisabled) {
                                                return (
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0 truncate">{option.label}</div>
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2ZM6 20V10v10Z" /></svg>
                                                    </div>
                                                )
                                            }
                                            return (
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0 truncate">{option.label}</div>
                                                    <BestStars stars={option.stars} className="shrink-0 font-mono text-sm" />
                                                </div>
                                            )
                                        }}
                                        isSearchable={false}
                                        className="my-react-select-container min-w-[10rem]"
                                        classNamePrefix="my-react-select"
                                    />
                                </>
                            }
                        </div>
                    </div>
                    {!isLearnContentLoading &&
                        <>
                            <div className="flex w-full flex-wrap items-center gap-2 text-xs font-semibold text-base-content/60">
                                <StarThreshold stars={1} netWpm={criteria.oneStarNetWpm} className="rounded-full border border-base-content/15 px-2.5 py-1" />
                                <StarThreshold stars={2} netWpm={criteria.twoStarNetWpm} className="rounded-full border border-base-content/15 px-2.5 py-1" />
                                <StarThreshold stars={3} netWpm={criteria.threeStarNetWpm} className="rounded-full border border-base-content/15 px-2.5 py-1" />
                            </div>
                            <div className="hidden gap-2 basis-0 grow justify-start w-full flex-wrap md:flex">
                                <div className="flex justify-start items-center text-base md:text-lg"><strong>Target Keys:</strong></div>
                                <div className="flex flex-wrap justify-start items-center gap-1">{level.keys.split("").map((key, index) => {
                                    return (
                                        <kbd key={index} className="kbd kbd-md sm:kbd-lg">{key}</kbd>
                                    )
                                })}</div>
                            </div>
                        </>
                    }
                </div>
                <div className="flex flex-col w-full max-w-screen-xl items-center">
                    {isLearnContentLoading ?
                        <div className="flex min-h-[12rem] items-center" role="status" aria-live="polite">
                            <div className="h-8 w-8 animate-spin rounded-full border border-solid border-t-transparent text-primary"></div>
                            <span className="sr-only">Loading learn content</span>
                        </div>
                        :
                        <Typer
                            key={`${difficulty}-${level.name}`}
                            fullscreen={fullscreen}
                            setFullscreen={(full) => setFullscreen(full)}
                            language={language}
                            modalOpen={false}
                            mode={mode}
                            subMode={subMode}
                            gramSource={gramSource}
                            gramScope={gramScope}
                            gramCombination={gramCombination}
                            gramRepetition={gramRepetition}
                            gramWpmThreshold={gramWpmThreshold}
                            gramAccuracyThreshold={gramAccuracyThreshold}
                            count={level.count}
                            level={level}
                            levelRequirements={{ wpm: criteria.oneStarNetWpm, accuracy: 0 }}
                            pacerWpm={level.kind === "boss" ? criteria.oneStarNetWpm : undefined}
                            onKeyChange={onKeyChange}
                            onTestComplete={onTestComplete}
                            onTypingFocusChange={setTypingFocused}
                            restartSignal={restartSignal}
                            showStats={true}
                            showConfig={false}
                            charAttemptsRef={charAttemptsRef}
                        />
                    }
                    {!isLearnContentLoading &&
                        <div data-testid="learn-keyboard-wrap">
                            <Keyboard mode={mode} currentKey={currentKey} charAttemptsRef={charAttemptsRef} highlightKeys={level.keys.split("")} />
                        </div>
                    }
                </div>
                {completion &&
                    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-base-300/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="learn-complete-title">
                        <div data-testid="learn-complete-popover" className="w-full max-w-md rounded-xl border border-primary/40 bg-base-100 p-6 text-base-content shadow-2xl shadow-primary/20">
                            <div className="flex flex-col items-center text-center">
                                <p className="font-mono text-sm font-bold uppercase tracking-widest text-primary">
                                    {completion.stars > 0 ? "Level complete" : "Try again"}
                                </p>
                                <h2 id="learn-complete-title" className="mt-2 font-mono text-3xl font-bold">
                                    {completion.stars > 0 ? `${completion.levelName} clear!` : `${completion.levelName} not cleared yet`}
                                </h2>
                                <div className="mt-4 flex gap-2" aria-label={`${completion.stars} stars`}>
                                    {[1, 2, 3].map((star) => (
                                        <span
                                            key={star}
                                            className={`font-mono text-5xl leading-none ${completion.stars >= star ? "text-primary" : "text-base-content/20"}`}
                                            aria-hidden="true"
                                        >
                                            ★
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-4 grid w-full grid-cols-2 gap-3">
                                    <ResultMetric
                                        label="Net WPM"
                                        value={formatNumber(completion.netWpm, 1)}
                                        target={`${formatNumber(completion.thresholds.oneStarNetWpm, 0)} net WPM`}
                                        passed={completion.netWpm >= completion.thresholds.oneStarNetWpm}
                                        testId="learn-net-result"
                                    />
                                    <NeutralMetric
                                        label="Accuracy"
                                        value={`${formatNumber(completion.accuracy, 1)}%`}
                                        note="Included in net WPM"
                                        testId="learn-accuracy-result"
                                    />
                                </div>
                                <p className="mt-4 text-sm text-base-content/65">
                                    {completion.stars > 0
                                        ? completion.saved
                                            ? "Best result saved."
                                            : "Clear earned, but saving failed."
                                        : `Need ${formatNumber(completion.thresholds.oneStarNetWpm, 0)} net WPM.`}
                                </p>
                                <div className="mt-4 grid w-full gap-2 rounded-lg border border-base-content/10 bg-base-200/35 p-3 text-left text-xs font-semibold text-base-content/60">
                                    <StarThreshold stars={1} netWpm={completion.thresholds.oneStarNetWpm} />
                                    <StarThreshold stars={2} netWpm={completion.thresholds.twoStarNetWpm} />
                                    <StarThreshold stars={3} netWpm={completion.thresholds.threeStarNetWpm} />
                                </div>
                                <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        className="inline-flex flex-1 items-center justify-center rounded-md border border-base-content/15 bg-base-200 px-4 py-2 text-sm font-semibold transition hover:bg-base-300"
                                        onClick={retryLevel}
                                    >
                                        Try again
                                    </button>
                                    {completion.stars > 0 &&
                                        <button
                                            type="button"
                                            disabled={!completion.nextLevelName}
                                            className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85"
                                            onClick={goToNextLevel}
                                        >
                                            Next level
                                        </button>
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                }
            </div>
        </div>
    );
};

export default Learn;
