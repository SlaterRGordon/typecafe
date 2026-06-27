import { createKeyedStore } from "./keyedStore"

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

    return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key))
}

const store = createKeyedStore(LOCAL_KEY_STATS_KEY, sanitizeStat, mergeKeyStats)

export const readLocalKeyStats = store.read
export const writeLocalKeyStats = store.write
export const addLocalKeyStats = store.add
export const clearLocalKeyStats = store.clear
