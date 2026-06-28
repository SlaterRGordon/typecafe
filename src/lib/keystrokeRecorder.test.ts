import { describe, expect, it } from "vitest"
import { createKeystrokeRecorder } from "./keystrokeRecorder"

// Characterization tests: these pin the exact semantics Typer + Text produced
// across their four parallel refs, so the consolidated recorder stays
// behaviour-for-behaviour identical. Timestamps are injected for determinism.

describe("createKeystrokeRecorder", () => {
    it("records a clean forward run with timeline, counts, events and attempts", () => {
        const r = createKeystrokeRecorder()
        r.append("a", true, 100)
        r.append("b", true, 150)

        expect(r.finalize()).toEqual({
            events: [
                { key: "a", correct: true, t: 100 },
                { key: "b", correct: true, t: 150 },
            ],
            timeline: [
                { t: 100, chars: 1 },
                { t: 150, chars: 2 },
            ],
            characterCount: 2,
            incorrectCount: 1 - 1, // 0, but spelled to show no errors counted
            charAttempts: new Map([
                ["a", { attempts: 1, correct: 1 }],
                ["b", { attempts: 1, correct: 1 }],
            ]),
        })
    })

    it("counts an incorrect keystroke without crediting the attempt", () => {
        const r = createKeystrokeRecorder()
        r.append("a", false, 100)

        expect(r.incorrectCount).toBe(1)
        expect(r.characterCount).toBe(1)
        expect(r.charAttempts.get("a")).toEqual({ attempts: 1, correct: 0 })
    })

    it("walks the count back on backspace but leaves events and attempts intact", () => {
        const r = createKeystrokeRecorder()
        r.append("a", false, 100) // wrong attempt at position 0
        r.backspace(120)
        r.append("a", true, 140) // retype correctly
        r.append("b", true, 160)

        const bundle = r.finalize()
        // Backspace undoes the incorrect count exactly once.
        expect(bundle.incorrectCount).toBe(0)
        expect(bundle.characterCount).toBe(2)
        // Events keep every committed key, including the corrected-away one.
        expect(bundle.events).toEqual([
            { key: "a", correct: false, t: 100 },
            { key: "a", correct: true, t: 140 },
            { key: "b", correct: true, t: 160 },
        ])
        // Timeline records the backspace as a net-count dip.
        expect(bundle.timeline).toEqual([
            { t: 100, chars: 1 },
            { t: 120, chars: 0 },
            { t: 140, chars: 1 },
            { t: 160, chars: 2 },
        ])
        // Attempts accumulate forever — backspace never decrements them.
        expect(bundle.charAttempts.get("a")).toEqual({ attempts: 2, correct: 1 })
        expect(bundle.charAttempts.get("b")).toEqual({ attempts: 1, correct: 1 })
    })

    it("does not decrement incorrect when backspacing over a correct keystroke", () => {
        const r = createKeystrokeRecorder()
        r.append("a", true, 100)
        r.append("b", false, 150)
        r.backspace(160) // undo the wrong 'b'
        r.backspace(170) // undo the correct 'a'

        expect(r.incorrectCount).toBe(0)
        expect(r.characterCount).toBe(0)
    })

    it("ignores a backspace at position zero", () => {
        const r = createKeystrokeRecorder()
        r.backspace(100)
        expect(r.finalize()).toEqual({
            events: [],
            timeline: [],
            characterCount: 0,
            incorrectCount: 0,
            charAttempts: new Map(),
        })
    })

    it("reset clears every capture for the next attempt", () => {
        const r = createKeystrokeRecorder()
        r.append("a", true, 100)
        r.reset()
        expect(r.finalize()).toEqual({
            events: [],
            timeline: [],
            characterCount: 0,
            incorrectCount: 0,
            charAttempts: new Map(),
        })
    })
})
