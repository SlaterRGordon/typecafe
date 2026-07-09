import { describe, expect, it } from "vitest"
import {
    accuracyColor,
    attemptsFromEvents,
    foldAttempts,
    foldToPhysicalKey,
    heatmapCell,
    lookupAttempt,
    shiftedGlyph,
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

describe("foldToPhysicalKey", () => {
    it("folds capitals onto their base letter", () => {
        expect(foldToPhysicalKey("R")).toBe("r")
        expect(foldToPhysicalKey("a")).toBe("a")
    })

    it("folds shifted symbols onto their physical key", () => {
        expect(foldToPhysicalKey("!")).toBe("1")
        expect(foldToPhysicalKey("?")).toBe("/")
        expect(foldToPhysicalKey(":")).toBe(";")
        expect(foldToPhysicalKey("\"")).toBe("'")
        expect(foldToPhysicalKey("_")).toBe("-")
    })

    it("folds shifted bracket/equals keys onto their display-only base key", () => {
        expect(foldToPhysicalKey("+")).toBe("=")
        expect(foldToPhysicalKey("{")).toBe("[")
        expect(foldToPhysicalKey("}")).toBe("]")
        expect(foldToPhysicalKey("|")).toBe("\\")
    })

    it("passes through plain keys, brackets and space", () => {
        expect(foldToPhysicalKey("5")).toBe("5")
        expect(foldToPhysicalKey(".")).toBe(".")
        expect(foldToPhysicalKey("[")).toBe("[")
        expect(foldToPhysicalKey("=")).toBe("=")
        expect(foldToPhysicalKey(" ")).toBe(" ")
    })

    it("returns null for off-keyboard characters", () => {
        expect(foldToPhysicalKey("\t")).toBeNull()
        expect(foldToPhysicalKey("é")).toBeNull()
    })
})

describe("shiftedGlyph", () => {
    it("uppercases letters", () => {
        expect(shiftedGlyph("r")).toBe("R")
        expect(shiftedGlyph("a")).toBe("A")
    })

    it("maps number-row and punctuation keys to their shifted twin", () => {
        expect(shiftedGlyph("1")).toBe("!")
        expect(shiftedGlyph("/")).toBe("?")
        expect(shiftedGlyph(";")).toBe(":")
        expect(shiftedGlyph("'")).toBe("\"")
        expect(shiftedGlyph("-")).toBe("_")
        expect(shiftedGlyph(",")).toBe("<")
    })

    it("is the inverse of foldToPhysicalKey for shifted keys", () => {
        for (const base of "1234567890-=;',./[]\\") {
            expect(foldToPhysicalKey(shiftedGlyph(base))).toBe(base)
        }
    })

    it("returns the key itself when it has no shifted variant", () => {
        expect(shiftedGlyph(" ")).toBe(" ")
    })
})

describe("foldAttempts", () => {
    it("sums variants that share a physical key", () => {
        const folded = foldAttempts({
            r: { attempts: 3, correct: 2 },
            R: { attempts: 1, correct: 1 },
            "1": { attempts: 2, correct: 2 },
            "!": { attempts: 1, correct: 0 },
        })
        expect(folded.get("r")).toEqual({ attempts: 4, correct: 3 })
        expect(folded.get("1")).toEqual({ attempts: 3, correct: 2 })
    })

    it("reads from a Map and drops off-keyboard chars", () => {
        const folded = foldAttempts(new Map([
            ["t", { attempts: 1, correct: 1 }],
            ["\t", { attempts: 5, correct: 5 }],
        ]))
        expect(folded.get("t")).toEqual({ attempts: 1, correct: 1 })
        expect(folded.has("\t")).toBe(false)
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

describe("layout threading", () => {
    const ev = (key: string, correct: boolean): KeystrokeEvent => ({ key, correct, t: 0 })

    it("foldToPhysicalKey resolves national glyphs only under their layout", () => {
        expect(foldToPhysicalKey("ü", "qwertz-de")).toBe("ü")
        expect(foldToPhysicalKey("ü")).toBeNull()
    })

    it("shiftedGlyph reads the layout's authored shift layer", () => {
        expect(shiftedGlyph("ß", "qwertz-de")).toBe("?")
    })

    it("attemptsFromEvents tallies ü/Ü on the ü cell under qwertz-de, skips them by default", () => {
        const events = [ev("ü", true), ev("Ü", false)]
        const de = attemptsFromEvents(events, "qwertz-de")
        expect(de.get("ü")).toEqual({ attempts: 2, correct: 1 })
        expect(attemptsFromEvents(events).size).toBe(0)
    })

    it("foldAttempts sums ü/Ü on the ü cell under qwertz-de, drops them by default", () => {
        const source = { "ü": { attempts: 2, correct: 1 }, "Ü": { attempts: 1, correct: 1 } }
        const de = foldAttempts(source, "qwertz-de")
        expect(de.get("ü")).toEqual({ attempts: 3, correct: 2 })
        expect(foldAttempts(source).size).toBe(0)
    })
})
