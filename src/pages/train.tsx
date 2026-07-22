import { type NextPage } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Typer } from "~/components/typer/Typer";
import { TestModes } from "~/components/typer/types";
import type { Level } from "~/components/typer/train/levels";
import { levelsFor, reachableAccentsFor, withLanguageAccents } from "~/components/typer/train/levels";
import { accentsFor, ensureLanguageLoaded } from "~/components/typer/utils";
import { KIND_META } from "~/components/typer/train/kindMeta";
import { api } from "~/utils/api";
import { useLanguage } from "~/hooks/useLanguage";
import { useLayout } from "~/hooks/useLayout";
import { statsPoolFor } from "~/lib/keyboardLayout";
import { Keyboard } from "~/components/typer/Keyboard";
import { typingFocusFadeClass } from "~/components/typer/typingFocus";
import { useSession } from "next-auth/react";
import type { TestCompletionResult } from "~/components/typer/Typer";
import { DIFFICULTIES, starThresholds, type StarThresholds } from "~/lib/trainThresholds";
import {
    gradeLevel,
    ladderState,
    levelNumber,
    mergeProgress,
    nextLevel,
    resumeLevel,
    type DifficultyName,
    type LevelProgress,
    type LevelStatus,
} from "~/lib/trainProgression";
import { useTrainProgress } from "~/hooks/useTrainProgress";

// The map is the hub (the landing view); a level is the leaf you zoom into.
type TrainView = "map" | "level"

type TrainCompletion = {
    levelName: string,
    netWpm: number,
    accuracy: number,
    stars: 0 | 1 | 2 | 3,
    thresholds: StarThresholds,
    kind: Level["kind"],
    pacerCaught: boolean,
    isNoMiss: boolean,
    nextLevelName: string | null,
    // The popover renders instantly (eager result); the background progress
    // save patches this from "saving" when it settles.
    saved: "saving" | "saved" | "failed",
}

// Why a fail popup says what it does - the specific cause, not just the WPM gap.
function failMessage(c: TrainCompletion): string {
    if (c.pacerCaught) return "The pacer caught you - reach the end before the line does to beat the boss."
    if (c.kind === "noMiss" && c.accuracy < 100) return "One miss ends a no-miss level - stay perfect."
    return `Need ${formatNumber(c.thresholds.oneStarNetWpm, 0)} net WPM to clear - you hit ${formatNumber(c.netWpm, 0)}.`
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

function LockIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={props.className ?? "h-3 w-3"}>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
    )
}

// Three stars: earned ones accent-colored, the rest ghosted.
function Stars(props: { earned: number, ghostClass?: string, className?: string }) {
    return (
        <span className={props.className} aria-label={`${props.earned} of 3 stars`}>
            {[1, 2, 3].map((star) => (
                <span key={star} aria-hidden="true" className={star <= props.earned ? "text-primary" : props.ghostClass ?? "text-base-content/20"}>★</span>
            ))}
        </span>
    )
}

// All three thresholds on hover - the caption line only carries the next one.
function thresholdsTitle(levelNum: number, difficulty: DifficultyName): string {
    const t = starThresholds(levelNum, difficulty)
    return `★ ${t.oneStarNetWpm} · ★★ ${t.twoStarNetWpm} · ★★★ ${t.threeStarNetWpm} net WPM`
}

function TierTabs(props: { difficulty: DifficultyName, onSelect: (difficulty: DifficultyName) => void }) {
    return (
        <div data-testid="train-tiers" aria-label="Difficulty tier" className="flex flex-wrap justify-center gap-1.5">
            {DIFFICULTIES.map((tier) => (
                <button
                    key={tier}
                    type="button"
                    aria-pressed={tier === props.difficulty}
                    onClick={() => props.onSelect(tier)}
                    className={`rounded-full border px-3.5 py-1 text-sm capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${tier === props.difficulty ? "border-primary bg-primary font-medium text-primary-content" : "border-base-content/15 text-base-content/60 hover:text-base-content"}`}
                >
                    {tier}
                </button>
            ))}
        </div>
    )
}

