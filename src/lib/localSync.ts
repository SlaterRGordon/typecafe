import { createKeyedStore } from "./keyedStore"
import { KEY_ATTEMPT_CAP } from "./practiceAttempts"

export const LOCAL_KEY_STATS_KEY = "typecafe:keyStats"

export interface LocalKeyStat {
    key: string
    attempts: number
    correct: number
}

function sanitizeStat(raw: unknown): LocalKeyStat | null {
    if (!raw || typeof raw !== "object") return null
    const value = raw as Record<string, unknown>
    if (typeof value.key !== "string" || value.key.length !== 1) return null
    if (typeof value.attempts !== "number" || !Number.isInteger(value.attempts) || value.attempts < 0) return null
    if (typeof value.correct !== "number" || !Number.isInteger(value.correct) || value.correct < 0) return null
    return {
        key: value.key,
        attempts: value.attempts,
        correct: Math.min(value.correct, value.attempts),
    }
}

// Scale an over-cap stat back down to the rolling window (ADR-0005), preserving
// its accuracy. `correct` ≤ `attempts` survives the rounding: correct·f ≤ cap.
function capKeyStat(stat: LocalKeyStat): LocalKeyStat {
    if (stat.attempts <= KEY_ATTEMPT_CAP) return stat
    const factor = KEY_ATTEMPT_CAP / stat.attempts
    return {
        key: stat.key,
        attempts: KEY_ATTEMPT_CAP,
        correct: Math.round(stat.correct * factor),
    }
}

export function mergeKeyStats(existing: LocalKeyStat[], incoming: LocalKeyStat[]): LocalKeyStat[] {
    const byKey = new Map<string, LocalKeyStat>()

    for (const stat of [...existing, ...incoming]) {
        const clean = sanitizeStat(stat)
        if (!clean || clean.attempts === 0) continue

        const current = byKey.get(clean.key)
        byKey.set(clean.key, {
            key: clean.key,
            attempts: (current?.attempts ?? 0) + clean.attempts,
            correct: (current?.correct ?? 0) + clean.correct,
        })
    }

    return Array.from(byKey.values(), capKeyStat).sort((a, b) => a.key.localeCompare(b.key))
}

const store = createKeyedStore(LOCAL_KEY_STATS_KEY, sanitizeStat, mergeKeyStats)

export const readLocalKeyStats = store.read
export const writeLocalKeyStats = store.write
export const addLocalKeyStats = store.add
export const clearLocalKeyStats = store.clear
