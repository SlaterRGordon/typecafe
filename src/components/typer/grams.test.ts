import { describe, expect, it } from "vitest"
import { gramPassesThresholds } from "./grams"

describe("gram progression", () => {
    it("advances after correctly completing a one-character word", () => {
        expect(gramPassesThresholds({
            promptText: "a",
            characterCount: 1,
            speed: 0,
            durationSeconds: 0,
            accuracy: 100,
            wpmThreshold: 20,
            accuracyThreshold: 100,
        })).toBe(true)
    })
})
