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
import { useDispatch } from "react-redux";
import { addAlert } from "~/state/alert/alertSlice";
import { useSession } from "next-auth/react";
import type { TestCompletionResult } from "~/components/typer/Typer";

type Option = { label: string, value: number | string, isDisabled: boolean }
type DifficultyName = "easy" | "medium" | "hard"
type LearnProgress = { options: string, speed: number, accuracy: number }

const getStorageKey = (difficulty: DifficultyName) => `typecafe.learnProgress.${difficulty}`

const Learn: NextPage = () => {
    const dispatch = useDispatch()
    const { data: sessionData, status: sessionStatus } = useSession()
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
    const [localProgress, setLocalProgress] = useState<LearnProgress[]>([])
    const [isLocalProgressLoaded, setIsLocalProgressLoaded] = useState(false)
    const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())

    // fetch types
    const { isLoading: isLoadingTestType } = api.type.get.useQuery({ mode, subMode, language: language })
    const {
        data: savedProgress = [],
        refetch: refetchSavedProgress,
        isLoading: isLoadingSavedProgress,
    } = api.learnProgress.getByDifficulty.useQuery({ difficulty }, { enabled: !!sessionData?.user })
    const importLearnProgress = api.learnProgress.batchImport.useMutation()
    const completeLearnProgress = api.learnProgress.complete.useMutation()

    useEffect(() => {
        setIsLocalProgressLoaded(false)
        const storedProgress = window.localStorage.getItem(getStorageKey(difficulty))
        if (!storedProgress) {
            setLocalProgress([])
            setIsLocalProgressLoaded(true)
            return
        }

        try {
            setLocalProgress(JSON.parse(storedProgress) as LearnProgress[])
        } catch {
            setLocalProgress([])
        }
        setIsLocalProgressLoaded(true)
    }, [difficulty])

    const difficultyOptions = [
        { value: "easy", label: 'Easy' },
        { value: "medium", label: 'Medium' },
        { value: "hard", label: 'Hard' },
    ]
    const handleChangeDifficulty = (value: SingleValue<{ value: string, label: string }>) => {
        if (value) {
            setDifficulty(value.value as DifficultyName)
            setLevelChanged(false)
        }
    }

    const getLevelOptions = useCallback((completedTests: LearnProgress[]): Option[] => levels.map((level: Level, index: number, array: Level[]) => {
        if (level.name == "Level 1") return { value: level.name, label: level.name, isDisabled: false } as Option

        const levelTest = completedTests?.find(test => test.options == array[index - 1]?.name)
        const previousLevel = array[index - 1]
        const requirements = previousLevel?.[difficulty]

        if (levelTest && requirements && levelTest.speed >= requirements.wpm && levelTest.accuracy >= requirements.accuracy) {
            return { value: level.name, label: level.name, isDisabled: false } as Option
        }

        return { value: level.name, label: level.name, isDisabled: true } as Option
    }), [difficulty])

    const persistedProgress: LearnProgress[] = useMemo(() => [
        ...savedProgress.map((progress: LearnProgress) => ({
            options: progress.options,
            speed: progress.speed,
            accuracy: progress.accuracy,
        })),
    ], [savedProgress])
    const completedProgress: LearnProgress[] = sessionData?.user ? persistedProgress : localProgress
    const levelOptions: Option[] = useMemo(() => getLevelOptions(completedProgress), [completedProgress, getLevelOptions])
    const hasDeviceProgress = localProgress.length > 0
    const shouldShowImportPrompt = !!sessionData?.user && hasDeviceProgress && persistedProgress.length > 0
    const progressSelectedLevel = useMemo(() => {
        const firstLocked = levelOptions.findIndex(levelOption => levelOption.isDisabled)
        const levelIndex = firstLocked === -1 ? levels.length - 1 : firstLocked <= 0 ? 0 : firstLocked - 1

        return levels[levelIndex] as Level
    }, [levelOptions])

    const advanceToNextLevel = useCallback((updatedLevelOptions: Option[]) => {
        const currentLevelIndex = levels.findIndex(option => option.name == level.name)
        const nextLevel = levels[currentLevelIndex + 1]
        const nextLevelOption = nextLevel ? updatedLevelOptions.find(option => option.value == nextLevel.name) : undefined

        if (nextLevel && nextLevelOption && !nextLevelOption.isDisabled) {
            setLevel(nextLevel)
            setLevelChanged(true)
            return
        }

        setLevelChanged(false)
    }, [level.name])

    const importDeviceProgress = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        if (!sessionData?.user || localProgress.length === 0 || importLearnProgress.isPending) return

        try {
            await importLearnProgress.mutateAsync({
                difficulty,
                progress: localProgress,
            })
            window.localStorage.removeItem(getStorageKey(difficulty))
            setLocalProgress([])
            const savedResult = await refetchSavedProgress()
            advanceToNextLevel(getLevelOptions([
                ...(savedResult.data ?? []).map((progress: LearnProgress) => ({
                    options: progress.options,
                    speed: progress.speed,
                    accuracy: progress.accuracy,
                })),
            ]))
            if (!silent) {
                dispatch(addAlert({ message: "Device progress imported to your account.", type: "success" }))
            }
        } catch (error) {
            console.log(error)
            dispatch(addAlert({ message: "Could not import device progress.", type: "error" }))
        }
    }, [
        difficulty,
        dispatch,
        advanceToNextLevel,
        getLevelOptions,
        importLearnProgress,
        localProgress,
        refetchSavedProgress,
        sessionData?.user,
    ])

    const handleChangeLevel = (value: SingleValue<Option>) => {
        if (value && !value.isDisabled) {
            const level = levels.find(level => level.name == value.value)
            if (level) setLevel(level)
            setLevelChanged(true)
        }
    }

    const onKeyChange = (key: string) => {
        setCurrentKey(key)
    }

    const onTestComplete = (result: TestCompletionResult) => {
        if (!sessionData?.user) {
            const levelName = result.levelName ?? level.name
            const nextProgress = [
                ...localProgress.filter(progress => progress.options !== levelName),
                { options: levelName, speed: result.speed, accuracy: result.accuracy },
            ]

            window.localStorage.setItem(getStorageKey(difficulty), JSON.stringify(nextProgress))
            setLocalProgress(nextProgress)
            advanceToNextLevel(getLevelOptions(nextProgress))
            dispatch(addAlert({
                message: "Progress saved on this device. Sign in to keep it.",
                type: "warning",
            }))
            return
        }

        completeLearnProgress.mutateAsync({
            difficulty,
            progress: {
                options: result.levelName ?? level.name,
                speed: result.speed,
                accuracy: result.accuracy,
            },
        }).then(() => refetchSavedProgress()).then((savedResult) => {
            advanceToNextLevel(getLevelOptions(
                [
                    ...(savedResult.data ?? []).map((progress: LearnProgress) => ({
                        options: progress.options,
                        speed: progress.speed,
                        accuracy: progress.accuracy,
                    })),
                ],
            ))
        }).catch((error) => {
            console.log(error)
            dispatch(addAlert({ message: "Could not refresh level progress.", type: "error" }))
        })
    }

    const isLearnProgressLoading = sessionStatus === "loading" ||
        isLoadingTestType ||
        !isLocalProgressLoaded ||
        importLearnProgress.isPending ||
        completeLearnProgress.isPending ||
        (!!sessionData?.user && isLoadingSavedProgress)
    const isLevelSelectionLoading = !levelChanged && level.name !== progressSelectedLevel.name

    useEffect(() => {
        if (!sessionData?.user || isLoadingSavedProgress || !hasDeviceProgress || persistedProgress.length > 0) return

        void importDeviceProgress({ silent: true })
    }, [
        hasDeviceProgress,
        importDeviceProgress,
        isLoadingSavedProgress,
        persistedProgress.length,
        sessionData?.user,
    ])
    
    useEffect(() => {
        if (levelChanged || isLearnProgressLoading) return

        setLevel(progressSelectedLevel)
    }, [isLearnProgressLoading, progressSelectedLevel, levelChanged])

    const requirements = level[difficulty]
    const isLearnContentLoading = isLearnProgressLoading || isLevelSelectionLoading

    return (
        <div className={`flex flex-col w-full h-full items-center justify-start overflow-y-auto overflow-x-hidden px-4 pb-24 pt-4 md:w-10/12 md:justify-center md:overflow-visible md:px-0 md:pb-0 md:pt-0 ${fullscreen ? 'absolute top-0 left-0 w-full h-full bg-base-100 z-[500]' : "relative"}`}>
            <div className="relative top-0 flex w-full max-w-screen-xl flex-col items-center gap-3 py-2 md:absolute md:gap-4 md:py-12">
                {sessionStatus === "unauthenticated" &&
                    <div className="flex w-full justify-start">
                        <label className="btn btn-primary btn-sm" htmlFor="signInModal">
                            Sign in to save level progress
                        </label>
                    </div>
                }
                {shouldShowImportPrompt &&
                    <div className="flex w-full items-center justify-between gap-3 rounded bg-base-300 px-4 py-3 text-base-content">
                        <span className="text-sm font-semibold">Device progress is available for this difficulty.</span>
                        <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            disabled={importLearnProgress.isPending}
                            onClick={() => void importDeviceProgress()}
                        >
                            Import progress
                        </button>
                    </div>
                }
                <div className="flex w-full">
                    <div className="flex w-full flex-wrap gap-2 md:w-8/12 lg:w-6/12">
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
                                                <div className="flex justify-between">
                                                    <div>{option.label}</div>
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2ZM6 20V10v10Z" /></svg>
                                                </div>
                                            )
                                        }
                                        return <div>{option.label}</div>
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
                    <div className="flex w-full basis-0 grow flex-wrap justify-start items-center gap-x-4 gap-y-1">
                        <div className="text-base md:text-lg"><strong>Required Speed: {requirements.wpm}wpm</strong></div>
                        <div className="text-base md:text-lg"><strong>Required Accuracy: {requirements.accuracy}%</strong></div>
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
            <div className="flex w-full max-w-screen-xl justify-center px-0">
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
                        levelRequirements={requirements}
                        onKeyChange={onKeyChange}
                        onTestComplete={onTestComplete}
                        showStats={true}
                        showConfig={false}
                        charAttemptsRef={charAttemptsRef}
                    />
                }
            </div>
            {!isLearnContentLoading &&
                <Keyboard mode={mode} currentKey={currentKey} charAttemptsRef={charAttemptsRef} highlightKeys={level.keys.split("")} />
            }
        </div>
    );
};

export default Learn;
