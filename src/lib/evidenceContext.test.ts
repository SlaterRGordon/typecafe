import { describe, expect, it } from "vitest"
import {
    discoversWeakness,
    EVIDENCE_CONTEXTS,
    evidenceContextForCoachingStep,
    evidenceContextForRun,
    evidenceContextForStoredTest,
    provesMastery,
    provesTransfer,
    updatesTargetResponse,
} from "./evidenceContext"

describe("evidence context", () => {
    it("translates existing typing surfaces without changing Test mode ids", () => {
        expect(evidenceContextForRun({ surface: "test", mode: 0 })).toBe("natural")
        expect(evidenceContextForRun({ surface: "test", mode: 2 })).toBe("grams")
        expect(evidenceContextForRun({ surface: "drill", mode: 0 })).toBe("acquisition")
        expect(evidenceContextForRun({ surface: "train", mode: 0 })).toBe("train")
    })

    it("freezes known Coaching steps into their honest contexts", () => {
        expect(evidenceContextForCoachingStep("baseline")).toBe("natural")
        expect(evidenceContextForCoachingStep("calibration")).toBe("diagnostic")
        expect(evidenceContextForCoachingStep("focus")).toBe("acquisition")
        expect(evidenceContextForCoachingStep("recheck")).toBe("cold")
    })

    it("classifies only legacy ranked normal Tests as natural", () => {
        expect(evidenceContextForStoredTest({ storedContext: null, ranked: true, mode: 0 })).toBe("natural")
        expect(evidenceContextForStoredTest({ storedContext: null, ranked: false, mode: 0 })).toBeNull()
        expect(evidenceContextForStoredTest({ storedContext: null, ranked: true, mode: 4 })).toBeNull()
        expect(evidenceContextForStoredTest({ storedContext: "broken", ranked: true, mode: 0 })).toBeNull()
        expect(evidenceContextForStoredTest({ storedContext: "transfer", ranked: false, mode: 0 })).toBe("transfer")
    })

    it("keeps discovery, response, Transfer, and Mastery proof distinct", () => {
        expect(EVIDENCE_CONTEXTS.filter(discoveriesWeakness)).toEqual(["natural", "diagnostic"])
        expect(EVIDENCE_CONTEXTS.filter(updatesTargetResponse)).toEqual(["acquisition", "transfer", "cold"])
        expect(provesTransfer("transfer")).toBe(true)
        expect(provesMastery("transfer")).toBe(false)
        expect(provesMastery("cold")).toBe(true)
        expect(provesMastery(null)).toBe(false)
    })
})

function discoveriesWeakness(context: typeof EVIDENCE_CONTEXTS[number]) {
    return discoversWeakness(context)
}
