import { useCallback, useEffect, useRef, useState } from "react"
import { TestModes, TestSubModes, type QuoteLength } from "~/components/typer/types"

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
    showStats: true,
    showKeyboard: false,
}

const STORAGE_KEY = "typecafe:testSettings"

const ORDINARY_MODES = new Set<TestModes>([TestModes.normal, TestModes.relaxed, TestModes.quotes])

export function sanitizeTestSettings(raw: unknown): TestSettings {
    if (!raw || typeof raw !== "object") return DEFAULT_TEST_SETTINGS
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
    const sanitized = { ...DEFAULT_TEST_SETTINGS, ...result } as TestSettings
    if (!ORDINARY_MODES.has(sanitized.mode)) sanitized.mode = TestModes.normal
    if (sanitized.subMode !== TestSubModes.timed && sanitized.subMode !== TestSubModes.words) {
        sanitized.subMode = TestSubModes.timed
    }
    const maxCount = sanitized.subMode === TestSubModes.timed ? 3_600 : 5_000
    if (!Number.isInteger(sanitized.count) || sanitized.count < 1 || sanitized.count > maxCount) {
        sanitized.count = sanitized.subMode === TestSubModes.timed ? 15 : 10
        sanitized.customLength = false
    }
    if (!(["all", "short", "medium", "long"] as const).includes(sanitized.quoteLength)) {
        sanitized.quoteLength = "all"
    }
    return sanitized
}

export function useTestSettings() {
    const [settings, setSettings] = useState<TestSettings>(DEFAULT_TEST_SETTINGS)
    const loadedRef = useRef(false)

    // Read in an effect (not during render) so the server render and the first
    // client render agree, avoiding hydration mismatches.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) setSettings(sanitizeTestSettings(JSON.parse(raw)))
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
