import { describe, expect, it } from "vitest"
import { RECAP_INTERVAL_MS, buildRecap, isRecapDue } from "./recap"
import type { ProgressRecord } from "./progress"

const NOW = new Date("2026-06-15T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

function rec(daysAgo: number, wpm: number): ProgressRecord {
    return { wpm, accuracy: 95, createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS) }
}

describe("isRecapDue", () => {
    it("is due when never seen", () => {
        expect(isRecapDue(null, NOW.getTime())).toBe(true)
    })

    it("is due once a week has passed", () => {
        expect(isRecapDue(NOW.getTime() - RECAP_INTERVAL_MS, NOW.getTime())).toBe(true)
    })

    it("is not due within the week", () => {
        expect(isRecapDue(NOW.getTime() - DAY_MS, NOW.getTime())).toBe(false)
    })
})

describe("buildRecap", () => {
    it("summarises the week's delta, tests, streak, and focus key", () => {
        // This week (~0-6 days) avg 72; last week (~7-13) avg 64.
        const records = [
            rec(12, 62), rec(8, 66),
            rec(5, 70), rec(1, 74),
        ]
        const keyAttempts = {
            a: { attempts: 100, correct: 99 },
            b: { attempts: 40, correct: 28 }, // weakest
            e: { attempts: 200, correct: 198 },
        }
        const recap = buildRecap(records, keyAttempts, NOW)
        expect(recap.weekDeltaWpm).toBeCloseTo(8)
        expect(recap.testsThisWeek).toBe(2)
        expect(recap.streak).toBe(1)
        expect(recap.focusKey).toBe("b")
    })

    it("returns a null delta and no focus key with thin data", () => {
        const recap = buildRecap([rec(1, 70)], {}, NOW)
        expect(recap.weekDeltaWpm).toBeNull()
        expect(recap.testsThisWeek).toBe(1)
        expect(recap.focusKey).toBeNull()
    })
})
