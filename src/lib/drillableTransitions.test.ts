import { describe, expect, it } from "vitest"
import { isTrackableTransitionPair, trackableTransitionPairs } from "./drillableTransitions"

describe("trackableTransitionPairs", () => {
    it("derives Unicode Transition eligibility from the active language corpus", () => {
        const french = trackableTransitionPairs(["ça", "façade", "été", "étés"])

        expect(isTrackableTransitionPair("ça", french)).toBe(true)
        expect(isTrackableTransitionPair("ét", french)).toBe(true)
        expect(isTrackableTransitionPair("br", french)).toBe(false)
    })
})
