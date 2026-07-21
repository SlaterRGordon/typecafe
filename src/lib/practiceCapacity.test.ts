import { describe, expect, it } from "vitest"
import { practiceWordCapacity } from "./practiceCapacity"

describe("practiceWordCapacity", () => {
    it.each([
        [30, 175],
        [60, 350],
        [120, 700],
        [240, 1_400],
    ] as const)("budgets enough deterministic prompt material for a %d-second run", (durationSeconds, words) => {
        expect(practiceWordCapacity(durationSeconds)).toBe(words)
    })
})
