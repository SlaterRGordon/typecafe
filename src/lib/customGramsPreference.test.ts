import { describe, expect, it } from "vitest"
import {
    addRecentCustomGram,
    emptyCustomGramsPreference,
    mergeCustomGramsPreferences,
    parseCustomGramsPreference,
    RECENT_CUSTOM_GRAMS_LIMIT,
    updateCustomGramsSetup,
} from "./customGramsPreference"
import {
    clearPendingCustomGramsPreference,
    CUSTOM_GRAMS_PREFERENCE_STORAGE_KEY,
    readPendingCustomGramsPreference,
    writePendingCustomGramsPreference,
} from "./customGramsPreferences"

function memoryStorage() {
    const values = new Map<string, string>()
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        value: (key: string) => values.get(key),
    }
}

describe("Custom Grams preference", () => {
    it("chooses the newest whole setup while merging Recent timestamps independently", () => {
        const account = updateCustomGramsSetup(
            addRecentCustomGram(emptyCustomGramsPreference("english"), "th", 30),
            { grams: ["th"], durationSeconds: 60, textStyle: "varied" },
            100,
        )
        const guest = updateCustomGramsSetup(
            addRecentCustomGram(emptyCustomGramsPreference("english"), "er", 20),
            { grams: ["er", "ing"], durationSeconds: 120, textStyle: "pseudo" },
            200,
        )

        const merged = mergeCustomGramsPreferences("english", account, guest)

        expect(merged.entries).toEqual([
            { gram: "th", lastUsedAt: 30 },
            { gram: "er", lastUsedAt: 20 },
        ])
        expect(merged.setup).toEqual({
            grams: ["er", "ing"],
            durationSeconds: 120,
            infinite: false,
            textStyle: "pseudo",
            updatedAt: 200,
        })
    })

    it("stores complete versioned setups independently for each guest language", () => {
        const storage = memoryStorage()
        const english = updateCustomGramsSetup(emptyCustomGramsPreference("english"), {
            grams: ["th"], durationSeconds: 30, textStyle: "varied",
        }, 10)
        const french = updateCustomGramsSetup(emptyCustomGramsPreference("french"), {
            grams: ["éé"], durationSeconds: 240, textStyle: "pseudo",
        }, 20)

        writePendingCustomGramsPreference(english, storage)
        writePendingCustomGramsPreference(french, storage)

        expect(readPendingCustomGramsPreference("english", storage).setup).toEqual(english.setup)
        expect(readPendingCustomGramsPreference("french", storage).setup).toEqual(french.setup)
        expect(JSON.parse(storage.value(CUSTOM_GRAMS_PREFERENCE_STORAGE_KEY)!)).toMatchObject({ version: 2 })

        clearPendingCustomGramsPreference("english", storage)
        expect(readPendingCustomGramsPreference("english", storage).setup).toBeNull()
        expect(readPendingCustomGramsPreference("french", storage).setup).toEqual(french.setup)
    })

    it("keeps whole Words in guest Recent entries and saved mixed setups", () => {
        const storage = memoryStorage()
        const snapshot = updateCustomGramsSetup(
            addRecentCustomGram(emptyCustomGramsPreference("english"), "L’esprit", 30),
            { grams: ["th", "l'esprit", "co-operate"], durationSeconds: 60, textStyle: "pseudo" },
            40,
        )

        writePendingCustomGramsPreference(snapshot, storage)
        expect(readPendingCustomGramsPreference("english", storage)).toMatchObject({
            entries: [{ gram: "l'esprit", lastUsedAt: 30 }],
            setup: { grams: ["th", "l'esprit", "co-operate"], textStyle: "pseudo" },
        })
    })

    it("normalizes, deduplicates, reorders, and caps Recent Grams without touching setup", () => {
        let snapshot = updateCustomGramsSetup(emptyCustomGramsPreference("english"), {
            grams: ["th"], durationSeconds: 60, textStyle: "varied",
        }, 50)
        for (let index = 0; index <= RECENT_CUSTOM_GRAMS_LIMIT; index += 1) {
            snapshot = addRecentCustomGram(snapshot, `a${String.fromCharCode(97 + index)}`, index + 1)
        }
        snapshot = addRecentCustomGram(snapshot, " AC ", 30)

        expect(snapshot.entries).toHaveLength(RECENT_CUSTOM_GRAMS_LIMIT)
        expect(snapshot.entries[0]).toEqual({ gram: "ac", lastUsedAt: 30 })
        expect(snapshot.entries.filter(({ gram }) => gram === "ac")).toHaveLength(1)
        expect(snapshot.setup?.updatedAt).toBe(50)
    })

    it("repairs invalid saved setup fields and upgrades version-one Recent data", () => {
        expect(parseCustomGramsPreference({
            version: 2,
            language: "english",
            entries: [],
            setup: { grams: ["x"], durationSeconds: 45, textStyle: "dense", updatedAt: 7 },
        }, "english").setup).toEqual({
            grams: ["th", "the", "tion"], durationSeconds: 45, infinite: false, textStyle: "varied", updatedAt: 7,
        })
        expect(parseCustomGramsPreference({
            version: 1,
            language: "english",
            entries: [{ gram: " TH ", lastUsedAt: 9 }],
        }, "english")).toEqual({
            version: 2,
            language: "english",
            entries: [{ gram: "th", lastUsedAt: 9 }],
            setup: null,
        })
    })

    it("is idempotent and never lets a stale setup timestamp replace a newer tuple", () => {
        const current = updateCustomGramsSetup(emptyCustomGramsPreference("english"), {
            grams: ["th"], durationSeconds: 240, textStyle: "pseudo",
        }, 20)
        const stale = updateCustomGramsSetup(emptyCustomGramsPreference("english"), {
            grams: ["er"], durationSeconds: 30, textStyle: "varied",
        }, 10)
        const merged = mergeCustomGramsPreferences("english", current, stale)

        expect(merged.setup).toEqual(current.setup)
        expect(mergeCustomGramsPreferences("english", merged, stale)).toEqual(merged)
    })
})
