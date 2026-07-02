import { describe, expect, it } from "vitest"
import { smartDrillSelection } from "./drillKeys"

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
})
