import { describe, expect, it } from "vitest"
import { addLocalTransitions, readLocalTransitions, LOCAL_TRANSITIONS_KEY } from "./localTransitions"

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

describe("localTransitions", () => {
    it("adds and merges aggregates by pair", () => {
        const s = fakeStorage()
        addLocalTransitions([{ pair: "th", count: 2, totalMs: 400, errors: 1 }], "qwerty", s)
        addLocalTransitions([{ pair: "th", count: 3, totalMs: 600, errors: 0 }, { pair: "br", count: 1, totalMs: 300, errors: 0 }], "qwerty", s)
        const all = readLocalTransitions("qwerty", s)
        expect(all.find((a) => a.pair === "th")).toMatchObject({ count: 5, totalMs: 1000, errors: 1 })
        expect(all.find((a) => a.pair === "br")!.count).toBe(1)
    })

    it("drops corrupt entries on read", () => {
        const s = fakeStorage()
        s.setItem(LOCAL_TRANSITIONS_KEY, JSON.stringify([
            { pair: "th", count: 2, totalMs: 400, errors: 0 },
            { pair: "TH", count: 1, totalMs: 100, errors: 0 }, // not lowercase letters
            { pair: "x", count: 1, totalMs: 100, errors: 0 }, // wrong length
            { pair: "ab", count: -1, totalMs: 100, errors: 0 }, // negative
        ]))
        expect(readLocalTransitions("qwerty", s)).toEqual([{ pair: "th", count: 2, totalMs: 400, errors: 0 }])
    })

    it("returns [] for missing storage", () => {
        expect(readLocalTransitions("qwerty", fakeStorage())).toEqual([])
    })
})
