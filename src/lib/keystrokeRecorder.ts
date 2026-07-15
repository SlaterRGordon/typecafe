// The keystroke recorder owns the single source of truth for one test attempt:
// the raw event log, plus the derived timeline / counts / per-character attempts.
// Typer used to keep these as four parallel refs updated across two components;
// concentrating them here makes the recording semantics (especially backspace)
// unit-testable without mounting Typer.
//
// Forward keystroke: append() records the analytics event and persisted evidence,
// advances the net character count, and tallies the per-character attempt.
// Backspace records persisted evidence and walks the net count back, but never
// rewrites forward analytics or attempt tallies.

import type { Keystroke } from "./stats"
import type { KeystrokeEvent, TestEvidenceEvent } from "./keystrokes"

export interface KeystrokeBundle {
    events: KeystrokeEvent[]
    evidence: TestEvidenceEvent[]
    timeline: Keystroke[]
    characterCount: number
    incorrectCount: number
    charAttempts: Map<string, { attempts: number, correct: number }>
}

export interface KeystrokeRecorder {
    append(expected: string, typed: string, correct: boolean, t?: number): void
    backspace(t?: number): void
    reset(): void
    readonly events: KeystrokeEvent[]
    readonly evidence: TestEvidenceEvent[]
    readonly timeline: Keystroke[]
    readonly charAttempts: Map<string, { attempts: number, correct: number }>
    readonly characterCount: number
    readonly incorrectCount: number
    finalize(): KeystrokeBundle
}

export function createKeystrokeRecorder(): KeystrokeRecorder {
    let events: KeystrokeEvent[] = []
    let evidence: TestEvidenceEvent[] = []
    let timeline: Keystroke[] = []
    let charAttempts = new Map<string, { attempts: number, correct: number }>()
    // Per-position correctness, so backspace can undo an incorrect mark exactly
    // once (mirrors Text's charStates map).
    let charStates: ("correct" | "incorrect" | undefined)[] = []
    let position = 0
    let incorrect = 0

    return {
        append(expected, typed, correct, t = Date.now()) {
            const event = { key: expected, typed, correct, t }
            events.push(event)
            evidence.push(event)
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
            evidence.push({ action: "backspace", t })
            position -= 1
            timeline.push({ t, chars: position })
            if (charStates[position] === "incorrect") incorrect = Math.max(incorrect - 1, 0)
            charStates[position] = undefined
        },
        reset() {
            events = []
            evidence = []
            timeline = []
            charAttempts = new Map()
            charStates = []
            position = 0
            incorrect = 0
        },
        get events() { return events },
        get evidence() { return evidence },
        get timeline() { return timeline },
        get charAttempts() { return charAttempts },
        get characterCount() { return position },
        get incorrectCount() { return incorrect },
        finalize() {
            return {
                events,
                evidence,
                timeline,
                characterCount: position,
                incorrectCount: incorrect,
                charAttempts,
            }
        },
    }
}
