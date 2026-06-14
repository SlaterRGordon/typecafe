import { describe, expect, it } from "vitest"
import {
    accuracyColor,
    attemptsFromEvents,
    heatmapCell,
    lookupAttempt,
} from "./heatmap"
import type { KeystrokeEvent } from "./keystrokes"

describe("heatmapCell", () => {
    it("reports 100% with hasData=false for an untyped key", () => {
        const cell = heatmapCell("q")
        expect(cell).toEqual({ key: "q", accuracy: 100, attempts: 0, hasData: false })
    })

    it("rounds accuracy from attempts and marks hasData", () => {
        const cell = heatmapCell("r", { attempts: 3, correct: 2 })
        expect(cell.accuracy).toBe(67)
        expect(cell.attempts).toBe(3)
        expect(cell.hasData).toBe(true)
    })

    it("treats a zero-attempt tally as no data", () => {
        expect(heatmapCell("t", { attempts: 0, correct: 0 }).hasData).toBe(false)
    })
})

describe("accuracyColor", () => {
    it("returns the low color at 0% and the high color at 100%", () => {
        expect(accuracyColor(0, "#ff0000", "#00ff00")).toBe("#ff0000")
        expect(accuracyColor(100, "#ff0000", "#00ff00")).toBe("#00ff00")
    })

    it("clamps out-of-range accuracy to the endpoints", () => {
        expect(accuracyColor(-50, "#ff0000", "#00ff00")).toBe("#ff0000")
        expect(accuracyColor(150, "#ff0000", "#00ff00")).toBe("#00ff00")
    })
})

describe("attemptsFromEvents", () => {
    const ev = (key: string, correct: boolean): KeystrokeEvent => ({ key, correct, t: 0 })

    it("tallies attempts and correct counts per key", () => {
        const attempts = attemptsFromEvents([ev("r", true), ev("r", false), ev("t", true)])
        expect(attempts.get("r")).toEqual({ attempts: 2, correct: 1 })
        expect(attempts.get("t")).toEqual({ attempts: 1, correct: 1 })
    })

    it("folds capitalized letters onto their base key but leaves space alone", () => {
        const attempts = attemptsFromEvents([ev("R", true), ev("r", false), ev(" ", true)])
        expect(attempts.get("r")).toEqual({ attempts: 2, correct: 1 })
        expect(attempts.get(" ")).toEqual({ attempts: 1, correct: 1 })
    })
})

describe("lookupAttempt", () => {
    it("reads from a Map", () => {
        const map = new Map([["r", { attempts: 1, correct: 1 }]])
        expect(lookupAttempt(map, "r")).toEqual({ attempts: 1, correct: 1 })
        expect(lookupAttempt(map, "z")).toBeUndefined()
    })

    it("reads from a plain record", () => {
        const record = { r: { attempts: 2, correct: 0 } }
        expect(lookupAttempt(record, "r")).toEqual({ attempts: 2, correct: 0 })
        expect(lookupAttempt(record, "z")).toBeUndefined()
    })
})
