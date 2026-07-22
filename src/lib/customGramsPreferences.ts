import {
    parseCustomGramsPreference,
    type CustomGramsPreferenceSnapshot,
} from "./customGramsPreference"

export const CUSTOM_GRAMS_PREFERENCE_STORAGE_KEY = "typecafe:practice:recent-custom-grams"
const LOCAL_PREFERENCE_VERSION = 2 as const

interface PreferenceStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): unknown
}

interface CustomGramsLocalPayload {
    version: typeof LOCAL_PREFERENCE_VERSION
    languages: Record<string, unknown>
}

function browserStorage(): PreferenceStorage | null {
    return typeof window === "undefined" ? null : localStorage
}

function readPreferencePayload(storage: PreferenceStorage | null): CustomGramsLocalPayload {
    if (!storage) return { version: LOCAL_PREFERENCE_VERSION, languages: {} }
    try {
        const value = JSON.parse(storage.getItem(CUSTOM_GRAMS_PREFERENCE_STORAGE_KEY) ?? "null") as unknown
        if (!value || typeof value !== "object") throw new Error("Invalid Custom Grams preference payload")
        const payload = value as { version?: unknown; languages?: unknown }
        if ((payload.version !== 1 && payload.version !== LOCAL_PREFERENCE_VERSION)
            || !payload.languages || typeof payload.languages !== "object") {
            throw new Error("Unsupported Custom Grams preference payload")
        }
        return { version: LOCAL_PREFERENCE_VERSION, languages: payload.languages as Record<string, unknown> }
    } catch {
        return { version: LOCAL_PREFERENCE_VERSION, languages: {} }
    }
}

export function readPendingCustomGramsPreference(
    language: string,
    storage: PreferenceStorage | null = browserStorage(),
): CustomGramsPreferenceSnapshot {
    return parseCustomGramsPreference(readPreferencePayload(storage).languages[language], language)
}

export function writePendingCustomGramsPreference(
    snapshot: CustomGramsPreferenceSnapshot,
    storage: PreferenceStorage | null = browserStorage(),
): void {
    if (!storage) return
    const normalized = parseCustomGramsPreference(snapshot, snapshot.language)
    const payload = readPreferencePayload(storage)
    try {
        storage.setItem(CUSTOM_GRAMS_PREFERENCE_STORAGE_KEY, JSON.stringify({
            ...payload,
            languages: { ...payload.languages, [normalized.language]: normalized },
        }))
    } catch {
        // Practice remains available when browser storage is unavailable.
    }
}

export function clearPendingCustomGramsPreference(
    language: string,
    storage: PreferenceStorage | null = browserStorage(),
): void {
    if (!storage) return
    const payload = readPreferencePayload(storage)
    const languages = { ...payload.languages }
    delete languages[language]
    try {
        storage.setItem(CUSTOM_GRAMS_PREFERENCE_STORAGE_KEY, JSON.stringify({ ...payload, languages }))
    } catch {
        // A failed clear leaves the pending merge available for a later retry.
    }
}
