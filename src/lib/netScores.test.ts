import { describe, expect, it } from "vitest"
import { averageNet, bestNetPerUser, netOf } from "./netScores"

describe("netOf", () => {
    it("derives net WPM from raw speed + accuracy (raw·(2a−1))", () => {
        expect(netOf({ speed: 60, accuracy: 100 })).toBe(60)
        expect(netOf({ speed: 60, accuracy: 90 })).toBeCloseTo(48)
    })

    it("clamps a mostly-wrong run at 0", () => {
        expect(netOf({ speed: 40, accuracy: 50 })).toBe(0)
    })
})

describe("averageNet", () => {
    it("means the net WPM across rows", () => {
        expect(averageNet([{ speed: 60, accuracy: 100 }, { speed: 40, accuracy: 100 }])).toBe(50)
    })

    it("returns null below the minimum sample size", () => {
        const rows = [{ speed: 60, accuracy: 100 }, { speed: 40, accuracy: 100 }]
        expect(averageNet(rows, 3)).toBeNull()
        expect(averageNet(rows, 2)).toBe(50)
    })

    it("returns null for an empty set", () => {
        expect(averageNet([])).toBeNull()
    })
})

describe("bestNetPerUser", () => {
    it("keeps each user's single best run by net WPM, with the full row", () => {
        const rows = [
            { userId: "a", speed: 80, accuracy: 80, label: "a-fast-sloppy" }, // net 48
            { userId: "a", speed: 60, accuracy: 100, label: "a-best" },       // net 60
            { userId: "b", speed: 50, accuracy: 100, label: "b" },            // net 50
        ]
        const best = bestNetPerUser(rows)
        expect(best).toHaveLength(2)
        const byUser = Object.fromEntries(best.map((r) => [r.userId, r.label]))
        expect(byUser).toEqual({ a: "a-best", b: "b" })
    })

    it("on a net tie keeps the first row seen", () => {
        const rows = [
            { userId: "a", speed: 60, accuracy: 100, label: "first" },
            { userId: "a", speed: 60, accuracy: 100, label: "second" },
        ]
        expect(bestNetPerUser(rows)[0]!.label).toBe("first")
    })
})
