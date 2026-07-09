// Per-key accuracy heatmap primitive: the pure data + color math behind the
// <KeyHeatmap> component. React-free and unit-testable so the same shading drives
// the Practice keyboard, the score-card mini heatmap (this phase), and the
// /progress keyboard later (Phase 3) without any of them reaching into Practice
// internals.

import { interpolateColor } from "~/utils/convertColor"
import type { KeystrokeEvent } from "./keystrokes"
import { DEFAULT_LAYOUT, glyphAt, keyFor, rowsFor } from "./keyboardLayout"

// The physical keyboard rows the heatmap renders, in visual order: the full ANSI
// shape — number row, three letter rows extended with the punctuation/bracket
// cluster, and a space bar handled separately by the component. Every typed
// character folds onto one of these physical keys (see foldToPhysicalKey), so the
// map reads as one cell per real key. The bracket/equals keys ([ ] \ = ) are
// display-only filler for keyboard fidelity: nothing generates text for them, so
// they read as neutral "no data" until a user actually hits one.
// Key geometry (rows, layers, folding) lives in keyboardLayout.ts — this file
// keeps the accuracy math and delegates every "where is this key" question.
// The qwerty default on the layout params below preserves pre-geometry callers
// byte-for-byte; boards thread the active layout starting with ledger slice 4.
export const HEATMAP_ROWS = rowsFor(DEFAULT_LAYOUT)
export const HEATMAP_SPACE = " "

// The glyph shown when the Shift layer is active: uppercase for letters, the
// shifted twin for number-row/punctuation keys, or the key itself when it has no
// shifted variant (space). The inverse of foldToPhysicalKey for display.
export function shiftedGlyph(key: string, layout = DEFAULT_LAYOUT): string {
    return glyphAt(key, "shift", layout)
}

// Map a typed character onto the physical key that produced it: letters fold to
// lowercase, shifted symbols to their base key, plain keys pass through, and
// dead-key composed chars fold onto their dead key's cell (ê → ^). Anything
// off this keyboard (tab, etc.) returns null so callers can skip it. Delegates
// to the geometry module's keyFor — the single source of truth for "which
// cell does this char belong to".
export function foldToPhysicalKey(char: string, layout = DEFAULT_LAYOUT): string | null {
    return keyFor(char, layout)
}

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

function isAttemptMap(
    source: ReadonlyMap<string, KeyAttempt> | Record<string, KeyAttempt>,
): source is ReadonlyMap<string, KeyAttempt> {
    const candidate = source as Partial<ReadonlyMap<string, KeyAttempt>>
    return typeof candidate.get === "function"
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
// heatmap (the score card). Every key folds onto its physical key (capitals →
// base letter, shifted symbols → base key); off-keyboard chars are skipped.
export function attemptsFromEvents(events: KeystrokeEvent[], layout = DEFAULT_LAYOUT): Map<string, KeyAttempt> {
    const byKey = new Map<string, KeyAttempt>()
    for (const event of events) {
        const key = keyFor(event.key, layout)
        if (!key) continue
        const entry = byKey.get(key) ?? { attempts: 0, correct: 0 }
        entry.attempts += 1
        if (event.correct) entry.correct += 1
        byKey.set(key, entry)
    }
    return byKey
}

// Fold a per-char tally (Map or record, keyed by the raw typed character) onto
// physical keys, summing variants that share a key (r + R, 1 + !). The one
// read-time primitive the lifetime heatmap, smart drill, and key selection share.
export function foldAttempts(
    source: ReadonlyMap<string, KeyAttempt> | Record<string, KeyAttempt>,
    layout = DEFAULT_LAYOUT,
): Map<string, KeyAttempt> {
    const out = new Map<string, KeyAttempt>()
    const entries = isAttemptMap(source) ? source.entries() : Object.entries(source)
    for (const [char, value] of entries) {
        const key = keyFor(char, layout)
        if (!key) continue
        const entry = out.get(key) ?? { attempts: 0, correct: 0 }
        entry.attempts += value.attempts
        entry.correct += value.correct
        out.set(key, entry)
    }
    return out
}

// Normalize either accepted data shape to a lookup. Lets the component accept a
// Map (live refs) or a plain object (serialized aggregates) interchangeably.
export function lookupAttempt(
    source: ReadonlyMap<string, KeyAttempt> | Record<string, KeyAttempt>,
    key: string,
): KeyAttempt | undefined {
    if (isAttemptMap(source)) return source.get(key)
    return source[key]
}
