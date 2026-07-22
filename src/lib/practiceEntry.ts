export type PracticePath = "keys" | "grams"

export const PRACTICE_PATH_STORAGE_KEY = "typecafe:practice:last-custom-path"

interface PracticePathStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): unknown
}

export interface PracticeEntryResolution {
    kind: "custom" | "guided"
    path: PracticePath
    rememberPath: boolean
    invalidTarget: boolean
}

export function parsePracticePath(value: unknown): PracticePath | null {
    const candidate: unknown = Array.isArray(value) ? (value as unknown[])[0] : value
    return candidate === "keys" || candidate === "grams" ? candidate : null
}

export function readPracticePath(storage: PracticePathStorage | null = typeof window === "undefined" ? null : localStorage): PracticePath {
    if (!storage) return "keys"
    try {
        return parsePracticePath(storage.getItem(PRACTICE_PATH_STORAGE_KEY)) ?? "keys"
    } catch {
        return "keys"
    }
}

export function writePracticePath(path: PracticePath, storage: PracticePathStorage | null = typeof window === "undefined" ? null : localStorage): void {
    try {
        storage?.setItem(PRACTICE_PATH_STORAGE_KEY, path)
    } catch {
        // Practice still opens when storage is unavailable; only resume is lost.
    }
}

/** Resolve one entry without allowing Guided visits to rewrite Custom resume. */
export function resolvePracticeEntry(input: {
    explicitPath: PracticePath | null
    guidedPath: PracticePath | null
    rememberedPath: PracticePath
    hasTargetIntent: boolean
}): PracticeEntryResolution {
    if (input.explicitPath) return {
        kind: "custom",
        path: input.explicitPath,
        rememberPath: true,
        invalidTarget: false,
    }
    if (input.guidedPath) return {
        kind: "guided",
        path: input.guidedPath,
        rememberPath: false,
        invalidTarget: false,
    }
    return {
        kind: "custom",
        path: input.rememberedPath,
        rememberPath: false,
        invalidTarget: input.hasTargetIntent,
    }
}
