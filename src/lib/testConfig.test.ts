import { describe, expect, it } from "vitest"
import { isFiniteTimedSeconds, normalizeTimedSeconds } from "./testConfig"

describe("timed seconds policy", () => {
    it("accepts only integer seconds in the shared finite range", () => {
        expect([1, 15, 120, 3_600].every(isFiniteTimedSeconds)).toBe(true)
        expect([0, 3_601, 1.5, "60"].some(isFiniteTimedSeconds)).toBe(false)
    })

    it("matches Home's parse-and-clamp behavior", () => {
        expect(normalizeTimedSeconds("0", 60)).toBe(1)
        expect(normalizeTimedSeconds("3601", 60)).toBe(3_600)
        expect(normalizeTimedSeconds("12.8", 60)).toBe(12)
        expect(normalizeTimedSeconds("", 60)).toBe(60)
    })
})
