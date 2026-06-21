import { describe, expect, it } from "vitest"
import { ACTIVITY_DAYS, buildActivityCalendar } from "./activity"

const NOW = new Date("2026-06-21T12:00:00.000Z")
const dayMs = 86_400_000

describe("buildActivityCalendar", () => {
    it("always spans a full year ending today, sorted oldest→newest", () => {
        const { data, total } = buildActivityCalendar([], NOW)
        expect(data).toHaveLength(ACTIVITY_DAYS)
        expect(total).toBe(0)
        expect(data.every((d) => d.level === 0 && d.count === 0)).toBe(true)
        expect(data[data.length - 1]!.date).toBe("2026-06-21")
        // Strictly ascending unique dates (react-activity-calendar requires order).
        for (let i = 1; i < data.length; i++) {
            expect(data[i]!.date > data[i - 1]!.date).toBe(true)
        }
    })

    it("counts tests per day and totals only the in-window ones", () => {
        const today = NOW.getTime()
        const timestamps = [
            today, today - 1000, // two today
            today - 3 * dayMs, // one three days ago
            today - 400 * dayMs, // outside the 365-day window → excluded
        ]
        const { data, total } = buildActivityCalendar(timestamps, NOW)
        expect(total).toBe(3)
        expect(data.find((d) => d.date === "2026-06-21")!.count).toBe(2)
        expect(data.find((d) => d.date === "2026-06-18")!.count).toBe(1)
    })

    it("maps counts to the five intensity levels", () => {
        const today = NOW.getTime()
        const make = (n: number, offsetDays: number) =>
            Array.from({ length: n }, (_, i) => today - offsetDays * dayMs - i * 1000)
        const timestamps = [
            ...make(1, 1), // level 1
            ...make(3, 2), // level 2 (>2)
            ...make(5, 3), // level 3 (>4)
            ...make(7, 4), // level 4 (>6)
        ]
        const { data } = buildActivityCalendar(timestamps, NOW)
        const levelOn = (date: string) => data.find((d) => d.date === date)!.level
        expect(levelOn("2026-06-20")).toBe(1)
        expect(levelOn("2026-06-19")).toBe(2)
        expect(levelOn("2026-06-18")).toBe(3)
        expect(levelOn("2026-06-17")).toBe(4)
    })
})
