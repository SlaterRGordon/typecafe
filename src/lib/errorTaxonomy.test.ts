import { describe, expect, it } from "vitest"
import { classifyErrors } from "./errorTaxonomy"
import type { KeystrokeEvent } from "./keystrokes"

const ALPHA = "abcdefghijklmnopqrstuvwxyz"

// Non-repeating expected keys (so doubled-letter detection doesn't fire) with
// the given wrong positions.
function seq(length: number, wrong: number[], gapMs = 100): KeystrokeEvent[] {
    const w = new Set(wrong)
    return Array.from({ length }, (_, i) => ({ key: ALPHA[i % 26]!, correct: !w.has(i), t: i * gapMs }))
}

function fromKeys(keys: string, wrong: number[], gapMs = 100): KeystrokeEvent[] {
    const w = new Set(wrong)
    return keys.split("").map((key, i) => ({ key, correct: !w.has(i), t: i * gapMs }))
}

describe("classifyErrors", () => {
    it("returns null below the keystroke/error floor", () => {
        expect(classifyErrors(seq(10, [1, 2]))).toBeNull()
        expect(classifyErrors(seq(40, [1]))).toBeNull()
    })

    it("flags a post-error spiral when errors cluster", () => {
        const finding = classifyErrors(seq(40, [10, 11, 13, 15]))
        expect(finding?.class).toBe("post-error-spiral")
        expect(finding?.action.href).toContain("mode=practice")
    })

    it("flags fatigue fade when the last quartile is much worse", () => {
        // Errors only in the final quartile, spread out so they don't spiral.
        const finding = classifyErrors(seq(40, [31, 35, 39]))
        expect(finding?.class).toBe("fatigue-fade")
    })

    it("flags doubled-letter errors and names the keys", () => {
        // Doubled pairs with the second of each early pair wrong.
        const finding = classifyErrors(fromKeys("aabbccddee".repeat(4), [1, 3, 5, 7, 9]))
        expect(finding?.class).toBe("doubled-letter")
        expect(finding?.action.href).toMatch(/keys=/)
    })

    it("returns null when errors are scattered with no dominant pattern", () => {
        const finding = classifyErrors(seq(40, [4, 12, 24, 34]))
        expect(finding).toBeNull()
    })
})
