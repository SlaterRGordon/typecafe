import { describe, expect, it } from "vitest"
import { clampSize, resolveWordKey, ensureSizedLoaded, getSizedWords } from "./utils"

describe("clampSize", () => {
    it("collapses the English-only 25k to 10k for other languages", () => {
        expect(clampSize("french", "25k")).toBe("10k")
        expect(clampSize("english", "25k")).toBe("25k")
        expect(clampSize("french", "5k")).toBe("5k")
    })
})

describe("resolveWordKey", () => {
    it("maps English sizes to their SCOWL file keys (1k is the base key)", () => {
        expect(resolveWordKey("english", "1k")).toBe("english")
        expect(resolveWordKey("english", "5k")).toBe("english5k")
        expect(resolveWordKey("english", "10k")).toBe("english10k")
        expect(resolveWordKey("english", "25k")).toBe("english25k")
    })

    it("keeps other languages on their single list key regardless of size", () => {
        expect(resolveWordKey("french", "1k")).toBe("french")
        expect(resolveWordKey("french", "10k")).toBe("french")
        expect(resolveWordKey("german", "5k")).toBe("german")
    })
})

describe("getSizedWords", () => {
    it("slices a non-English list to the top-N by frequency rank", async () => {
        await ensureSizedLoaded("french", "10k")
        const full = getSizedWords("french", "10k")
        const oneK = getSizedWords("french", "1k")
        const fiveK = getSizedWords("french", "5k")

        expect(oneK).toHaveLength(1000)
        expect(fiveK).toHaveLength(5000)
        // Sizes are nested prefixes of the same ranked list.
        expect(fiveK.slice(0, 1000)).toEqual(oneK)
        expect(full.slice(0, 5000)).toEqual(fiveK)
    })

    it("returns the exact English file for a given size", async () => {
        await ensureSizedLoaded("english", "5k")
        // The 5k SCOWL file is its own curated list, not a slice of a bigger one.
        expect(getSizedWords("english", "5k").length).toBeGreaterThan(1000)
    })
})
