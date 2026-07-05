import { describe, expect, it } from "vitest"
import {
    LOCAL_KEY_STATS_KEY,
    addLocalKeyStats,
    clearLocalKeyStats,
    mergeKeyStats,
    readLocalKeyStats,
    writeLocalKeyStats,
} from "./localSync"
import { KEY_ATTEMPT_CAP } from "./practiceAttempts"

function storage() {
    const data = new Map<string, string>()
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
            data.set(key, value)
        },
        removeItem: (key: string) => {
            data.delete(key)
        },
        clear: () => data.clear(),
        key: (index: number) => Array.from(data.keys())[index] ?? null,
        get length() {
            return data.size
        },
    } as Storage
}

describe("local key stats sync", () => {
    it("merges stats additively by key", () => {
        expect(mergeKeyStats(
            [{ key: "r", attempts: 2, correct: 1 }],
            [
                { key: "r", attempts: 3, correct: 2 },
                { key: "t", attempts: 1, correct: 1 },
            ],
        )).toEqual([
            { key: "r", attempts: 5, correct: 3 },
            { key: "t", attempts: 1, correct: 1 },
        ])
    })

    it("caps a key at the rolling window, preserving accuracy (ADR-0005)", () => {
        const merged = mergeKeyStats(
            [{ key: "x", attempts: 480, correct: 384 }], // 80% accuracy
            [{ key: "x", attempts: 120, correct: 96 }],
        )
        // Uncapped sum would be 600/480; the 500/600 scale keeps 80% intact.
        expect(merged).toEqual([{ key: "x", attempts: KEY_ATTEMPT_CAP, correct: 400 }])
    })

    it("clamps impossible correct counts while reading", () => {
        const fakeStorage = storage()
        fakeStorage.setItem(LOCAL_KEY_STATS_KEY, JSON.stringify([{ key: "a", attempts: 2, correct: 5 }]))

        expect(readLocalKeyStats(fakeStorage)).toEqual([{ key: "a", attempts: 2, correct: 2 }])
    })

    it("adds to existing local stats and clears them", () => {
        const fakeStorage = storage()

        expect(writeLocalKeyStats([{ key: "e", attempts: 1, correct: 1 }], fakeStorage)).toBe(true)
        expect(addLocalKeyStats([{ key: "e", attempts: 2, correct: 1 }], fakeStorage)).toBe(true)
        expect(readLocalKeyStats(fakeStorage)).toEqual([{ key: "e", attempts: 3, correct: 2 }])

        expect(clearLocalKeyStats(fakeStorage)).toBe(true)
        expect(readLocalKeyStats(fakeStorage)).toEqual([])
    })
})
