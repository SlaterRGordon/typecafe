import { TestSubModes } from "~/components/typer/types";

export type LevelKind = "keys" | "speed" | "noMiss" | "boss"

export interface Level {
    name: string,
    keys: string,
    count: number,
    kind: LevelKind,
    subMode: TestSubModes,
}

// The 100-level Learn ladder, generated from a compact spec rather than authored
// per level (docs/features/learn-ladder.md). Thresholds are not stored here — they
// derive from the level number via src/lib/learnThresholds.ts. Curves below are
// tunable knobs; the generated shape is what the rest of the app consumes.

// Keys are introduced progressively over the first INTRO_LEVELS, then the full
// alphabet is held for the rest of the climb — later difficulty comes from the
// WPM ramp, longer counts and themed kinds, not new keys.
const KEY_STAGES = [
    "asdfjkl",                    // home row
    "asdfghjkl",                  // + g h
    "asdefghijkl",                // + e i
    "asderfghijkul",              // + r u
    "asdertfghijkuly",            // + t y
    "wasdertfghijkulyo",          // + w o
    "qwasdertfghijkulyop",        // + q p
    "qwasdertfghijkulyopcn",      // + c n
    "qwasdertfghijkulyopcnvm",    // + v m
    "qwasdertfghijkulyopcnvmb",   // + b
    "qwertyuiopasdfghjklzxcvbnm", // full alphabet
]

const TOTAL_LEVELS = 100
const INTRO_LEVELS = 44 // keys fully introduced by ~L44
const BASE_COUNT = 10   // words at L1
const MAX_COUNT = 50    // words at the top (non-boss/speed)
const BOSS_COUNT = 60   // boss levels are longer
const SPEED_SECONDS = 30 // speed rounds are timed (count is seconds — wired in slice 4)

function keysForLevel(level: number): string {
    if (level > INTRO_LEVELS) return KEY_STAGES[KEY_STAGES.length - 1]!
    const perStage = INTRO_LEVELS / KEY_STAGES.length
    const index = Math.min(KEY_STAGES.length - 1, Math.floor((level - 1) / perStage))
    return KEY_STAGES[index]!
}

// Block-of-10 rhythm: boss on the 10th, a speed round at position 4 and a no-miss
// at position 7, the rest plain key levels. (Speed/no-miss/boss behaviour lands in
// slices 4/5/3; until then they render as ordinary key levels.)
function kindForLevel(level: number): LevelKind {
    const position = level % 10 // 1..9 within the block, 0 = the 10th
    if (position === 0) return "boss"
    if (position === 4) return "speed"
    if (position === 7) return "noMiss"
    return "keys"
}

function countForLevel(level: number, kind: LevelKind): number {
    if (kind === "boss") return BOSS_COUNT
    if (kind === "speed") return SPEED_SECONDS
    return Math.round(BASE_COUNT + (MAX_COUNT - BASE_COUNT) * (level - 1) / (TOTAL_LEVELS - 1))
}

function buildLevels(): Level[] {
    return Array.from({ length: TOTAL_LEVELS }, (_, i) => {
        const level = i + 1
        const kind = kindForLevel(level)
        return {
            name: `Level ${level}`,
            keys: keysForLevel(level),
            count: countForLevel(level, kind),
            kind,
            subMode: kind === "speed" ? TestSubModes.timed : TestSubModes.words,
        }
    })
}

export const levels: Level[] = buildLevels()
