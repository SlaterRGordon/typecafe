import { describe, expect, it } from "vitest"
import { detectPlateau, projectTrajectory, type Goal } from "./trajectory"
import type { ProgressRecord } from "./progress"

const NOW = new Date("2026-06-15T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

function rec(daysAgo: number, wpm: number): ProgressRecord {
    return { wpm, accuracy: 95, createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS) }
}

// A clean +1 WPM/day line ending at ~70 now (60 thirty days ago).
const rising = Array.from({ length: 31 }, (_, i) => rec(30 - i, 40 + i))

describe("projectTrajectory", () => {
    it("fits a rising trend and projects the target date", () => {
        const goal: Goal = { targetWpm: 100, targetDate: new Date(NOW.getTime() + 60 * DAY_MS) }
        const t = projectTrajectory(rising, goal, NOW)
        expect(t.enoughData).toBe(true)
        expect(t.currentWpm).toBeCloseTo(70, 0)
        expect(t.slopePerDay).toBeCloseTo(1, 3)
        // 30 WPM gap at 1/day → ~30 days out.
        expect(t.daysToTarget).toBeCloseTo(30, 0)
        // Reaches it in 30 days, deadline is 60 → on track.
        expect(t.onTrack).toBe(true)
        expect(t.reachesTargetOn!.getTime()).toBeCloseTo(NOW.getTime() + 30 * DAY_MS, -6)
    })

    it("is honest when the pace misses the deadline", () => {
        // Target 100 by 10 days out, but ~30 days needed.
        const goal: Goal = { targetWpm: 100, targetDate: new Date(NOW.getTime() + 10 * DAY_MS) }
        const t = projectTrajectory(rising, goal, NOW)
        expect(t.onTrack).toBe(false)
        expect(t.requiredSlopePerDay).toBeCloseTo(3, 1) // 30 gap / 10 days
        expect(t.requiredSlopePerDay! > t.slopePerDay).toBe(true)
    })

    it("never reaches the target on a flat/falling trend", () => {
        const flat = Array.from({ length: 10 }, (_, i) => rec(10 - i, 65))
        const goal: Goal = { targetWpm: 90, targetDate: new Date(NOW.getTime() + 30 * DAY_MS) }
        const t = projectTrajectory(flat, goal, NOW)
        expect(t.slopePerDay).toBeCloseTo(0, 3)
        expect(t.reachesTargetOn).toBeNull()
        expect(t.daysToTarget).toBeNull()
        expect(t.onTrack).toBe(false)
    })

    it("treats an already-met target as on track", () => {
        const goal: Goal = { targetWpm: 50, targetDate: new Date(NOW.getTime() + 30 * DAY_MS) }
        const t = projectTrajectory(rising, goal, NOW)
        expect(t.gapWpm).toBeLessThan(0)
        expect(t.daysToTarget).toBe(0)
        expect(t.onTrack).toBe(true)
    })

    it("reports not-enough-data for a single point", () => {
        const goal: Goal = { targetWpm: 100, targetDate: new Date(NOW.getTime() + 30 * DAY_MS) }
        const t = projectTrajectory([rec(1, 70)], goal, NOW)
        expect(t.enoughData).toBe(false)
        expect(t.currentWpm).toBe(70)
        expect(t.requiredSlopePerDay).toBeCloseTo((100 - 70) / 30, 3)
    })

    it("has a null required pace once the deadline has passed", () => {
        const goal: Goal = { targetWpm: 100, targetDate: new Date(NOW.getTime() - 1 * DAY_MS) }
        const t = projectTrajectory(rising, goal, NOW)
        expect(t.daysToDeadline).toBeLessThan(0)
        expect(t.requiredSlopePerDay).toBeNull()
    })
})

describe("detectPlateau", () => {
    it("is not plateaued on a clearly rising trend", () => {
        const p = detectPlateau(rising, NOW)
        expect(p.enoughData).toBe(true)
        expect(p.plateaued).toBe(false)
    })

    it("flags a flat trend over the last 3 weeks", () => {
        // ~70 WPM every other day for 20 days, with small noise (no real slope).
        const flat = Array.from({ length: 10 }, (_, i) => rec(20 - i * 2, 70 + (i % 2 === 0 ? 0.4 : -0.4)))
        const p = detectPlateau(flat, NOW)
        expect(p.plateaued).toBe(true)
        expect(p.weeks).toBeGreaterThanOrEqual(3)
    })

    it("reports a longer plateau when the flat stretch extends back", () => {
        // 8 weeks of flat ~70 WPM.
        const flat = Array.from({ length: 28 }, (_, i) => rec(56 - i * 2, 70 + (i % 2 === 0 ? 0.3 : -0.3)))
        const p = detectPlateau(flat, NOW)
        expect(p.plateaued).toBe(true)
        expect(p.weeks).toBeGreaterThan(3)
    })

    it("is insufficient with too few recent tests", () => {
        const p = detectPlateau([rec(5, 70), rec(2, 70)], NOW)
        expect(p.enoughData).toBe(false)
        expect(p.plateaued).toBe(false)
    })
})
