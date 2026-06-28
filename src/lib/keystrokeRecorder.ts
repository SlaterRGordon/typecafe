// The keystroke recorder owns the single source of truth for one test attempt:
// the raw event log, plus the derived timeline / counts / per-character attempts.
// Typer used to keep these as four parallel refs updated across two components;
// concentrating them here makes the recording semantics (especially backspace)
// unit-testable without mounting Typer.
//
// Forward keystroke: append() records the committed key (events), advances the
// net character count (timeline + characterCount), and tallies the per-character
// attempt. Backspace: backspace() only walks the net count back — it never
// rewrites the event log or the attempt tallies, matching what diagnosis wants
// (the keys the user actually committed to) and what the live counters showed.

import type { Keystroke } from "./stats"
import type { KeystrokeEvent } from "./keystrokes"

export interface KeystrokeBundle {
    events: KeystrokeEvent[]
    timeline: Keystroke[]
    characterCount: number
    incorrectCount: number
    charAttempts: Map<string, { attempts: number, correct: number }>
}

export interface KeystrokeRecorder {
    append(expected: string, correct: boolean, t?: number): void
    backspace(t?: number): void
    reset(): void
    readonly events: KeystrokeEvent[]
    readonly timeline: Keystroke[]
    readonly charAttempts: Map<string, { attempts: number, correct: number }>
    readonly characterCount: number
    readonly incorrectCount: number
    finalize(): KeystrokeBundle
}

export function createKeystrokeRecorder(): KeystrokeRecorder {
    let events: KeystrokeEvent[] = []
    let timeline: Keystroke[] = []
    let charAttempts = new Map<string, { attempts: number, correct: number }>()
    // Per-position correctness, so backspace can undo an incorrect mark exactly
    // once (mirrors Text's charStates map).
    let charStates: ("correct" | "incorrect" | undefined)[] = []
    let position = 0
    let incorrect = 0

    return {
        append(expected, correct, t = Date.now()) {
            events.push({ key: expected, correct, t })
            position += 1
            timeline.push({ t, chars: position })
            charStates[position - 1] = correct ? "correct" : "incorrect"
            if (!correct) incorrect += 1

            const entry = charAttempts.get(expected) ?? { attempts: 0, correct: 0 }
            entry.attempts += 1
            if (correct) entry.correct += 1
            charAttempts.set(expected, entry)
        },
        backspace(t = Date.now()) {
            if (position === 0) return
            position -= 1
            timeline.push({ t, chars: position })
            if (charStates[position] === "incorrect") incorrect = Math.max(incorrect - 1, 0)
            charStates[position] = undefined
        },
        reset() {
            events = []
            timeline = []
            charAttempts = new Map()
            charStates = []
            position = 0
            incorrect = 0
        },
        get events() { return events },
        get timeline() { return timeline },
        get charAttempts() { return charAttempts },
        get characterCount() { return position },
        get incorrectCount() { return incorrect },
        finalize() {
            return {
                events,
                timeline,
                characterCount: position,
                incorrectCount: incorrect,
                charAttempts,
            }
        },
    }
}
