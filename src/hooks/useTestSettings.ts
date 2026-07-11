import { useCallback, useEffect, useRef, useState } from "react"
import { TestGramScopes, TestGramSources, TestModes, TestSubModes, type QuoteLength } from "~/components/typer/types"

// Every user-tweakable test setting, persisted as one object so a returning
// visitor gets back exactly the test they configured.
export interface TestSettings {
    mode: TestModes,
    subMode: TestSubModes,
    language: string,
    quoteLength: QuoteLength,
    count: number,
    customLength: boolean,
    punctuation: boolean,
    capitals: boolean,
    numbers: boolean,
    selectedKeys: string[],
    gramSource: TestGramSources,
    gramScope: TestGramScopes,
    gramCombination: number,
    gramRepetition: number,
    gramWpmThreshold: number,
    gramAccuracyThreshold: number,
    showStats: boolean,
    showKeyboard: boolean,
}

export const DEFAULT_TEST_SETTINGS: TestSettings = {
    mode: TestModes.normal,
    subMode: TestSubModes.timed,
    language: "english",
    quoteLength: "all",
    count: 15,
    customLength: false,
    punctuation: false,
    capitals: false,
    numbers: false,
    selectedKeys: "asdfghjkl".split(""),
    gramSource: TestGramSources.bigrams,
    gramScope: TestGramScopes.fifty,
    gramCombination: 1,
    gramRepetition: 0,
    gramWpmThreshold: 20,
    gramAccuracyThreshold: 100,
    showStats: true,
    showKeyboard: false,
}

const STORAGE_KEY = "typecafe:testSettings"

function sanitize(raw: unknown): Partial<TestSettings> {
    if (!raw || typeof raw !== "object") return {}
    const candidate = raw as Record<string, unknown>
    const result: Record<string, unknown> = {}
    // Only accept keys we know about, with the same primitive type as the default,
    // so a stale or hand-edited localStorage entry can never produce invalid state.
    for (const [key, defaultValue] of Object.entries(DEFAULT_TEST_SETTINGS)) {
        const value = candidate[key]
        if (value === undefined) continue
        if (Array.isArray(defaultValue)) {
            if (Array.isArray(value) && value.every((item) => typeof item === "string")) result[key] = value
        } else if (typeof value === typeof defaultValue) {
            result[key] = value
        }
    }
    return result as Partial<TestSettings>
}

export function useTestSettings() {
    const [settings, setSettings] = useState<TestSettings>(DEFAULT_TEST_SETTINGS)
    const loadedRef = useRef(false)

    // Read in an effect (not during render) so the server render and the first
    // client render agree, avoiding hydration mismatches.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) setSettings({ ...DEFAULT_TEST_SETTINGS, ...sanitize(JSON.parse(raw)) })
        } catch {
            // Corrupt or unavailable storage - fall back to defaults.
        }
        loadedRef.current = true
    }, [])

    useEffect(() => {
        if (!loadedRef.current) return
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
        } catch {
            // Storage full or unavailable - settings just won't persist.
        }
    }, [settings])

    const updateSetting = useCallback(<K extends keyof TestSettings>(key: K, value: TestSettings[K]) => {
        setSettings((previous) => ({ ...previous, [key]: value }))
    }, [])

    return { settings, updateSetting }
}
