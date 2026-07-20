import { parseCustomGramsPracticePreferences, type CustomGramsPracticePreferences } from "./customGramsPractice"

const STORAGE_KEY = "typecafe:practice:custom-grams"

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
