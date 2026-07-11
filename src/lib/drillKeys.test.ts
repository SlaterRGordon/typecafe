import { describe, expect, it } from "vitest"
import { isDrillableOn, isPracticeLetter, isPracticeVowel, remapPracticeSelectionByPosition, repairPracticeSelection, smartDrillSelection } from "./drillKeys"

const entry = (attempts: number, correct: number) => ({ attempts, correct })

describe("smartDrillSelection", () => {
    it("returns null without enough typing data", () => {
        expect(smartDrillSelection(new Map())).toBeNull()
        // Under the 3-attempt floor, or perfectly accurate - nothing weak to drill.
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

describe("isDrillableOn", () => {
    it("accepts ASCII drillables and the language's accents typeable on the layout", () => {
        expect(isDrillableOn("r", "qwerty", [])).toBe(true)
        expect(isDrillableOn("5", "qwerty", [])).toBe(true)
        expect(isDrillableOn("?", "qwerty", [])).toBe(true)
        // Case-folds: a weak capital follows its base key.
        expect(isDrillableOn("R", "qwerty", [])).toBe(true)
        // ü is a real cap on QWERTZ (DE) when German declares it an accent…
        expect(isDrillableOn("ü", "qwertz-de", ["ü", "ö", "ä"])).toBe(true)
    })

    it("rejects keys outside the current language or layout", () => {
        // …but not part of the active (English) language,
        expect(isDrillableOn("ü", "qwertz-de", [])).toBe(false)
        // and not typeable at all on plain QWERTY even when the language has it.
        expect(isDrillableOn("ü", "qwerty", ["ü"])).toBe(false)
        // Symbols outside the drillable set never surface.
        expect(isDrillableOn("€", "qwertz-de", [])).toBe(false)
    })
})

describe("remapPracticeSelectionByPosition", () => {
    it("keeps selection on the same caps and preserves digit/mark categories", () => {
        // QWERTY a→AZERTY q and z→w are same physical caps. QWERTY `2`
        // becomes the target cap's shifted `1`; shifted `/` becomes the `!` mark.
        const remapped = remapPracticeSelectionByPosition(
            ["a", "s", "d", "f", "g", "h", "j", "k", "z", "2", "?"],
            "qwerty",
            "azerty-fr",
            [],
        )

        expect(remapped).toEqual(expect.arrayContaining(["q", "w", "1", "!"]))
    })

    it("repairs an otherwise vowel-less remap into a typeable Practice pool", () => {
        const remapped = remapPracticeSelectionByPosition(
            ["a", "s", "d", "f", "g", "h", "j", "k"],
            "qwerty",
            "azerty-fr",
            [],
        )
        const keys = repairPracticeSelection(remapped, "azerty-fr", [])
        const letters = keys.filter(isPracticeLetter)

        expect(letters.length).toBeGreaterThanOrEqual(8)
        expect(letters.filter(isPracticeVowel).length).toBeGreaterThanOrEqual(2)
        expect(letters.some((key) => !isPracticeVowel(key))).toBe(true)
    })
})
