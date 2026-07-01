import { DIFFICULTIES, type DifficultyName } from "~/lib/trainThresholds";
import { levels } from "~/components/typer/train/levels";
import { levelNumber, toLevelProgress, type PersistedProgress } from "~/lib/trainProgression";

export interface TrainProfileRow extends PersistedProgress {
    difficulty: string;
}

export interface TrainDifficultySummary {
    difficulty: DifficultyName;
    label: string;
    levelsCompleted: number;
    totalLevels: number;
    starsEarned: number;
    totalStars: number;
    percentComplete: number;
    highestLevel: number | null;
}

export interface TrainProfileSummary {
    difficulties: TrainDifficultySummary[];
    hardestClear: {
        difficulty: DifficultyName;
        label: string;
        level: number;
    } | null;
}

const TOTAL_LEVELS = levels.length;
const TOTAL_STARS = TOTAL_LEVELS * 3;

function clampStars(value: number | undefined): 0 | 1 | 2 | 3 {
    if (!value || value < 1) return 0;
    if (value >= 3) return 3;
    if (value >= 2) return 2;
    return 1;
}

function difficultyLabel(difficulty: DifficultyName) {
    return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

function summarizeDifficulty(rows: TrainProfileRow[], difficulty: DifficultyName): TrainDifficultySummary {
    const byLevel = new Map<string, { stars: 0 | 1 | 2 | 3; netWpm: number }>();

    rows
        .filter((row) => row.difficulty === difficulty)
        .forEach((row) => {
            const progress = toLevelProgress(row);
            const current = byLevel.get(progress.levelName);
            byLevel.set(progress.levelName, {
                stars: clampStars(Math.max(current?.stars ?? 0, progress.stars)),
                netWpm: Math.max(current?.netWpm ?? 0, progress.netWpm),
            });
        });

    const cleared = Array.from(byLevel.entries()).filter(([, progress]) => progress.stars > 0);
    const highestLevel = cleared.length > 0
        ? Math.max(...cleared.map(([levelName]) => levelNumber(levelName)))
        : null;
    const starsEarned = cleared.reduce((sum, [, progress]) => sum + progress.stars, 0);

    return {
        difficulty,
        label: difficultyLabel(difficulty),
        levelsCompleted: cleared.length,
        totalLevels: TOTAL_LEVELS,
        starsEarned,
        totalStars: TOTAL_STARS,
        percentComplete: TOTAL_LEVELS > 0 ? (cleared.length / TOTAL_LEVELS) * 100 : 0,
        highestLevel,
    };
}

export function trainProfileSummary(rows: TrainProfileRow[]): TrainProfileSummary {
    const difficulties = DIFFICULTIES.map((difficulty) => summarizeDifficulty(rows, difficulty));
    const hardestClear = difficulties
        .filter((summary) => summary.highestLevel !== null)
        .sort((a, b) => {
            const difficultyDelta = DIFFICULTIES.indexOf(b.difficulty) - DIFFICULTIES.indexOf(a.difficulty);
            if (difficultyDelta !== 0) return difficultyDelta;
            return (b.highestLevel ?? 0) - (a.highestLevel ?? 0);
        })[0];

    return {
        difficulties,
        hardestClear: hardestClear && hardestClear.highestLevel !== null
            ? {
                difficulty: hardestClear.difficulty,
                label: hardestClear.label,
                level: hardestClear.highestLevel,
            }
            : null,
    };
}
