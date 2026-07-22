import { describe, expect, it } from "vitest"
import {
    PRACTICE_PATH_STORAGE_KEY,
    parsePracticePath,
    readPracticePath,
    resolvePracticeEntry,
    writePracticePath,
} from "./practiceEntry"

function memoryStorage(value: string | null = null) {
    const values = new Map<string, string>()
    if (value !== null) values.set(PRACTICE_PATH_STORAGE_KEY, value)
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, next: string) => values.set(key, next),
    }
}

describe("Practice entry", () => {
    it("defaults missing or corrupt browser-local preference to Keys", () => {
        expect(readPracticePath(memoryStorage())).toBe("keys")
        expect(readPracticePath(memoryStorage("guided"))).toBe("keys")
        expect(parsePracticePath(["grams", "keys"])).toBe("grams")
    })

    it("writes one global Custom path without an account or language dimension", () => {
        const storage = memoryStorage()
        writePracticePath("grams", storage)
        expect(readPracticePath(storage)).toBe("grams")
    })

    it("gives an explicit Custom path precedence and remembers it", () => {
        expect(resolvePracticeEntry({ explicitPath: "grams", guidedPath: "keys", rememberedPath: "keys", hasTargetIntent: true }))
            .toEqual({ kind: "custom", path: "grams", rememberPath: true, invalidTarget: false })
    })

    it("keeps a valid Guided Target isolated from Custom resume", () => {
        expect(resolvePracticeEntry({ explicitPath: null, guidedPath: "keys", rememberedPath: "grams", hasTargetIntent: true }))
            .toEqual({ kind: "guided", path: "keys", rememberPath: false, invalidTarget: false })
    })

    it("falls invalid Target intent back to the remembered Custom path", () => {
        expect(resolvePracticeEntry({ explicitPath: null, guidedPath: null, rememberedPath: "grams", hasTargetIntent: true }))
            .toEqual({ kind: "custom", path: "grams", rememberPath: false, invalidTarget: true })
    })
})
