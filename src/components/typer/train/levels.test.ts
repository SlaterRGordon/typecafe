import { describe, expect, it } from "vitest"
import { TestSubModes } from "~/components/typer/types"
import { levels, levelsFor, reachableAccentsFor, withLanguageAccents } from "./levels"

const sorted = (s: string) => s.split("").sort().join("")

describe("generated Train ladder", () => {
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
        // The final stage is the full alphabet in introduction order - the key
        // SET is the contract (generation and highlights are set-based).
        expect(sorted(levels[99]!.keys)).toBe("abcdefghijklmnopqrstuvwxyz")
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

describe("withLanguageAccents", () => {
    const accents = ["é", "è", "ç"]

    it("extends full-alphabet levels with the language's accent letters", () => {
        const extended = withLanguageAccents(levels[99]!, accents)
        expect(extended.keys).toBe(levels[99]!.keys + "éèç")
        // Everything else (name, count, kind) is untouched - progress and
        // thresholds key off the name.
        expect(extended).toMatchObject({ name: "Level 100", count: levels[99]!.count, kind: levels[99]!.kind })
    })

    it("leaves key-intro stages pure a-z", () => {
        expect(withLanguageAccents(levels[0]!, accents)).toBe(levels[0]!)
    })

    it("is a no-op for English (no accents)", () => {
        expect(withLanguageAccents(levels[99]!, [])).toBe(levels[99]!)
    })
})

describe("reachableAccentsFor", () => {
    it("keeps German umlauts on QWERTZ but excludes them from a pinned QWERTY board", () => {
        const germanUmlaut = ["ü"]

        expect(reachableAccentsFor(germanUmlaut, "qwertz-de")).toEqual(germanUmlaut)
        expect(reachableAccentsFor(germanUmlaut, "qwerty")).toEqual([])
    })
})

describe("levelsFor", () => {
    it("swaps z/y for qwertz but keeps names, counts and the alphabet", () => {
        const de = levelsFor("qwertz-de")
        expect(de).toHaveLength(100)
        de.forEach((level, i) => {
            expect(level.name).toBe(levels[i]!.name)
            expect(level.count).toBe(levels[i]!.count)
            expect(level.kind).toBe(levels[i]!.kind)
        })
        // t/z arrive together on QWERTZ where qwerty pairs t/y (position spec).
        const tzStage = de.find((level) => level.keys.includes("t"))!
        expect(tzStage.keys).toContain("z")
        expect(sorted(de[99]!.keys)).toBe("abcdefghijklmnopqrstuvwxyz")
    })

    it("returns the cached ladder on repeat calls", () => {
        expect(levelsFor("qwertz-de")).toBe(levelsFor("qwertz-de"))
    })

    it("collapses unknown layouts to the qwerty ladder", () => {
        expect(levelsFor("corrupt-storage-value")).toBe(levels)
    })
})
