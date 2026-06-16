import { describe, expect, it } from "vitest"
import { computeStance } from "./stance"
import type { ProgressRecord } from "./progress"

const NOW = new Date("2026-06-15T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

function rec(daysAgo: number, wpm: number, accuracy: number, consistency?: number): ProgressRecord {
    return { wpm, accuracy, consistency, createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS) }
}

describe("computeStance", () => {
    it("is insufficient with too few recent tests", () => {
        const result = computeStance([rec(1, 70, 90), rec(2, 71, 91)], NOW)
        expect(result.enoughData).toBe(false)
        expect(result.stance).toBe("balanced")
    })

    it("flags accuracy-limited when accuracy is low and WPM is flat", () => {
        // ~91% accuracy, flat WPM across both windows.
        const records = [
            rec(40, 70, 91), rec(35, 70, 90),
            rec(20, 70, 91), rec(15, 70, 92), rec(10, 70, 90), rec(5, 70, 91), rec(2, 70, 92),
        ]
        const result = computeStance(records, NOW)
        expect(result.stance).toBe("accuracy-limited")
        expect(result.advice).toMatch(/slow down/i)
    })

    it("does not nag about accuracy when WPM is clearly improving", () => {
        // Low accuracy but rising fast (prior window ~60, current ~75).
        const records = [
            rec(40, 58, 91), rec(35, 60, 90),
            rec(20, 72, 91), rec(15, 74, 90), rec(10, 75, 92), rec(5, 76, 91), rec(2, 78, 90),
        ]
        const result = computeStance(records, NOW)
        expect(result.stance).toBe("balanced")
    })

    it("flags confidence-limited when accuracy is high but consistency is low", () => {
        const records = Array.from({ length: 7 }, (_, i) => rec(20 - i * 2, 80, 99, 60))
        const result = computeStance(records, NOW)
        expect(result.stance).toBe("confidence-limited")
        expect(result.advice).toMatch(/push the pace/i)
    })

    it("stays balanced when high accuracy is also consistent", () => {
        const records = Array.from({ length: 7 }, (_, i) => rec(20 - i * 2, 80, 99, 90))
        const result = computeStance(records, NOW)
        expect(result.stance).toBe("balanced")
    })

    it("treats missing consistency as not-bursty (no false confidence-limited)", () => {
        const records = Array.from({ length: 7 }, (_, i) => rec(20 - i * 2, 80, 99))
        const result = computeStance(records, NOW)
        expect(result.stance).toBe("balanced")
    })
})
