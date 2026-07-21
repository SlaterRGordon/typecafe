import { normalizeCustomGram } from "./customGramsPractice"

export const RECENT_CUSTOM_GRAMS_VERSION = 1 as const
export const RECENT_CUSTOM_GRAMS_LIMIT = 12

export interface RecentCustomGramEntry {
    gram: string
    lastUsedAt: number
}

export interface RecentCustomGramsSnapshot {
    version: typeof RECENT_CUSTOM_GRAMS_VERSION
    language: string
    entries: RecentCustomGramEntry[]
}

export function emptyRecentCustomGrams(language: string): RecentCustomGramsSnapshot {
    return { version: RECENT_CUSTOM_GRAMS_VERSION, language, entries: [] }
}

function normalizeTimestamp(value: unknown): number | null {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function normalizedEntries(value: unknown): RecentCustomGramEntry[] {
    if (!Array.isArray(value)) return []

    const newestByGram = new Map<string, number>()
    for (const candidate of value) {
        if (!candidate || typeof candidate !== "object") continue
        const record = candidate as { gram?: unknown; lastUsedAt?: unknown }
        const gram = typeof record.gram === "string" ? normalizeCustomGram(record.gram) : null
        const lastUsedAt = normalizeTimestamp(record.lastUsedAt)
        if (!gram || lastUsedAt === null) continue
        newestByGram.set(gram, Math.max(newestByGram.get(gram) ?? 0, lastUsedAt))
    }

    return [...newestByGram]
        .map(([gram, lastUsedAt]) => ({ gram, lastUsedAt }))
        .sort((left, right) => right.lastUsedAt - left.lastUsedAt || left.gram.localeCompare(right.gram))
        .slice(0, RECENT_CUSTOM_GRAMS_LIMIT)
}

export function parseRecentCustomGrams(value: unknown, language: string): RecentCustomGramsSnapshot {
    if (!value || typeof value !== "object") return emptyRecentCustomGrams(language)
    const record = value as { version?: unknown; language?: unknown; entries?: unknown }
    if (record.version !== RECENT_CUSTOM_GRAMS_VERSION || record.language !== language) {
        return emptyRecentCustomGrams(language)
    }
    return { ...emptyRecentCustomGrams(language), entries: normalizedEntries(record.entries) }
}

export function addRecentCustomGram(
    snapshot: unknown,
    rawGram: string,
    lastUsedAt: number,
): RecentCustomGramsSnapshot {
    const language = typeof snapshot === "object" && snapshot !== null && "language" in snapshot
        && typeof snapshot.language === "string" ? snapshot.language : "english"
    const current = parseRecentCustomGrams(snapshot, language)
    const gram = normalizeCustomGram(rawGram)
    const timestamp = normalizeTimestamp(lastUsedAt)
    if (!gram || timestamp === null) return current

    return {
        ...current,
        entries: normalizedEntries([
            ...current.entries,
            { gram, lastUsedAt: Math.max(current.entries.find((entry) => entry.gram === gram)?.lastUsedAt ?? 0, timestamp) },
        ]),
    }
}

export function mergeRecentCustomGrams(language: string, ...snapshots: unknown[]): RecentCustomGramsSnapshot {
    return {
        ...emptyRecentCustomGrams(language),
        entries: normalizedEntries(snapshots.flatMap((snapshot) => parseRecentCustomGrams(snapshot, language).entries)),
    }
}
