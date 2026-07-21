import { parseCustomGramsPracticePreferences, type CustomGramsPracticePreferences } from "./customGramsPractice"
import {
    parseRecentCustomGrams,
    RECENT_CUSTOM_GRAMS_VERSION,
    type RecentCustomGramsSnapshot,
} from "./customGramsRecent"

const STORAGE_KEY = "typecafe:practice:custom-grams"
export const RECENT_CUSTOM_GRAMS_STORAGE_KEY = "typecafe:practice:recent-custom-grams"

interface PreferenceStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): unknown
}

interface RecentCustomGramsLocalPayload {
    version: typeof RECENT_CUSTOM_GRAMS_VERSION
    languages: Record<string, unknown>
}

function browserStorage(): PreferenceStorage | null {
    return typeof window === "undefined" ? null : localStorage
}

function readRecentPayload(storage: PreferenceStorage | null): RecentCustomGramsLocalPayload {
    if (!storage) return { version: RECENT_CUSTOM_GRAMS_VERSION, languages: {} }
    try {
        const value = JSON.parse(storage.getItem(RECENT_CUSTOM_GRAMS_STORAGE_KEY) ?? "null") as unknown
        if (!value || typeof value !== "object") throw new Error("Invalid Recent Custom Grams payload")
        const payload = value as { version?: unknown; languages?: unknown }
        if (payload.version !== RECENT_CUSTOM_GRAMS_VERSION || !payload.languages || typeof payload.languages !== "object") {
            throw new Error("Unsupported Recent Custom Grams payload")
        }
        return { version: RECENT_CUSTOM_GRAMS_VERSION, languages: payload.languages as Record<string, unknown> }
    } catch {
        return { version: RECENT_CUSTOM_GRAMS_VERSION, languages: {} }
    }
}

export function readPendingRecentCustomGrams(
    language: string,
    storage: PreferenceStorage | null = browserStorage(),
): RecentCustomGramsSnapshot {
    return parseRecentCustomGrams(readRecentPayload(storage).languages[language], language)
}

export function writePendingRecentCustomGrams(
    snapshot: RecentCustomGramsSnapshot,
    storage: PreferenceStorage | null = browserStorage(),
): void {
    if (!storage) return
    const normalized = parseRecentCustomGrams(snapshot, snapshot.language)
    const payload = readRecentPayload(storage)
    try {
        storage.setItem(RECENT_CUSTOM_GRAMS_STORAGE_KEY, JSON.stringify({
            ...payload,
            languages: { ...payload.languages, [normalized.language]: normalized },
        }))
    } catch {
        // Practice remains available when browser storage is unavailable.
    }
}

export function clearPendingRecentCustomGrams(
    language: string,
    storage: PreferenceStorage | null = browserStorage(),
): void {
    if (!storage) return
    const payload = readRecentPayload(storage)
    const languages = { ...payload.languages }
    delete languages[language]
    try {
        storage.setItem(RECENT_CUSTOM_GRAMS_STORAGE_KEY, JSON.stringify({ ...payload, languages }))
    } catch {
        // A failed clear leaves the pending merge available for a later retry.
    }
}

export interface CustomGramsPracticeContinuation {
    focus: string
    settings: string
}

/** Read-only landing copy for the last Custom Grams setup. */
export function summarizeCustomGramsPracticePreferences(preferences: CustomGramsPracticePreferences): CustomGramsPracticeContinuation {
    return {
        focus: preferences.grams.join(" · "),
        settings: `${preferences.durationSeconds}s · ${preferences.textStyle === "pseudo" ? "Pseudo" : "Varied"}`,
    }
}

export function readCustomGramsPracticePreferences(): CustomGramsPracticePreferences {
    if (typeof window === "undefined") return parseCustomGramsPracticePreferences(null)
    try {
        return parseCustomGramsPracticePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))
    } catch {
        return parseCustomGramsPracticePreferences(null)
    }
}

export function writeCustomGramsPracticePreferences(preferences: CustomGramsPracticePreferences): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch {
        // Practice still works when storage is unavailable; only Continue is lost.
    }
}
