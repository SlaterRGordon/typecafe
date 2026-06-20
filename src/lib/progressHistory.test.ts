import { describe, expect, it } from "vitest"
import { appendLocalProgress, clearLocalProgress, readLocalProgress } from "./progressHistory"

// Minimal in-memory Storage stand-in (no jsdom needed).
function fakeStorage(): Storage {
    const map = new Map<string, string>()
    return {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => void map.set(k, v),
        removeItem: (k) => void map.delete(k),
        clear: () => map.clear(),
        key: () => null,
        length: 0,
    } as Storage
}

describe("progressHistory", () => {
    it("appends and reads back entries in order", () => {
        const s = fakeStorage()
        appendLocalProgress({ wpm: 60, accuracy: 95, t: 1 }, s)
        appendLocalProgress({ wpm: 70, accuracy: 96, t: 2 }, s)
        expect(readLocalProgress(s).map((e) => e.wpm)).toEqual([60, 70])
    })

    it("drops corrupt entries on read (user-editable storage)", () => {
        const s = fakeStorage()
        s.setItem("typecafe:progressHistory", JSON.stringify([
            { wpm: 60, accuracy: 95, t: 1 },
            { wpm: "fast", accuracy: 95, t: 2 },
            { nope: true },
        ]))
        expect(readLocalProgress(s)).toEqual([{ wpm: 60, accuracy: 95, t: 1 }])
    })

    it("returns [] for missing or non-array storage", () => {
        const s = fakeStorage()
        expect(readLocalProgress(s)).toEqual([])
        s.setItem("typecafe:progressHistory", "{}")
        expect(readLocalProgress(s)).toEqual([])
    })

    it("caps the list at 1000 newest entries", () => {
        const s = fakeStorage()
        for (let i = 0; i < 1005; i++) appendLocalProgress({ wpm: i, accuracy: 95, t: i }, s)
        const all = readLocalProgress(s)
        expect(all).toHaveLength(1000)
        expect(all[0]!.wpm).toBe(5)
        expect(all.at(-1)!.wpm).toBe(1004)
    })

    it("clears imported entries after a successful sync", () => {
        const s = fakeStorage()
        appendLocalProgress({ wpm: 60, accuracy: 95, t: 1 }, s)
        clearLocalProgress(s)
        expect(readLocalProgress(s)).toEqual([])
    })
})
