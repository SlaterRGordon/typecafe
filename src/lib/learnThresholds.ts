// Learn ladder thresholds — formula-derived, never authored per level (ADR-0003).
// The level number is the speed axis (key-set difficulty is the per-level content
// axis); difficulty multiplies the whole climb and stars add per-level headroom.

export type DifficultyName = "easy" | "medium" | "hard" | "extreme" | "insane"

// Ordered easiest→hardest. Extensible: appending a tier is one entry here plus its
// multiplier below — no other structural change. The server enum derives from this.
export const DIFFICULTIES: DifficultyName[] = ["easy", "medium", "hard", "extreme", "insane"]

// Each tier is a gentler/steeper journey through the same 100 levels.
const DIFF_MULT: Record<DifficultyName, number> = {
    easy: 1.0,
    medium: 1.3,
    hard: 1.65,
    extreme: 2.05,
    insane: 2.6,
}

// Per-level headroom for 1 / 2 / 3 stars.
const STAR_MULT = [1.0, 1.12, 1.25] as const

// The easy-1★ spine: a linear ramp across the L1–L100 ladder (≈22 → ≈70).
function base(level: number): number {
    return 22 + (level - 1) * 0.48
}

// Net WPM a level demands at a given difficulty and star count.
export function targetWpm(level: number, difficulty: DifficultyName, star: 1 | 2 | 3): number {
    return Math.round(base(level) * DIFF_MULT[difficulty] * (STAR_MULT[star - 1] ?? 1))
}

export interface StarThresholds {
    oneStarNetWpm: number
    twoStarNetWpm: number
    threeStarNetWpm: number
}

export function starThresholds(level: number, difficulty: DifficultyName): StarThresholds {
    return {
        oneStarNetWpm: targetWpm(level, difficulty, 1),
        twoStarNetWpm: targetWpm(level, difficulty, 2),
        threeStarNetWpm: targetWpm(level, difficulty, 3),
    }
}

export function starsForWpm(netWpm: number, level: number, difficulty: DifficultyName): 0 | 1 | 2 | 3 {
    if (netWpm >= targetWpm(level, difficulty, 3)) return 3
    if (netWpm >= targetWpm(level, difficulty, 2)) return 2
    if (netWpm >= targetWpm(level, difficulty, 1)) return 1
    return 0
}
