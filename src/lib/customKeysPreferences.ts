import { parseCustomKeysPracticePreferences, type CustomKeysPracticePreferences } from "./customKeysPractice"

const STORAGE_KEY = "typecafe:practice:custom-keys"

export function readCustomKeysPracticePreferences(): CustomKeysPracticePreferences {
    if (typeof window === "undefined") return parseCustomKeysPracticePreferences(null)
    try {
        return parseCustomKeysPracticePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))
    } catch {
        return parseCustomKeysPracticePreferences(null)
    }
}

export function writeCustomKeysPracticePreferences(preferences: CustomKeysPracticePreferences): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch {
        // Practice still works when storage is unavailable; only Continue is lost.
    }
}
