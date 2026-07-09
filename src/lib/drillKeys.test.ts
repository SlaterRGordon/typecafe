import { describe, expect, it } from "vitest"
import { isPracticeLetter, isPracticeVowel, smartDrillSelection } from "./drillKeys"

const entry = (attempts: number, correct: number) => ({ attempts, correct })

describe("smartDrillSelection", () => {
    it("returns null without enough typing data", () => {
        expect(smartDrillSelection(new Map())).toBeNull()
        // Under the 3-attempt floor, or perfectly accurate — nothing weak to drill.
        expect(smartDrillSelection(new Map([["a", entry(2, 0)]]))).toBeNull()
        expect(smartDrillSelection(new Map([["a", entry(50, 50)]]))).toBeNull()
    })

    it("keeps the weak letters, pads to eight, and balances vowels/consonants", () => {
        const keys = smartDrillSelection(new Map([
            ["q", entry(10, 5)],
            ["z", entry(10, 6)],
        ]))
        expect(keys).not.toBeNull()
        const letters = keys!.filter((key) => /^[a-z]$/.test(key))
        expect(letters).toContain("q")
        expect(letters).toContain("z")
        expect(letters).toHaveLength(8)
        expect(letters.filter((key) => "aeiou".includes(key)).length).toBeGreaterThanOrEqual(2)
        expect(letters.filter((key) => !"aeiou".includes(key)).length).toBeGreaterThanOrEqual(1)
    })

    it("carries weak digits and marks along as extras, ignoring undrillable keys", () => {
        const keys = smartDrillSelection(new Map([
            ["r", entry(10, 5)],
            ["7", entry(10, 4)],
            [",", entry(10, 3)],
            ["R", entry(10, 0)], // capitals fold to their base key elsewhere; not drillable here
        ]))
        expect(keys).toContain("7")
        expect(keys).toContain(",")
        expect(keys).not.toContain("R")
    })

    it("keeps weak accent letters in the word-building anchor pool", () => {
        const attempts = new Map([
            ["é", entry(10, 1)], // very weak
            ["q", entry(10, 5)],
            ["z", entry(10, 6)],
        ])
        const keys = smartDrillSelection(attempts, ["é"])!

        // The accent displaces padding as a word-building letter instead of
        // being appended as a non-letter extra.
        expect(keys).toHaveLength(8)
        expect(keys.slice(0, 8)).toContain("é")
        expect(keys.filter(isPracticeLetter)).toHaveLength(8)
        expect(keys).toContain("q")
        expect(keys).toContain("z")
    })
})

describe("practice letter classification", () => {
    it("normalizes representative accented vowels and keeps other Unicode letters consonants", () => {
        for (const key of ["ü", "é", "ą"]) {
            expect(isPracticeLetter(key)).toBe(true)
            expect(isPracticeVowel(key)).toBe(true)
        }

        for (const key of ["ß", "ç", "ł", "ñ"]) {
            expect(isPracticeLetter(key)).toBe(true)
            expect(isPracticeVowel(key)).toBe(false)
        }
    })

    it("rejects non-letter, multi-character, and uppercase keys", () => {
        for (const key of ["7", "^", "éé", "É"]) {
            expect(isPracticeLetter(key)).toBe(false)
        }
    })
})
