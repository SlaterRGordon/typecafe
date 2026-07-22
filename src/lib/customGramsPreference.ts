import {
    parseCustomGramsPracticePreferences,
    type CustomGramsPracticePreferences,
} from "./customGramsPractice"
import { normalizePracticeItem } from "./practiceItem"

export const CUSTOM_GRAMS_PREFERENCE_VERSION = 2 as const
export const RECENT_CUSTOM_GRAMS_LIMIT = 12

export interface RecentCustomGramEntry {
    gram: string
    lastUsedAt: number
}

export interface CustomGramsSetup extends CustomGramsPracticePreferences {
    updatedAt: number
}

export interface CustomGramsPreferenceSnapshot {
    version: typeof CUSTOM_GRAMS_PREFERENCE_VERSION
    language: string
    entries: RecentCustomGramEntry[]
    setup: CustomGramsSetup | null
}

export function emptyCustomGramsPreference(language: string): CustomGramsPreferenceSnapshot {
    return { version: CUSTOM_GRAMS_PREFERENCE_VERSION, language, entries: [], setup: null }
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
        const gram = typeof record.gram === "string" ? normalizePracticeItem(record.gram) : null
        const lastUsedAt = normalizeTimestamp(record.lastUsedAt)
        if (!gram || lastUsedAt === null) continue
        newestByGram.set(gram, Math.max(newestByGram.get(gram) ?? 0, lastUsedAt))
    }
    return [...newestByGram]
        .map(([gram, lastUsedAt]) => ({ gram, lastUsedAt }))
        .sort((left, right) => right.lastUsedAt - left.lastUsedAt || left.gram.localeCompare(right.gram))
        .slice(0, RECENT_CUSTOM_GRAMS_LIMIT)
}

function normalizedSetup(value: unknown): CustomGramsSetup | null {
    if (!value || typeof value !== "object") return null
    const updatedAt = normalizeTimestamp((value as { updatedAt?: unknown }).updatedAt)
    if (updatedAt === null) return null
    return { ...parseCustomGramsPracticePreferences(value), updatedAt }
}

export function parseCustomGramsPreference(value: unknown, language: string): CustomGramsPreferenceSnapshot {
    if (!value || typeof value !== "object") return emptyCustomGramsPreference(language)
    const record = value as { version?: unknown; language?: unknown; entries?: unknown; setup?: unknown }
    if ((record.version !== 1 && record.version !== CUSTOM_GRAMS_PREFERENCE_VERSION) || record.language !== language) {
        return emptyCustomGramsPreference(language)
    }
    return {
        ...emptyCustomGramsPreference(language),
        entries: normalizedEntries(record.entries),
        setup: record.version === CUSTOM_GRAMS_PREFERENCE_VERSION ? normalizedSetup(record.setup) : null,
    }
}

export function addRecentCustomGram(snapshot: unknown, rawGram: string, lastUsedAt: number): CustomGramsPreferenceSnapshot {
    const language = typeof snapshot === "object" && snapshot !== null && "language" in snapshot
        && typeof snapshot.language === "string" ? snapshot.language : "english"
    const current = parseCustomGramsPreference(snapshot, language)
    const gram = normalizePracticeItem(rawGram)
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

export function updateCustomGramsSetup(
    snapshot: unknown,
    preferences: CustomGramsPracticePreferences,
    updatedAt: number,
): CustomGramsPreferenceSnapshot {
    const language = typeof snapshot === "object" && snapshot !== null && "language" in snapshot
        && typeof snapshot.language === "string" ? snapshot.language : "english"
    const current = parseCustomGramsPreference(snapshot, language)
    const timestamp = normalizeTimestamp(updatedAt)
    if (timestamp === null || (current.setup && current.setup.updatedAt > timestamp)) return current
    return { ...current, setup: { ...parseCustomGramsPracticePreferences(preferences), updatedAt: timestamp } }
}

function preferredSetup(left: CustomGramsSetup | null, right: CustomGramsSetup | null): CustomGramsSetup | null {
    if (!left) return right
    if (!right) return left
    if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? left : right
    return JSON.stringify(left) >= JSON.stringify(right) ? left : right
}

export function mergeCustomGramsPreferences(language: string, ...snapshots: unknown[]): CustomGramsPreferenceSnapshot {
    const parsed = snapshots.map((snapshot) => parseCustomGramsPreference(snapshot, language))
    return {
        ...emptyCustomGramsPreference(language),
        entries: normalizedEntries(parsed.flatMap(({ entries }) => entries)),
        setup: parsed.reduce<CustomGramsSetup | null>((selected, snapshot) => preferredSetup(selected, snapshot.setup), null),
    }
}
