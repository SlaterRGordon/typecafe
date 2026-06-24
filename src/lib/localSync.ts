export const LOCAL_KEY_STATS_KEY = "typecafe:keyStats"

export interface LocalKeyStat {
    key: string
    attempts: number
    correct: number
}

function isStorageAvailable(storage: Storage | undefined): storage is Storage {
    return typeof storage !== "undefined"
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

export function readLocalKeyStats(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): LocalKeyStat[] {
    if (!isStorageAvailable(storage)) return []

    try {
        const raw = storage.getItem(LOCAL_KEY_STATS_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return mergeKeyStats([], parsed.filter(Boolean) as LocalKeyStat[])
    } catch {
        return []
    }
}

export function writeLocalKeyStats(stats: LocalKeyStat[], storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage) {
    if (!isStorageAvailable(storage)) return false

    const merged = mergeKeyStats([], stats)
    try {
        if (merged.length === 0) storage.removeItem(LOCAL_KEY_STATS_KEY)
        else storage.setItem(LOCAL_KEY_STATS_KEY, JSON.stringify(merged))
        return true
    } catch {
        return false
    }
}

export function addLocalKeyStats(stats: LocalKeyStat[], storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage) {
    if (!isStorageAvailable(storage)) return false
    return writeLocalKeyStats(mergeKeyStats(readLocalKeyStats(storage), stats), storage)
}

export function clearLocalKeyStats(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage) {
    if (!isStorageAvailable(storage)) return false

    try {
        storage.removeItem(LOCAL_KEY_STATS_KEY)
        return true
    } catch {
        return false
    }
}
