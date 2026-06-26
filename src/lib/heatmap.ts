// Per-key accuracy heatmap primitive: the pure data + color math behind the
// <KeyHeatmap> component. React-free and unit-testable so the same shading drives
// the Practice keyboard, the score-card mini heatmap (this phase), and the
// /progress keyboard later (Phase 3) without any of them reaching into Practice
// internals.

import { interpolateColor } from "~/utils/convertColor"
import type { KeystrokeEvent } from "./keystrokes"

// The physical keyboard rows the heatmap renders, in visual order: the full ANSI
// shape — number row, three letter rows extended with the punctuation/bracket
// cluster, and a space bar handled separately by the component. Every typed
// character folds onto one of these physical keys (see foldToPhysicalKey), so the
// map reads as one cell per real key. The bracket/equals keys ([ ] \ = ) are
// display-only filler for keyboard fidelity: nothing generates text for them, so
// they read as neutral "no data" until a user actually hits one.
export const HEATMAP_ROWS = ["1234567890-=\\", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"] as const
export const HEATMAP_SPACE = " "

// Shifted glyphs fold onto the physical key that produces them (Shift is a
// motion, not a cell): symbols on the number row drop to their digit, and the
// punctuation/bracket-cluster shifts drop to their base key.
const SHIFT_MAP: Record<string, string> = {
    "!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
    "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "_": "-", "+": "=",
    ":": ";", "\"": "'", "<": ",", ">": ".", "?": "/",
    "{": "[", "}": "]", "|": "\\",
}

const PHYSICAL_KEYS = new Set(`${HEATMAP_ROWS.join("")}${HEATMAP_SPACE}`.split(""))

// Reverse of SHIFT_MAP: the glyph produced by holding Shift on a base key
// (1→!, ;→:, /→?, ,→<, ...). Drives the heatmap's shift layer so each cell can
// show its shifted twin's own accuracy instead of folding the two together.
const SHIFT_GLYPH: Record<string, string> = Object.fromEntries(
    Object.entries(SHIFT_MAP).map(([shifted, base]) => [base, shifted]),
)

// The glyph shown when the Shift layer is active: uppercase for letters, the
// shifted twin for number-row/punctuation keys, or the key itself when it has no
// shifted variant (space). The inverse of foldToPhysicalKey for display.
export function shiftedGlyph(key: string): string {
    if (/^[a-z]$/.test(key)) return key.toUpperCase()
    return SHIFT_GLYPH[key] ?? key
}

// Map a typed character onto the physical key that produced it: letters fold to
// lowercase, shifted symbols to their base key, plain keys pass through, and
// anything off this keyboard (tab, accented chars, etc.) returns null so callers
// can skip it. The single source of truth for "which cell does this char belong to".
export function foldToPhysicalKey(char: string): string | null {
    if (/^[A-Za-z]$/.test(char)) return char.toLowerCase()
    if (char in SHIFT_MAP) return SHIFT_MAP[char]!
    return PHYSICAL_KEYS.has(char) ? char : null
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
export function attemptsFromEvents(events: KeystrokeEvent[]): Map<string, KeyAttempt> {
    const byKey = new Map<string, KeyAttempt>()
    for (const event of events) {
        const key = foldToPhysicalKey(event.key)
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
): Map<string, KeyAttempt> {
    const out = new Map<string, KeyAttempt>()
    const entries = isAttemptMap(source) ? source.entries() : Object.entries(source)
    for (const [char, value] of entries) {
        const key = foldToPhysicalKey(char)
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
