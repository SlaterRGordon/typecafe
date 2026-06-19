import { describe, expect, it } from "vitest"
import { localChallengeStatus, readLocalChallengeHistory, recordLocalChallenge } from "./challengeHistory"

function storageStub(initial?: string): Storage {
    const values = new Map<string, string>()
    if (initial) values.set("typecafe:challengeHistory", initial)
    return {
        get length() { return values.size },
        clear: () => values.clear(),
        getItem: (key) => values.get(key) ?? null,
        key: (index) => Array.from(values.keys())[index] ?? null,
        removeItem: (key) => { values.delete(key) },
        setItem: (key, value) => { values.set(key, value) },
    }
}

describe("challengeHistory", () => {
    it("validates local challenge history on read", () => {
        const storage = storageStub(JSON.stringify([
            { dateKey: "2026-06-16", wpm: 72, accuracy: 98, t: 100 },
            { dateKey: "bad", wpm: 72, accuracy: 98, t: 100 },
            { dateKey: "2026-06-17", wpm: "fast", accuracy: 98, t: 100 },
        ]))

        expect(readLocalChallengeHistory(storage)).toEqual([
            { dateKey: "2026-06-16", wpm: 72, accuracy: 98, t: 100 },
        ])
    })

    it("keeps one entry per day, replacing old attempts", () => {
        const storage = storageStub()
        recordLocalChallenge({ dateKey: "2026-06-16", wpm: 70, accuracy: 95, t: 100 }, storage)
        recordLocalChallenge({ dateKey: "2026-06-16", wpm: 75, accuracy: 96, t: 200 }, storage)

        expect(readLocalChallengeHistory(storage)).toEqual([
            { dateKey: "2026-06-16", wpm: 75, accuracy: 96, t: 200 },
        ])
    })

    it("derives today, yesterday, and the current streak", () => {
        const entries = [
            { dateKey: "2026-06-14", wpm: 60, accuracy: 95, t: 1 },
            { dateKey: "2026-06-15", wpm: 62, accuracy: 96, t: 2 },
            { dateKey: "2026-06-16", wpm: 64, accuracy: 97, t: 3 },
        ]

        expect(localChallengeStatus("2026-06-16", entries)).toEqual({
            today: entries[2],
            yesterday: entries[1],
            streak: 3,
        })
    })
})
