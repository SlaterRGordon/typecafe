import { describe, expect, it } from "vitest"
import { formatStat } from "./format"

describe("formatStat", () => {
    it("trims to at most 2 decimals, dropping trailing zeros", () => {
        expect(formatStat(84)).toBe("84")
        expect(formatStat(84.5)).toBe("84.5")
        expect(formatStat(84.50)).toBe("84.5")
        expect(formatStat(84.52)).toBe("84.52")
        expect(formatStat(84.567)).toBe("84.57")
        expect(formatStat(12.716666666)).toBe("12.72")
        expect(formatStat(0)).toBe("0")
    })

    it("guards non-finite input", () => {
        expect(formatStat(NaN)).toBe("0")
        expect(formatStat(Infinity)).toBe("0")
    })
})
