import { describe, expect, it } from "vitest"
import type { SkillCandidate } from "./skillEvidence"
import { effectivePracticeKeyboardLayer, initialPracticeKeys, nextStickyPracticeLayer } from "./practiceKeyboard"

function keyCandidate(key: string, impactMsPer1000: number): SkillCandidate {
    return {
        id: `key:accuracy:${key}`,
        target: { kind: "key", keys: [key], metric: "accuracy" },
        metric: "%",
        direction: "higher",
        observed: 80,
        baseline: 95,
        sampleCount: 12,
        distinctTests: 2,
        distinctWords: 4,
        frequencyPer1000: 20,
        confidence: 1,
        recencyWeight: 1,
        impactMsPer1000,
        reason: { code: "key_accuracy_below_threshold", key, accuracyPct: 80, errorRatePct: 20 },
    }
}

describe("initialPracticeKeys", () => {
    it("restores supported saved focus before natural evidence", () => {
        expect(initialPracticeKeys(["x", "q"], [keyCandidate("r", 900)], {}, "qwerty")).toEqual(["x", "q"])
    })

    it("chooses the highest-Impact supported key when no focus is saved", () => {
        expect(initialPracticeKeys(
            [],
            [keyCandidate("é", 1_200), keyCandidate("r", 900)],
            { r: { attempts: 12, correct: 9 } },
            "qwerty",
        )).toEqual(["r"])
    })

    it("starts empty without a supported natural key candidate", () => {
        expect(initialPracticeKeys([], [keyCandidate("r", 900)], {}, "qwerty")).toEqual([])
    })
})

describe("Practice keyboard layers", () => {
    it("keeps Shift and AltGr sticky choices mutually exclusive", () => {
        expect(nextStickyPracticeLayer("base", "shift")).toBe("shift")
        expect(nextStickyPracticeLayer("shift", "altgr")).toBe("altgr")
        expect(nextStickyPracticeLayer("altgr", "altgr")).toBe("base")
    })

    it("lets held modifiers temporarily override and combine above the sticky choice", () => {
        expect(effectivePracticeKeyboardLayer("shift", false, false)).toBe("shift")
        expect(effectivePracticeKeyboardLayer("shift", false, true)).toBe("altgr")
        expect(effectivePracticeKeyboardLayer("altgr", true, false)).toBe("shift")
        expect(effectivePracticeKeyboardLayer("base", true, true)).toBe("shiftAltgr")
    })
})
