import { describe, expect, it } from "vitest"
import {
    addRecentCustomGram,
    emptyRecentCustomGrams,
    mergeRecentCustomGrams,
    RECENT_CUSTOM_GRAMS_LIMIT,
} from "./customGramsRecent"
import {
    clearPendingRecentCustomGrams,
    readPendingRecentCustomGrams,
    RECENT_CUSTOM_GRAMS_STORAGE_KEY,
    writePendingRecentCustomGrams,
} from "./customGramsPreferences"

function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial))
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        value: (key: string) => values.get(key),
    }
}

describe("recent Custom Grams", () => {
    it("normalizes direct entries, moves reuse to the front, and caps newest-first history", () => {
        let snapshot = emptyRecentCustomGrams("english")

        for (let index = 0; index <= RECENT_CUSTOM_GRAMS_LIMIT; index += 1) {
            snapshot = addRecentCustomGram(snapshot, `a${String.fromCharCode(97 + index)}`, index + 1)
        }
        snapshot = addRecentCustomGram(snapshot, " AC ", 20)

        expect(snapshot.entries).toHaveLength(RECENT_CUSTOM_GRAMS_LIMIT)
        expect(snapshot.entries[0]).toEqual({ gram: "ac", lastUsedAt: 20 })
        expect(snapshot.entries.filter(({ gram }) => gram === "ac")).toHaveLength(1)
        expect(snapshot.entries.some(({ gram }) => gram === "aa")).toBe(false)
    })

    it("merges retries by normalized Gram without duplicate or timestamp regression", () => {
        const account = {
            ...emptyRecentCustomGrams("english"),
            entries: [{ gram: "TH", lastUsedAt: 12 }, { gram: "he", lastUsedAt: 8 }],
        }
        const pending = {
            ...emptyRecentCustomGrams("english"),
            entries: [{ gram: " th ", lastUsedAt: 10 }, { gram: "er", lastUsedAt: 15 }],
        }

        const merged = mergeRecentCustomGrams("english", account, pending)
        expect(merged.entries).toEqual([
            { gram: "er", lastUsedAt: 15 },
            { gram: "th", lastUsedAt: 12 },
            { gram: "he", lastUsedAt: 8 },
        ])
        expect(mergeRecentCustomGrams("english", merged, pending)).toEqual(merged)
    })

    it("keeps versioned pending guest history scoped by language until explicitly cleared", () => {
        const storage = memoryStorage()
        const english = addRecentCustomGram(emptyRecentCustomGrams("english"), "th", 10)
        const french = addRecentCustomGram(emptyRecentCustomGrams("french"), "éé", 11)

        writePendingRecentCustomGrams(english, storage)
        writePendingRecentCustomGrams(french, storage)
        expect(readPendingRecentCustomGrams("english", storage)).toEqual(english)
        expect(readPendingRecentCustomGrams("french", storage)).toEqual(french)
        expect(JSON.parse(storage.value(RECENT_CUSTOM_GRAMS_STORAGE_KEY)!)).toMatchObject({ version: 1 })

        clearPendingRecentCustomGrams("english", storage)
        expect(readPendingRecentCustomGrams("english", storage).entries).toEqual([])
        expect(readPendingRecentCustomGrams("french", storage)).toEqual(french)
    })
})