const Train: NextPage = () => {
    const { status: sessionStatus } = useSession()
    // Training text follows the global language; the ladder progress stays global
    // (TrainProgress is keyed by difficulty/options, not language).
    const [language] = useLanguage()
    const [activeLayout] = useLayout()
    // The language's accent letters that the active layout can type extend the
    // full-alphabet stretch, so Train never generates a char absent from its board.
    const [accents, setAccents] = useState<string[]>([])
    useEffect(() => {
        let active = true
        setAccents([])
        void ensureLanguageLoaded(language).then(() => { if (active) setAccents(reachableAccentsFor(accentsFor(language), activeLayout)) })
        return () => { active = false }
    }, [language, activeLayout])
    const mode = TestModes.normal
    const [difficulty, setDifficulty] = useState<DifficultyName>("easy")
    const [view, setView] = useState<TrainView>("map")
    // The ladder follows the active layout (docs/features/keyboard-layouts.md
    // slice 7): same names/counts/kinds everywhere, keys from keyStagesFor.
    const trainLevels = useMemo(() => levelsFor(activeLayout), [activeLayout])
    const [level, setLevel] = useState<Level>(trainLevels[0] as Level)
    // A layout switch re-points the selected level at the same rung of the new
    // layout's ladder (names are the identity; progress is untouched).
    useEffect(() => {
        setLevel((current) => trainLevels.find((item) => item.name === current.name) ?? trainLevels[0]!)
    }, [trainLevels])
    // Speed-round levels run as short timed tests; every other kind is a words run.
    const subMode = level.subMode
    const [levelChanged, setLevelChanged] = useState<boolean>(false)
    const [restartSignal, setRestartSignal] = useState(0)
    const [completion, setCompletion] = useState<TrainCompletion | null>(null)
    // Eager results are followed by a persisted upgrade for signed-in users.
    // This attempt-local guard keeps that pair to one completion popover.
    const completionHandledRef = useRef(false)
    const [typingFocused, setTypingFocused] = useState(false)
    const charAttemptsRef = useRef<Map<string, { attempts: number, correct: number }>>(new Map())

    const train = useTrainProgress(difficulty, statsPoolFor(activeLayout))
    const { completedProgress, importDevice, save } = train

    // fetch types
    const { isLoading: isLoadingTestType } = api.type.get.useQuery({ mode, subMode, language: language })

    // The modal belongs to the page; clear it when the ladder changes.
    useEffect(() => {
        setCompletion(null)
    }, [difficulty])

    const ladder: LevelStatus[] = useMemo(
        () => ladderState(completedProgress, difficulty, trainLevels),
        [completedProgress, difficulty, trainLevels],
    )
    const progressSelectedLevel = useMemo(
        () => resumeLevel(completedProgress, difficulty, trainLevels),
        [completedProgress, difficulty, trainLevels],
    )

    const advanceToNextLevel = useCallback((freshProgress: LevelProgress[]) => {
        const next = nextLevel(freshProgress, level.name, difficulty, trainLevels)

        if (next) {
            setLevel(next)
            setLevelChanged(true)
            return
        }

        setLevelChanged(false)
    }, [level.name, difficulty, trainLevels])

    // Import the guest mirror, then advance from the current level (page state).
    const importDeviceProgress = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        const fresh = await importDevice({ silent })
        if (fresh) advanceToNextLevel(fresh)
    }, [importDevice, advanceToNextLevel])

    const enterLevel = (next: Level) => {
        setLevel(next)
        setLevelChanged(true)
        setCompletion(null)
        completionHandledRef.current = false
        setView("level")
    }

    // Same tier again zooms back out to the map; a new tier lands on its map.
    const handleTierSelect = (tier: DifficultyName) => {
        if (tier === difficulty) {
            setView("map")
            return
        }
        completionHandledRef.current = false
        setDifficulty(tier)
        setLevelChanged(false)
        setView("map")
    }

    const showCompletion = useCallback((
        result: TestCompletionResult,
        options: { saved: TrainCompletion["saved"], nextProgress?: LevelProgress[] } = { saved: "failed" },
    ) => {
        const levelName = result.levelName ?? level.name
        const completedLevel = trainLevels.find(item => item.name == levelName) ?? level
        const { thresholds, stars: gradedStars } = gradeLevel(completedLevel, difficulty, { netWpm: result.netWpm, accuracy: result.accuracy })
        // An overtake on a boss is a loss regardless of the WPM the typed span hit.
        const stars = result.pacerCaught ? 0 : gradedStars

        setCompletion({
            levelName,
            netWpm: result.netWpm,
            accuracy: result.accuracy,
            stars,
            thresholds,
            kind: completedLevel.kind,
            pacerCaught: !!result.pacerCaught,
            isNoMiss: completedLevel.kind === "noMiss",
            nextLevelName: stars > 0 && options.nextProgress ? (nextLevel(options.nextProgress, levelName, difficulty, trainLevels)?.name ?? null) : null,
            saved: options.saved,
        })
    }, [difficulty, level, trainLevels])

    const onTestComplete = (result: TestCompletionResult) => {
        if (completionHandledRef.current) return
        completionHandledRef.current = true

        const levelName = result.levelName ?? level.name
        const completedLevel = trainLevels.find(item => item.name == levelName) ?? level
        const { stars: gradedStars, entry } = gradeLevel(completedLevel, difficulty, { netWpm: result.netWpm, accuracy: result.accuracy })
        // An overtake on a boss is a loss regardless of the WPM the typed span hit.
        const stars = result.pacerCaught ? 0 : gradedStars

        window.gtag?.("event", "train_lesson_done", { level: levelName, difficulty, stars })

        if (stars === 0) {
            showCompletion(result)
            return
        }

        // Show the popover now: stars and the next-level unlock are computable
        // locally (the same merge save() uses). The save settles in the
        // background and patches the status line - and the unlock, should the
        // refreshed server progress ever disagree with the local merge.
        showCompletion(result, { saved: "saving", nextProgress: mergeProgress(completedProgress, entry) })
        void save(entry).then(({ saved, nextProgress }) => {
            setCompletion((current) => {
                if (!current || current.levelName !== levelName) return current
                return {
                    ...current,
                    saved: saved ? "saved" : "failed",
                    nextLevelName: current.stars > 0
                        ? (nextLevel(nextProgress, levelName, difficulty, trainLevels)?.name ?? current.nextLevelName)
                        : null,
                }
            })
        })
    }

    const isTrainProgressLoading = sessionStatus === "loading" ||
        isLoadingTestType ||
        train.isLoading
    const isLevelSelectionLoading = !levelChanged && level.name !== progressSelectedLevel.name

    useEffect(() => {
        if (!train.canSilentImport) return

        void importDeviceProgress({ silent: true })
    }, [train.canSilentImport, importDeviceProgress])

    useEffect(() => {
        if (completion || levelChanged || isTrainProgressLoading) return

        setLevel(progressSelectedLevel)
    }, [completion, isTrainProgressLoading, progressSelectedLevel, levelChanged])

    // What the Typer runs: the selected level, keys extended with the language's
    // accents on the full-alphabet stretch. Name/count/kind are untouched, so
    // grading, saves and the map all keep working off `level`.
    const typerLevel = useMemo(() => withLanguageAccents(level, accents), [level, accents])
    const criteria = starThresholds(levelNumber(level.name), difficulty)
    const isTrainContentLoading = isTrainProgressLoading || isLevelSelectionLoading
    const activeLevelProgress = completedProgress.find(progress => progress.levelName === level.name)
    const activeLevelStars = activeLevelProgress?.stars ?? 0

    const retryLevel = () => {
        setCompletion(null)
        completionHandledRef.current = false
        setRestartSignal(signal => signal + 1)
    }

    const goToNextLevel = () => {
        if (!completion?.nextLevelName) return
        const nextLevel = trainLevels.find(level => level.name == completion.nextLevelName)
        if (!nextLevel) return
        setLevel(nextLevel)
        setLevelChanged(true)
        setCompletion(null)
        completionHandledRef.current = false
    }

    // While the completion popover is open, the Tab+Space/Enter chord drives its
    // primary action - Next level when cleared (no-op if there's none), else Try
    // again - instead of restarting the test underneath. Listens on window in the
    // capture phase so it fires before (and stops) the Typer's document-level
    // restart shortcut, which React mounts first as a child effect.
    useEffect(() => {
        if (!completion) return

        const keys: Record<string, boolean> = {}
        let firing = false
        const isChord = () => keys.Tab && (keys[" "] || keys.Space || keys.Spacebar || keys.Enter)

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return
            keys[e.key] = true
            if (keys.Tab) {
                e.preventDefault()
                e.stopPropagation()
            }
            if (isChord() && !firing) {
                firing = true
                if (completion.stars > 0) goToNextLevel()
                else retryLevel()
            }
        }
        const onKeyUp = (e: KeyboardEvent) => {
            keys[e.key] = false
            if (!isChord()) firing = false
        }

        window.addEventListener("keydown", onKeyDown, true)
        window.addEventListener("keyup", onKeyUp, true)
        return () => {
            window.removeEventListener("keydown", onKeyDown, true)
            window.removeEventListener("keyup", onKeyUp, true)
        }
        // goToNextLevel/retryLevel read the current `completion` closure, so
        // re-bind whenever it changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [completion])

    // Tier totals for the map header: levels with at least one star are done.
    const doneCount = ladder.filter((status) => status.stars > 0).length
    const starCount = ladder.reduce((sum, status) => sum + status.stars, 0)
    const resumeNum = levelNumber(progressSelectedLevel.name)
    const currentNum = levelNumber(level.name)

    // Level rail: a five-wide window around the current level, then the summit.
    const railStart = Math.min(Math.max(currentNum - 1, 1), trainLevels.length - 4)
    const railItems = ladder.slice(railStart - 1, railStart + 4)
    const railShowsTail = railStart + 4 < trainLevels.length

    // The caption line carries only the next milestone; all three thresholds live
    // on the hover title and the results popover.
    const nextStarTarget = activeLevelStars >= 3
        ? null
        : [criteria.oneStarNetWpm, criteria.twoStarNetWpm, criteria.threeStarNetWpm][activeLevelStars]

    const banners = (
        <>
            {train.shouldShowImportPrompt &&
                <div className="mb-3 flex w-full max-w-2xl items-center justify-between gap-3 rounded bg-base-300 px-4 py-3 text-base-content">
                    <span className="text-sm font-semibold">Device progress is available for this difficulty.</span>
                    <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        disabled={train.isImporting}
                        onClick={() => void importDeviceProgress()}
                    >
                        Import progress
                    </button>
                </div>
            }
            {sessionStatus === "unauthenticated" &&
                <div className="mb-3 flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
                    <span className="text-sm text-base-content/80">Level progress lives on this device only.</span>
                    <label htmlFor="signInModal" className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85">
                        Sign in to save level progress
                    </label>
                </div>
            }
        </>
    )

    const spinner = (label: string) => (
        <div className="flex min-h-[12rem] items-center" role="status" aria-live="polite">
            <div className="h-8 w-8 animate-spin rounded-full border border-solid border-t-transparent text-primary"></div>
            <span className="sr-only">{label}</span>
        </div>
    )

    // A map cell. Rows fade with distance past the current row so a hundred
    // levels never reads as a wall. Locked cells show a padlock, except the
    // block-of-ten milestones which keep a dim number for orientation.
    const mapCell = (status: LevelStatus, index: number) => {
        const num = index + 1
        const row = Math.floor(index / 10)
        const resumeRow = Math.floor((resumeNum - 1) / 10)
        const fade = row <= resumeRow ? "" : row === resumeRow + 1 ? "opacity-70" : "opacity-40"
        const isNow = num === resumeNum
        const done = status.stars > 0

        const surface = isNow
            ? "border-[1.5px] border-primary bg-primary/10"
            : done
                ? "border-base-content/15 bg-base-200"
                : status.unlocked
                    ? "border-base-content/10 bg-base-200/60"
                    : "border-base-content/5 bg-base-200/40"

        return (
            <button
                key={num}
                type="button"
                disabled={!status.unlocked}
                onClick={() => enterLevel(status.level)}
                title={thresholdsTitle(num, difficulty)}
                aria-label={`${status.level.name}${status.unlocked ? "" : " (locked)"}`}
                className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border ${surface} ${fade} ${status.unlocked ? "cursor-pointer transition-colors hover:border-primary/50" : "cursor-not-allowed"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary`}
            >
                {status.unlocked || num % 10 === 0
                    ? <span className={`text-sm ${isNow ? "font-semibold text-primary" : done ? "font-medium text-base-content" : status.unlocked ? "text-base-content/70" : "text-base-content/25"}`}>{num}</span>
                    : <LockIcon className="h-3 w-3 text-base-content/30" />
                }
                {status.unlocked && <Stars earned={status.stars} className="text-[10px] leading-none tracking-wider" />}
            </button>
        )
    }

    // A level-rail box: the current one zooms back out to the map; any other
    // unlocked one switches to that level.
    const railBox = (status: LevelStatus) => {
        const num = levelNumber(status.level.name)
        const isNow = num === currentNum

        return (
            <div key={num} className="flex flex-col items-center gap-1">
                <button
                    type="button"
                    disabled={!status.unlocked}
                    onClick={() => isNow ? setView("map") : enterLevel(status.level)}
                    title={isNow ? `${thresholdsTitle(num, difficulty)} - click to open the level map` : thresholdsTitle(num, difficulty)}
                    aria-label={isNow ? `${status.level.name} - open level map` : `${status.level.name}${status.unlocked ? "" : " (locked)"}`}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${isNow ? "border-[1.5px] border-primary bg-primary/10 font-semibold text-primary" : status.unlocked ? "cursor-pointer border-base-content/15 bg-base-200 text-base-content/80 hover:border-primary/50" : "cursor-not-allowed border-base-content/5 bg-base-200/40 text-base-content/30"} ${num > 99 ? "text-xs" : ""}`}
                >
                    {status.unlocked ? num : <LockIcon className="h-3 w-3 text-base-content/30" />}
                </button>
                <Stars earned={status.stars} ghostClass={status.unlocked ? "text-base-content/20" : "text-base-content/10"} className="text-[10px] leading-none tracking-wider" />
            </div>
        )
    }

    return (
        <div className="relative flex h-full w-full flex-col items-center overflow-y-auto overflow-x-hidden max-w-screen-xl px-4 pb-4 pt-4 md:self-center md:px-0 md:pb-8 md:pt-8">
            <div className="flex w-full flex-col items-center justify-center gap-6 py-4 md:min-h-full md:py-8">

                {view === "map" &&
                    <div data-testid="train-map" className="flex w-full max-w-2xl flex-col gap-4">
                        {banners}
                        <TierTabs difficulty={difficulty} onSelect={handleTierSelect} />
                        {isTrainProgressLoading ?
                            <div className="flex justify-center">{spinner("Loading level map")}</div>
                            :
                            <>
                                <div className="mt-2 flex items-end justify-between gap-3">
                                    <div>
                                        <h1 className="text-lg font-medium capitalize">{difficulty} tier</h1>
                                        <p className="mt-0.5 text-sm text-base-content/60">
                                            {doneCount} of {trainLevels.length} levels · <span className="text-primary">{starCount}</span> of {trainLevels.length * 3} stars
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        data-testid="train-continue"
                                        onClick={() => enterLevel(progressSelectedLevel)}
                                        className="shrink-0 cursor-pointer rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    >
                                        Continue {progressSelectedLevel.name}
                                    </button>
                                </div>
                                <div className="h-[3px] overflow-hidden rounded-sm bg-base-content/10">
                                    <div className="h-full bg-primary" style={{ width: `${(doneCount / trainLevels.length) * 100}%` }} />
                                </div>
                                <div data-testid="train-map-grid" className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                                    {ladder.map(mapCell)}
                                </div>
                            </>
                        }
                    </div>
                }

                {view === "level" &&
                    <>
                        <div data-testid="train-controls" className={typingFocusFadeClass(typingFocused, "flex w-full max-w-screen-xl flex-col items-center gap-3 md:gap-4")}>
                            {banners}
                            <TierTabs difficulty={difficulty} onSelect={handleTierSelect} />
                            {isTrainContentLoading ?
                                <div className="flex h-10 items-center" role="status" aria-live="polite">
                                    <div className="h-8 w-8 animate-spin rounded-full border border-solid border-t-transparent text-primary"></div>
                                    <span className="sr-only">Loading train controls</span>
                                </div>
                                :
                                <>
                                    <div data-testid="train-rail" className="flex items-start justify-center gap-2">
                                        {railItems.map(railBox)}
                                        {railShowsTail &&
                                            <>
                                                <div className="flex h-9 w-4 items-center justify-center text-xs text-base-content/40" aria-hidden="true">…</div>
                                                {railBox(ladder[trainLevels.length - 1]!)}
                                            </>
                                        }
                                    </div>
                                    <p data-testid="train-rail-caption" className="text-center text-sm text-base-content/60">
                                        {level.name} ·{" "}
                                        <span
                                            data-testid="train-level-kind"
                                            data-tip={KIND_META[level.kind].blurb}
                                            aria-label={`How ${KIND_META[level.kind].label} levels work: ${KIND_META[level.kind].blurb}`}
                                            className="tooltip tooltip-bottom cursor-help border-b border-dotted border-base-content/30 before:text-base-content"
                                        >
                                            {KIND_META[level.kind].label}
                                        </span>
                                        {" "}·{" "}
                                        {nextStarTarget != null
                                            ? <>next star at <span className="text-primary">{formatNumber(nextStarTarget, 0)} net wpm</span></>
                                            : <span className="text-primary">all stars earned ★★★</span>
                                        }
                                    </p>
                                </>
                            }
                        </div>
                        <div className="flex w-full max-w-screen-xl flex-col items-center">
                            {isTrainContentLoading ?
                                spinner("Loading train content")
                                :
                                <Typer
                                    key={`${difficulty}-${level.name}`}
                                    language={language}
                                    modalOpen={false}
                                    mode={mode}
                                    subMode={subMode}
                                    count={level.count}
                                    level={typerLevel}
                                    levelRequirements={{ wpm: criteria.oneStarNetWpm, accuracy: 0 }}
                                    pacerWpm={level.kind === "boss" ? criteria.oneStarNetWpm : undefined}
                                    failOnMiss={level.kind === "noMiss"}
                                    onTestComplete={onTestComplete}
                                    eagerResult
                                    onTypingFocusChange={setTypingFocused}
                                    restartSignal={restartSignal}
                                    showStats={true}
                                    charAttemptsRef={charAttemptsRef}
                                />
                            }
                            {!isTrainContentLoading &&
                                <div data-testid="train-keyboard-wrap">
                                    <Keyboard mode={mode} charAttemptsRef={charAttemptsRef} highlightKeys={level.keys.split("")} />
                                </div>
                            }
                        </div>
                    </>
                }

                {completion &&
                    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-base-300/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="train-complete-title">
                        <div data-testid="train-complete-popover" className="w-full max-w-md rounded-xl border border-primary/40 bg-base-100 p-6 text-base-content shadow-2xl shadow-primary/20">
                            <div className="flex flex-col items-center text-center">
                                <p className="font-mono text-sm font-bold uppercase tracking-widest text-primary">
                                    {completion.stars > 0 ? "Level complete" : "Try again"}
                                </p>
                                <h2 id="train-complete-title" className="mt-2 font-mono text-3xl font-bold">
                                    {completion.stars > 0 ? `${completion.levelName} clear!` : `${completion.levelName} not cleared yet`}
                                </h2>
                                {KIND_META[completion.kind].special &&
                                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                        {(() => { const Icon = KIND_META[completion.kind].Icon; return <Icon className="h-3.5 w-3.5" /> })()}
                                        {KIND_META[completion.kind].label}
                                    </span>
                                }
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
                                        testId="train-net-result"
                                    />
                                    {completion.isNoMiss ?
                                        <ResultMetric
                                            label="Accuracy"
                                            value={`${formatNumber(completion.accuracy, 1)}%`}
                                            target="100%"
                                            passed={completion.accuracy >= 100}
                                            testId="train-accuracy-result"
                                        />
                                        :
                                        <NeutralMetric
                                            label="Accuracy"
                                            value={`${formatNumber(completion.accuracy, 1)}%`}
                                            note="Included in net WPM"
                                            testId="train-accuracy-result"
                                        />
                                    }
                                </div>
                                <p className="mt-4 text-sm text-base-content/65" data-testid="train-save-status">
                                    {completion.stars > 0
                                        ? completion.saved === "saved"
                                            ? "Best result saved."
                                            : completion.saved === "failed"
                                                ? "Clear earned, but saving failed."
                                                : "Saving progress…"
                                        : failMessage(completion)}
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

export default Train;
