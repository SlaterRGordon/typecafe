import { useCallback, useEffect, useMemo, useState } from "react"
import { AUTO_LAYOUT, LAYOUTS, languageForLayout, resolveLayout } from "~/lib/keyboardLayout"
import { startLayoutDetection } from "~/lib/layoutDetect"
import { hasStoredLanguageChoice, useLanguage, writeLanguage } from "./useLanguage"

// The global, local-first keyboard layout setting: which layout the app
// displays and teaches (boards, heatmaps, the train ladder) - chosen in the
// nav, mirroring useLanguage. Display only: input stays e.key, the OS does any
// remapping (docs/features/keyboard-layouts.md).
//
// The stored value is AUTO_LAYOUT (the default - follow the language, refined
// by detection) or an explicit layout id (pinned forever; language changes
// never touch it). Resolution is keyboardLayout.resolveLayout; detection
// adapters cache their verdict under DETECTED_KEY and fire CHANGED_EVENT
// (ledger decisions 4–5).
const KEY = "typecafe:layout"
export const LAYOUT_DETECTED_KEY = "typecafe:layout-detected"
export const LAYOUT_CHANGED_EVENT = "typecafe:layout-changed"

function readStored(): string {
    if (typeof window === "undefined") return AUTO_LAYOUT
    try {
        const raw = localStorage.getItem(KEY)
        if (raw) {
            const stored = JSON.parse(raw) as string
            if (stored === AUTO_LAYOUT || LAYOUTS.includes(stored)) return stored
        }
    } catch {
        // Corrupt or unavailable storage - fall through to the default.
    }
    return AUTO_LAYOUT
}

function readDetected(): string | null {
    if (typeof window === "undefined") return null
    try {
        const raw = localStorage.getItem(LAYOUT_DETECTED_KEY)
        if (raw) return JSON.parse(raw) as string
    } catch {
        // Corrupt or unavailable storage - no detection evidence.
    }
    return null
}

// Returns [resolved layout, set stored, stored setting]. The resolved layout is
// never "auto" - boards and ladders consume it directly; only the nav menu
// cares about the stored setting (to mark Auto active and preview what it
// resolves to).
export function useLayout(): [string, (next: string) => void, string] {
    const [language] = useLanguage()
    const [stored, setStored] = useState(AUTO_LAYOUT)
    // Detection is state (not read inline) so the server and first client
    // render agree - both resolve without evidence, the mount effect syncs.
    const [detected, setDetected] = useState<string | null>(null)
    const [locale, setLocale] = useState("")

    useEffect(() => {
        const sync = () => {
            setStored(readStored())
            setDetected(readDetected())
        }
        sync()
        setLocale(navigator.language ?? "")
        window.addEventListener(LAYOUT_CHANGED_EVENT, sync)
        window.addEventListener("storage", sync)
        return () => {
            window.removeEventListener(LAYOUT_CHANGED_EVENT, sync)
            window.removeEventListener("storage", sync)
        }
    }, [])

    // Detection adapters (docs/features/keyboard-layouts.md decision 5). The
    // hook owns the cache + apply policy: an API-probe verdict lands at mount -
    // a safe boundary - and applies immediately via the change event; a passive
    // verdict (mid-typing) only writes the cache and takes effect on the next
    // mount, so a board never swaps mid-test. Detection only feeds `auto`.
    useEffect(() => {
        startLayoutDetection((verdict, source) => {
            if (verdict === readDetected()) {
                seedLanguageFromDetectedLayout(verdict)
                return
            }
            try {
                localStorage.setItem(LAYOUT_DETECTED_KEY, JSON.stringify(verdict))
            } catch {
                return // Storage unavailable - nothing cached, nothing to apply.
            }
            seedLanguageFromDetectedLayout(verdict)
            if (source === "api") window.dispatchEvent(new Event(LAYOUT_CHANGED_EVENT))
        })
    }, [])

    useEffect(() => {
        if (detected) seedLanguageFromDetectedLayout(detected)
    }, [detected])

    const layout = useMemo(
        () => resolveLayout(stored, language, detected, locale),
        [stored, language, detected, locale],
    )

    const update = useCallback((next: string) => {
        setStored(next)
        try {
            localStorage.setItem(KEY, JSON.stringify(next))
        } catch {
            // Storage full or unavailable - the choice just won't persist.
        }
        window.dispatchEvent(new Event(LAYOUT_CHANGED_EVENT))
    }, [])

    return [layout, update, stored]
}

function seedLanguageFromDetectedLayout(layout: string): void {
    const language = languageForLayout(layout)
    if (!language || hasStoredLanguageChoice()) return
    writeLanguage(language)
}
