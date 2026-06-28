import { describe, expect, it } from "vitest"
import { globalPercentileBrag, personalBestBrag, PERCENTILE_BRAG_THRESHOLD } from "./shareCard"

describe("personalBestBrag", () => {
    it("brags when this run beats every prior run at the config", () => {
        expect(personalBestBrag([50, 62, 58], 65)).toBe("New personal best")
    })

    it("stays silent when a prior run was as fast or faster", () => {
        expect(personalBestBrag([50, 65, 58], 65)).toBeNull()
        expect(personalBestBrag([70], 65)).toBeNull()
    })

    it("a first run at the config is not a best", () => {
        expect(personalBestBrag([], 200)).toBeNull()
    })
})

describe("globalPercentileBrag", () => {
    it("brags only when flattering (at or above the threshold)", () => {
        // 8 of 10 distinct typers are slower → faster-than 80%.
        expect(globalPercentileBrag(2, 10)).toBe("Faster than 80% of typers")
    })

    it("stays silent below the flattering threshold", () => {
        // faster-than 50% — below 60.
        expect(globalPercentileBrag(5, 10)).toBeNull()
    })

    it("brags exactly at the threshold boundary", () => {
        expect(globalPercentileBrag(40, 100)).toBe(`Faster than ${PERCENTILE_BRAG_THRESHOLD}% of typers`)
    })

    it("is silent with no pool to rank against", () => {
        expect(globalPercentileBrag(0, 0)).toBeNull()
    })
})
