import { describe, expect, it } from "vitest"
import { DEFAULT_LAYOUT, LAYOUTS, keyStagesFor, rowsFor } from "./keyboardLayout"
import { HEATMAP_ROWS } from "./heatmap"
import { levels } from "~/components/typer/train/levels"

const VOWELS = "aeiou"
const sorted = (s: string) => s.split("").sort().join("")

describe("rowsFor", () => {
    it("qwerty is the heatmap's board", () => {
        expect(rowsFor("qwerty")).toEqual([...HEATMAP_ROWS])
    })

    it("unknown layouts fall back to qwerty", () => {
        expect(rowsFor("corrupt-storage-value")).toEqual(rowsFor(DEFAULT_LAYOUT))
    })

    it("every layout permutes the same glyph set on the same board shape", () => {
        const qwerty = rowsFor("qwerty")
        for (const layout of LAYOUTS) {
            const rows = rowsFor(layout)
            expect(rows).toHaveLength(4)
            // Same cell count per row (the board shape) …
            rows.forEach((row, i) => expect(row).toHaveLength(qwerty[i]!.length))
            // … and the same glyphs overall — this is what keeps heatmap.ts's
            // shift pairs and foldToPhysicalKey layout-independent.
            expect(sorted(rows.join(""))).toBe(sorted(qwerty.join("")))
        }
    })

    it("every layout has 26 distinct letters", () => {
        for (const layout of LAYOUTS) {
            const letters = rowsFor(layout).join("").split("").filter((ch) => /[a-z]/.test(ch))
            expect(new Set(letters).size).toBe(26)
            expect(letters).toHaveLength(26)
        }
    })
})

describe("keyStagesFor", () => {
    it("qwerty reproduces the hand-authored ladder stages (as key sets)", () => {
        // The stages the live ladder actually uses, in introduction order.
        const ladderStages = [...new Set(levels.map((level) => level.keys))]
        const derived = keyStagesFor("qwerty")
        expect(derived).toHaveLength(ladderStages.length)
        derived.forEach((stage, i) => expect(sorted(stage)).toBe(sorted(ladderStages[i]!)))
    })

    it("every layout climbs home-row-out to all 26 letters", () => {
        for (const layout of LAYOUTS) {
            const stages = keyStagesFor(layout)
            const homeLetters = new Set(rowsFor(layout)[2]!.split("").filter((ch) => /[a-z]/.test(ch)))

            expect(stages).toHaveLength(11)
            const first = stages[0]!
            // Stage 1 is the resting fingers: home-row letters only, and enough
            // of them to generate words (Practice's floor: 6+ keys, a vowel and
            // a consonant).
            expect(first.split("").every((ch) => homeLetters.has(ch))).toBe(true)
            expect(first.length).toBeGreaterThanOrEqual(6)
            expect(first.split("").some((ch) => VOWELS.includes(ch))).toBe(true)
            expect(first.split("").some((ch) => !VOWELS.includes(ch))).toBe(true)

            // Stages are cumulative and never repeat a key.
            for (let i = 1; i < stages.length; i++) {
                expect(stages[i]!.startsWith(stages[i - 1]!)).toBe(true)
            }
            const finalKeys = stages[stages.length - 1]!
            expect(new Set(finalKeys).size).toBe(finalKeys.length)

            // The full alphabet arrives by the final stage — exactly 26, so
            // withLanguageAccents (keys.length < 26 guard) still fires on it.
            expect(sorted(finalKeys)).toBe("abcdefghijklmnopqrstuvwxyz")
        }
    })
})
