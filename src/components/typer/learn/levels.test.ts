import { describe, expect, it } from "vitest"
import { TestSubModes } from "~/components/typer/types"
import { levels } from "./levels"

describe("generated Learn ladder", () => {
    it("builds 100 sequentially named levels", () => {
        expect(levels).toHaveLength(100)
        expect(levels[0]!.name).toBe("Level 1")
        expect(levels[99]!.name).toBe("Level 100")
    })

    it("places a boss on every 10th level and nowhere else", () => {
        const bosses = levels.filter((l) => l.kind === "boss").map((l) => l.name)
        expect(bosses).toEqual(
            Array.from({ length: 10 }, (_, i) => `Level ${(i + 1) * 10}`),
        )
    })

    it("follows the block-of-10 kind rhythm (speed @4, noMiss @7)", () => {
        expect(levels[3]!.kind).toBe("speed")   // Level 4
        expect(levels[6]!.kind).toBe("noMiss")  // Level 7
        expect(levels[13]!.kind).toBe("speed")  // Level 14
        expect(levels[16]!.kind).toBe("noMiss") // Level 17
        expect(levels[0]!.kind).toBe("keys")
    })

    it("marks speed rounds as timed and everything else as words", () => {
        expect(levels[3]!.subMode).toBe(TestSubModes.timed)
        expect(levels[0]!.subMode).toBe(TestSubModes.words)
        expect(levels[9]!.subMode).toBe(TestSubModes.words) // boss
    })

    it("introduces keys progressively then holds the full alphabet", () => {
        expect(levels[0]!.keys).toBe("asdfjkl")
        expect(levels[99]!.keys).toBe("qwertyuiopasdfghjklzxcvbnm")
        // never shrinks as you climb
        for (let i = 1; i < levels.length; i++) {
            expect(levels[i]!.keys.length).toBeGreaterThanOrEqual(levels[i - 1]!.keys.length)
        }
    })

    it("ramps word count from 10 and gives bosses a longer run", () => {
        expect(levels[0]!.count).toBe(10)
        expect(levels[9]!.count).toBe(60) // boss
        const keysLevels = levels.filter((l) => l.kind === "keys")
        const last = keysLevels[keysLevels.length - 1]!
        expect(last.count).toBeGreaterThan(levels[0]!.count)
    })
})
