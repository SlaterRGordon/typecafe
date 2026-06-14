// Per-key accuracy heatmap primitive: the pure data + color math behind the
// <KeyHeatmap> component. React-free and unit-testable so the same shading drives
// the Practice keyboard, the score-card mini heatmap (this phase), and the
// /progress keyboard later (Phase 3) without any of them reaching into Practice
// internals.

import { interpolateColor } from "~/utils/convertColor"
import type { KeystrokeEvent } from "./keystrokes"

// The alphabet keyboard rows the heatmap renders, in visual order. Matches the
// original Practice stats view (three letter rows + a space bar handled
// separately by the component).
export const HEATMAP_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const
export const HEATMAP_SPACE = " "

// Per-key tally — the single shape every data source (live session refs,
// localStorage aggregates, a decoded test timeline) reduces to.
export interface KeyAttempt {
    attempts: number,
    correct: number,
}

export interface HeatmapCell {
    key: string,
    // 0–100, rounded. Defaults to 100 for keys the user hasn't typed, so untyped
    // keys read as "fine" rather than alarming red — the original Practice
    // behavior.
    accuracy: number,
    attempts: number,
    hasData: boolean,
}

// Turn a per-key tally into a renderable cell. Missing/zero-attempt keys are
// reported as 100% with hasData=false so callers can dim them if they choose.
export function heatmapCell(key: string, source?: KeyAttempt): HeatmapCell {
    const attempts = source?.attempts ?? 0
    const correct = source?.correct ?? 0
    const hasData = attempts > 0
    const accuracy = hasData ? Math.round((correct / attempts) * 100) : 100
    return { key, accuracy, attempts, hasData }
}

// Accuracy (0–100) → color along the theme gradient from `lowColor` (weak keys)
// to `highColor` (strong keys). Mirrors the original Practice interpolation
// exactly, so every heatmap in the app reads identically.
export function accuracyColor(accuracy: number, lowColor: string, highColor: string): string {
    const pct = Math.min(Math.max(accuracy, 0), 100) / 100
    return interpolateColor(lowColor, highColor, pct)
}

// Roll a single test's keystroke timeline into per-key attempts for a this-test
// heatmap (the score card). Alphabetic keys fold to lowercase so capitalized
// variants light up their base letter on the keyboard; space stays itself.
export function attemptsFromEvents(events: KeystrokeEvent[]): Map<string, KeyAttempt> {
    const byKey = new Map<string, KeyAttempt>()
    for (const event of events) {
        const key = /^[A-Za-z]$/.test(event.key) ? event.key.toLowerCase() : event.key
        const entry = byKey.get(key) ?? { attempts: 0, correct: 0 }
        entry.attempts += 1
        if (event.correct) entry.correct += 1
        byKey.set(key, entry)
    }
    return byKey
}

// Normalize either accepted data shape to a lookup. Lets the component accept a
// Map (live refs) or a plain object (serialized aggregates) interchangeably.
export function lookupAttempt(
    source: ReadonlyMap<string, KeyAttempt> | Record<string, KeyAttempt>,
    key: string,
): KeyAttempt | undefined {
    if (source instanceof Map) return source.get(key)
    return (source as Record<string, KeyAttempt>)[key]
}
