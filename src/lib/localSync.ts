import { createKeyedStore, type KeyedStore } from "./keyedStore"
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

// Guest mirrors are keyed per stats pool (docs/features/keyboard-layouts.md
// decision 6): the legacy unsuffixed key IS the qwerty pool (zero migration);
// remap pools live under suffixed keys ("typecafe:keyStats:colemak").
const stores: Record<string, KeyedStore<LocalKeyStat>> = {}

function storeFor(pool: string) {
    const key = pool === "qwerty" ? LOCAL_KEY_STATS_KEY : `${LOCAL_KEY_STATS_KEY}:${pool}`
    return (stores[key] ??= createKeyedStore(key, sanitizeStat, mergeKeyStats))
}

export const readLocalKeyStats = (pool = "qwerty", s?: Storage) => storeFor(pool).read(s)
export const writeLocalKeyStats = (items: LocalKeyStat[], pool = "qwerty", s?: Storage) => storeFor(pool).write(items, s)
export const addLocalKeyStats = (items: LocalKeyStat[], pool = "qwerty", s?: Storage) => storeFor(pool).add(items, s)
export const clearLocalKeyStats = (pool = "qwerty", s?: Storage) => storeFor(pool).clear(s)
