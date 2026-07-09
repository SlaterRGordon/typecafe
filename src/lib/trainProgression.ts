import { levels, type Level } from "~/components/typer/train/levels"
import { starThresholds, starsForWpm, targetWpm, type StarThresholds } from "~/lib/trainThresholds"

export type { DifficultyName } from "~/lib/trainThresholds"
import type { DifficultyName } from "~/lib/trainThresholds"

// A Level's 1-based number on the ladder — the speed axis the thresholds key on.
export function levelNumber(levelName: string): number {
    const index = levels.findIndex((level) => level.name === levelName)
    return index >= 0 ? index + 1 : 1
}

// A cleared Level's best result, in domain terms. The persisted shape (DB
// columns, tRPC input, the localStorage mirror) calls these `options`/`speed`
// — see PersistedProgress and the toLevelProgress/fromLevelProgress mappers.
export interface LevelProgress {
    levelName: string
    netWpm: number
    accuracy: number
    stars: 0 | 1 | 2 | 3
}

// The wire/storage shape: `options` is the level name, `speed` is net WPM.
export interface PersistedProgress {
    options: string
    speed: number
    accuracy: number
    stars?: number
}

// One Level's standing on the ladder for a difficulty: whether it's Unlocked and
// the user's best star grade on it.
export interface LevelStatus {
    level: Level
    unlocked: boolean
    stars: 0 | 1 | 2 | 3
}

const clampStars = (value: number): 0 | 1 | 2 | 3 =>
    value >= 3 ? 3 : value >= 2 ? 2 : value >= 1 ? 1 : 0

export function toLevelProgress(row: PersistedProgress): LevelProgress {
    return {
        levelName: row.options,
        netWpm: row.speed,
        accuracy: row.accuracy,
        stars: clampStars(row.stars ?? 0),
    }
}

export function fromLevelProgress(entry: LevelProgress): PersistedProgress {
    return {
        options: entry.levelName,
        speed: entry.netWpm,
        accuracy: entry.accuracy,
        stars: entry.stars,
    }
}

// Fold an attempt into the lifetime progress, keeping the best of each metric.
export function mergeProgress(progress: LevelProgress[], entry: LevelProgress): LevelProgress[] {
    const current = progress.find((item) => item.levelName === entry.levelName)
    const rest = progress.filter((item) => item.levelName !== entry.levelName)

    return [
        ...rest,
        {
            levelName: entry.levelName,
            netWpm: Math.max(current?.netWpm ?? 0, entry.netWpm),
            accuracy: Math.max(current?.accuracy ?? 0, entry.accuracy),
            stars: clampStars(Math.max(current?.stars ?? 0, entry.stars)),
        },
    ]
}

// The ladder's standing for a difficulty: Level 1 is always Unlocked; every
// other Level unlocks once the prior Level's best net WPM meets the prior
// Level's requirement (accuracy is not gated). `ladder` defaults to the qwerty
// levels; Train passes the active layout's (levelsFor) — names and thresholds
// are layout-independent, only each Level's keys differ.
export function ladderState(progress: LevelProgress[], difficulty: DifficultyName, ladder: Level[] = levels): LevelStatus[] {
    return ladder.map((level, index, array) => {
        const cleared = progress.find((item) => item.levelName === level.name)
        const stars = clampStars(cleared?.stars ?? 0)

        if (index === 0) return { level, unlocked: true, stars }

        const prev = array[index - 1]
        const prevProgress = progress.find((item) => item.levelName === prev?.name)
        // prev's level number is `index` (its 0-based position is index − 1).
        const unlocked = !!(prevProgress && prevProgress.netWpm >= targetWpm(index, difficulty, 1))

        return { level, unlocked, stars }
    })
}

// The Level to resume at: the last Unlocked Level (i.e. one before the first
// locked one). All cleared → the final Level; nothing cleared → Level 1.
export function resumeLevel(progress: LevelProgress[], difficulty: DifficultyName, ladder: Level[] = levels): Level {
    const state = ladderState(progress, difficulty, ladder)
    const firstLocked = state.findIndex((status) => !status.unlocked)
    const index = firstLocked === -1 ? ladder.length - 1 : firstLocked <= 0 ? 0 : firstLocked - 1

    return ladder[index] as Level
}

// The Level to advance to after clearing `levelName`: the next one, but only if
// it's now Unlocked. Null at the end of the ladder or if it's still locked.
export function nextLevel(progress: LevelProgress[], levelName: string, difficulty: DifficultyName, ladder: Level[] = levels): Level | null {
    const currentIndex = ladder.findIndex((level) => level.name === levelName)
    const next = ladder[currentIndex + 1]
    if (!next) return null

    const status = ladderState(progress, difficulty, ladder).find((item) => item.level.name === next.name)
    return status?.unlocked ? next : null
}

// Grade a finished attempt against a Level: the visible star thresholds, the star
// grade, and the progress entry to save. Stars come from net WPM; the only
// per-kind rule is no-miss, where any error fails the level outright.
export function gradeLevel(
    level: Level,
    difficulty: DifficultyName,
    result: { netWpm: number; accuracy: number },
): { thresholds: StarThresholds; stars: 0 | 1 | 2 | 3; entry: LevelProgress } {
    const levelNum = levelNumber(level.name)
    const wpmStars = starsForWpm(result.netWpm, levelNum, difficulty)
    const stars = level.kind === "noMiss" && result.accuracy < 100 ? 0 : wpmStars

    return {
        thresholds: starThresholds(levelNum, difficulty),
        stars,
        entry: {
            levelName: level.name,
            netWpm: result.netWpm,
            accuracy: result.accuracy,
            stars,
        },
    }
}
