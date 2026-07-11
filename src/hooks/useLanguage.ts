import { useCallback, useEffect, useState } from "react"
import { parseLanguage } from "~/components/typer/utils"

// The global, local-first language setting: which base language the whole app
// generates text in (chosen in the nav, read by the typer, training, drills,
// progress and profile). Size lives per-test in the typer bar, not here.
//
// Shared across mounted components in the same tab via a custom event (the built-in
// "storage" event only fires cross-tab), mirroring how ThemeSwitch shares "theme".
const KEY = "typecafe:language"
const LEGACY_KEY = "typecafe:testSettings"
const CHANGED_EVENT = "typecafe:language-changed"

function read(): string {
    if (typeof window === "undefined") return "english"
    try {
        const raw = localStorage.getItem(KEY)
        if (raw) return parseLanguage(JSON.parse(raw) as string).base
        // Migrate from the pre-split setting, where size was baked into one string
        // ("english5k", "french"). Recover just the base language.
        const legacy = (JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}") as { language?: string }).language
        if (typeof legacy === "string") return parseLanguage(legacy).base
    } catch {
        // Corrupt or unavailable storage - fall through to the default.
    }
    return "english"
}

export function hasStoredLanguageChoice(): boolean {
    if (typeof window === "undefined") return false
    try {
        return localStorage.getItem(KEY) !== null
    } catch {
        return false
    }
}

export function writeLanguage(next: string): boolean {
    if (typeof window === "undefined") return false
    try {
        localStorage.setItem(KEY, JSON.stringify(parseLanguage(next).base))
    } catch {
        return false
    }
    window.dispatchEvent(new Event(CHANGED_EVENT))
    return true
}

export function useLanguage(): [string, (next: string) => void] {
    const [language, setLanguage] = useState("english")

    // Read after mount so the server and first client render agree (hydration-safe).
    useEffect(() => {
        setLanguage(read())
        const sync = () => setLanguage(read())
        window.addEventListener(CHANGED_EVENT, sync)
        window.addEventListener("storage", sync)
        return () => {
            window.removeEventListener(CHANGED_EVENT, sync)
            window.removeEventListener("storage", sync)
        }
    }, [])

    const update = useCallback((next: string) => {
        setLanguage(next)
        writeLanguage(next)
    }, [])

    return [language, update]
}
