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
        expect(JSON.parse(s.getItem("typecafe:progressHistory")!)).toEqual([
            { v: 2, wpm: 60, accuracy: 95, t: 1 },
            { v: 2, wpm: 70, accuracy: 96, t: 2 },
        ])
    })

    it("migrates an unversioned raw-WPM entry to canonical net WPM on read", () => {
        const s = fakeStorage()
        s.setItem("typecafe:progressHistory", JSON.stringify([
            { wpm: 100, accuracy: 90, t: 1 },
        ]))
        expect(readLocalProgress(s)).toEqual([{ v: 2, wpm: 80, accuracy: 90, t: 1 }])
    })

    it("drops corrupt entries on read (user-editable storage)", () => {
        const s = fakeStorage()
        s.setItem("typecafe:progressHistory", JSON.stringify([
            { wpm: 60, accuracy: 95, t: 1 },
            { wpm: "fast", accuracy: 95, t: 2 },
            { nope: true },
        ]))
        const [entry] = readLocalProgress(s)
        expect(entry).toMatchObject({ v: 2, accuracy: 95, t: 1 })
        expect(entry!.wpm).toBeCloseTo(54)
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

    it("caps an oversized (hand-edited) storage on read so sync never exceeds the server limit", () => {
        const s = fakeStorage()
        const oversized = Array.from({ length: 1500 }, (_, i) => ({ v: 2, wpm: i, accuracy: 95, t: i }))
        s.setItem("typecafe:progressHistory", JSON.stringify(oversized))
        const all = readLocalProgress(s)
        expect(all).toHaveLength(1000)
        expect(all[0]!.wpm).toBe(500)
        expect(all.at(-1)!.wpm).toBe(1499)
    })

    it("clears imported entries after a successful sync", () => {
        const s = fakeStorage()
        appendLocalProgress({ wpm: 60, accuracy: 95, t: 1 }, s)
        clearLocalProgress(s)
        expect(readLocalProgress(s)).toEqual([])
    })
})
