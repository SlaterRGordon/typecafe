// Post-test diagnosis: turns a single test's keystroke timeline + per-key
// attempts into a short list of honest, actionable findings. Pure and React-free
// so it can be unit-tested and reused (score card now, profile/coach later).
//
// Heuristics only (locked constraint: no LLM spend). Every finding carries the
// keys it would have the user drill, so the UI can always end it in a button.

import { aggregateKeyLatency, overallMeanLatency } from "./keystrokes"
import type { KeystrokeEvent } from "./keystrokes"
import type { KeyAccuracy } from "./stats"
import { isDrillableKey } from "./drillKeys"

// Below this many committed keystrokes a test is too short to say anything
// honest — a 2s burst produces noise, not a pattern. The panel shows a
// "too short to diagnose" message instead of inventing findings.
export const MIN_KEYSTROKES_TO_DIAGNOSE = 30

// A key counts as "slow" only when its mean latency is at least this multiple of
// the baseline rhythm — one slightly-slow key isn't worth a finding.
export const SLOW_KEY_RATIO = 1.5
// ...and only with enough hits to be a habit rather than a single fumble.
export const SLOW_KEY_MIN_SAMPLES = 3
// A transition (ordered key pair) needs to recur before its slowness is signal.
export const TRANSITION_MIN_OCCURRENCES = 2
// Findings never name more than a handful of keys — the drill has to stay focused.
export const MAX_KEYS_PER_FINDING = 3
// Toughest-words row names only the few worst words — it's a glance, not a list.
export const MAX_TOUGH_WORDS = 3

export interface SlowKey {
    key: string,
    meanMs: number,
    samples: number,
    // meanMs relative to the baseline rhythm (e.g. 1.8 = 80% slower than usual).
    ratio: number,
}

export interface ToughWord {
    word: string,
    // Mean per-character latency (ms) while typing the word.
    meanMs: number,
    // How many keystrokes in the word were wrong.
    errors: number,
    chars: number,
}

export interface SlowTransition {
    from: string,
    to: string,
    meanMs: number,
    occurrences: number,
}

interface SlowKeysFinding {
    kind: "slow-keys",
    keys: string[],
    detail: SlowKey[],
    // Estimated WPM the user would gain if these keys matched their normal pace.
    wpmCost: number,
    summary: string,
}
interface InaccurateKeysFinding {
    kind: "inaccurate-keys",
    keys: string[],
    detail: KeyAccuracy[],
    summary: string,
}
interface SlowTransitionsFinding {
    kind: "slow-transitions",
    keys: string[],
    detail: SlowTransition[],
    summary: string,
}
interface ToughWordsFinding {
    kind: "tough-words",
    keys: string[],
    detail: ToughWord[],
    summary: string,
}

export type DiagnosisFinding = SlowKeysFinding | InaccurateKeysFinding | SlowTransitionsFinding | ToughWordsFinding

export interface Diagnosis {
    // True when the test was too short to diagnose honestly; findings is empty.
    tooShort: boolean,
    keystrokes: number,
    findings: DiagnosisFinding[],
    // Union of every finding's drillable keys, slow keys first — the target for
    // the headline "Drill these keys" button.
    drillKeys: string[],
}

export interface DiagnoseInput {
    events: KeystrokeEvent[],
    // Least-accurate keys for this test, already aggregated (see
    // worstKeysFromAttempts in stats.ts). Optional so a caller holding only a
    // timeline still gets the latency-based findings.
    worstKeys?: KeyAccuracy[],
    // The user's lifetime mean inter-key latency, when available, so "slow" is
    // judged against their normal pace rather than this test's. Falls back to
    // this test's own mean for guests with no history.
    baselineMeanMs?: number,
}

// Human label for a key in copy: the space bar reads as "space", everything else
// as itself.
export function keyLabel(key: string): string {
    return key === " " ? "space" : key
}

// Which keys a finding can actually send to a drill: lowercase letters, digits,
// and drill marks (incl. the shifted ? ! :), lowercased and de-duplicated, order
// preserved. Capitals fold to their base letter (the shift motion rides on it).
// Space and non-drill glyphs (', /, brackets) are honest to *report* but can't be
// drilled, so they're dropped from the button target.
export function toDrillKeys(keys: string[]): string[] {
    const seen = new Set<string>()
    const drillable: string[] = []
    for (const key of keys) {
        // Fold capitals (A→a); marks/digits lowercase to themselves.
        const folded = key.toLowerCase()
        if (!isDrillableKey(folded)) continue
        if (seen.has(folded)) continue
        seen.add(folded)
        drillable.push(folded)
    }
    return drillable
}

const VOWELS = ["a", "e", "i", "o", "u"]

// Practice text is built from words, which need a vowel — but a weakness set can
// be all consonants (e.g. r, t, b). Guarantee one so the drill produces real
// text; the diagnosed keys stay the focus, a common vowel ("e") is appended only
// when none is present. Mirrors the Practice keyboard's "must include a vowel"
// rule, which the diagnosis → drill handoff would otherwise bypass.
export function withPracticeVowel(keys: string[]): string[] {
    if (keys.length === 0) return keys
    if (keys.some((key) => VOWELS.includes(key))) return keys
    return [...keys, "e"]
}

function effectiveBaseline(events: KeystrokeEvent[], baselineMeanMs?: number): number {
    if (baselineMeanMs != null && baselineMeanMs > 0) return baselineMeanMs
    return overallMeanLatency(events)
}

// Keys whose mean latency runs at least SLOW_KEY_RATIO× the baseline rhythm,
// slowest first, capped to the top few. Below-threshold keys are not patterns.
export function slowestKeys(events: KeystrokeEvent[], baselineMeanMs?: number): SlowKey[] {
    const baseline = effectiveBaseline(events, baselineMeanMs)
    if (baseline <= 0) return []

    return Array.from(aggregateKeyLatency(events).entries())
        .filter(([, value]) => value.samples >= SLOW_KEY_MIN_SAMPLES)
        .map(([key, value]) => {
            const meanMs = value.totalMs / value.samples
            return { key, meanMs, samples: value.samples, ratio: meanMs / baseline }
        })
        .filter((entry) => entry.ratio >= SLOW_KEY_RATIO)
        .sort((a, b) => b.meanMs - a.meanMs)
        .slice(0, MAX_KEYS_PER_FINDING)
}

// Honest "you lost ~N WPM" estimate: recompute WPM with each slow key's latency
// clamped down to the baseline, and report the difference. Only latencies that
// are *above* baseline are clamped — fixing a key never makes you slower — so the
// number is the upside of bringing those keys up to your own normal pace.
export function estimateWpmCost(events: KeystrokeEvent[], slowKeys: SlowKey[], baselineMeanMs?: number): number {
    if (events.length < 2 || slowKeys.length === 0) return 0
    const baseline = effectiveBaseline(events, baselineMeanMs)
    if (baseline <= 0) return 0

    const slowSet = new Set(slowKeys.map((entry) => entry.key))
    let actualMs = 0
    let clampedMs = 0
    for (let i = 1; i < events.length; i++) {
        const dt = Math.max(events[i]!.t - events[i - 1]!.t, 0)
        actualMs += dt
        clampedMs += slowSet.has(events[i]!.key) ? Math.min(dt, baseline) : dt
    }
    if (actualMs <= 0 || clampedMs <= 0) return 0

    const chars = events.length
    const actualWpm = (chars / 5) / (actualMs / 60000)
    const clampedWpm = (chars / 5) / (clampedMs / 60000)
    return Math.max(clampedWpm - actualWpm, 0)
}

// Slowest recurring transitions (ordered key pairs), slowest first. Seeded here;
// expanded into full bigram/trigram coaching in Phase 3.
export function costliestTransitions(events: KeystrokeEvent[]): SlowTransition[] {
    const byPair = new Map<string, { from: string, to: string, totalMs: number, occurrences: number }>()
    for (let i = 1; i < events.length; i++) {
        const from = events[i - 1]!.key
        const to = events[i]!.key
        const dt = Math.max(events[i]!.t - events[i - 1]!.t, 0)
        const pairKey = `${from} ${to}`
        const entry = byPair.get(pairKey) ?? { from, to, totalMs: 0, occurrences: 0 }
        entry.totalMs += dt
        entry.occurrences += 1
        byPair.set(pairKey, entry)
    }

    return Array.from(byPair.values())
        .filter((entry) => entry.occurrences >= TRANSITION_MIN_OCCURRENCES)
        .map((entry) => ({ from: entry.from, to: entry.to, meanMs: entry.totalMs / entry.occurrences, occurrences: entry.occurrences }))
        .sort((a, b) => b.meanMs - a.meanMs)
        .slice(0, MAX_KEYS_PER_FINDING)
}

// Words the user stumbled on: a following space commits a complete word in the
// timeline. The unterminated run at Test end is excluded because the compact
// timeline cannot distinguish a completed final prompt word from a fragment;
// incomplete evidence must not manufacture a Weak Word. Completed occurrences
// of the same prompted word remain eligible. Words are rebuilt from expected
// characters, so a misspelled word still reads as the word it was meant to be.
// Single-char runs are skipped as noise.
export function toughestWords(events: KeystrokeEvent[], baselineMeanMs?: number): ToughWord[] {
    const baseline = effectiveBaseline(events, baselineMeanMs)
    const words: ToughWord[] = []
    let chars = 0, errors = 0, totalMs = 0, letters = ""
    const flush = () => {
        if (chars >= 2) words.push({ word: letters, meanMs: totalMs / chars, errors, chars })
        chars = 0; errors = 0; totalMs = 0; letters = ""
    }
    for (let i = 0; i < events.length; i++) {
        const event = events[i]!
        if (event.key === " ") { flush(); continue }
        chars += 1
        totalMs += i > 0 ? Math.max(event.t - events[i - 1]!.t, 0) : 0
        if (!event.correct) errors += 1
        letters += event.key
    }
    return words
        .filter((word) => word.errors > 0 || (baseline > 0 && word.meanMs >= baseline * SLOW_KEY_RATIO))
        .sort((a, b) => (b.errors - a.errors) || (b.meanMs - a.meanMs))
        .slice(0, MAX_TOUGH_WORDS)
}

function toughWordsSummary(words: ToughWord[]): string {
    return `Toughest words: ${words.map((word) => word.word).join(", ")}.`
}

function slowKeysSummary(slowKeys: SlowKey[], wpmCost: number): string {
    const keys = slowKeys.map((entry) => keyLabel(entry.key)).join(", ")
    const rounded = Math.round(wpmCost)
    if (rounded >= 1) return `You lost ~${rounded} WPM to slow keys: ${keys}.`
    return `Your slowest keys this test: ${keys}.`
}

function inaccurateKeysSummary(worst: KeyAccuracy[]): string {
    const keys = worst.map((entry) => `${keyLabel(entry.key)} (${Math.round(entry.accuracy)}%)`).join(", ")
    return `Least accurate keys: ${keys}.`
}

function transitionsSummary(transitions: SlowTransition[]): string {
    const pairs = transitions.map((entry) => `${keyLabel(entry.from)}→${keyLabel(entry.to)}`).join(", ")
    return `Costliest transitions: ${pairs}.`
}

// Assemble the test's findings. Ordered by leverage: slow keys (the headline
// WPM story) first, then accuracy, then transitions. Each finding ends in keys to
// drill; drillKeys unions them (slow first) for the headline button.
export function diagnose(input: DiagnoseInput): Diagnosis {
    const { events, worstKeys, baselineMeanMs } = input
    const keystrokes = events.length

    if (keystrokes < MIN_KEYSTROKES_TO_DIAGNOSE) {
        return { tooShort: true, keystrokes, findings: [], drillKeys: [] }
    }

    const findings: DiagnosisFinding[] = []
    const drillKeys: string[] = []
    const pushDrillKeys = (keys: string[]) => {
        for (const key of toDrillKeys(keys)) {
            if (!drillKeys.includes(key)) drillKeys.push(key)
        }
    }

    const slowKeys = slowestKeys(events, baselineMeanMs)
    if (slowKeys.length > 0) {
        const wpmCost = estimateWpmCost(events, slowKeys, baselineMeanMs)
        const keys = slowKeys.map((entry) => entry.key)
        findings.push({ kind: "slow-keys", keys, detail: slowKeys, wpmCost, summary: slowKeysSummary(slowKeys, wpmCost) })
        pushDrillKeys(keys)
    }

    const worst = worstKeys ?? []
    if (worst.length > 0) {
        const keys = worst.map((entry) => entry.key)
        findings.push({ kind: "inaccurate-keys", keys, detail: worst, summary: inaccurateKeysSummary(worst) })
        pushDrillKeys(keys)
    }

    const tough = toughestWords(events, baselineMeanMs)
    if (tough.length > 0) {
        // The row drills the letters of those words; kept out of the headline
        // drillKeys so the heatmap stays focused on the slow/inaccurate keys.
        const keys = tough.flatMap((word) => word.word.split(""))
        findings.push({ kind: "tough-words", keys, detail: tough, summary: toughWordsSummary(tough) })
    }

    const transitions = costliestTransitions(events)
    if (transitions.length > 0) {
        const keys = transitions.flatMap((entry) => [entry.from, entry.to])
        findings.push({ kind: "slow-transitions", keys, detail: transitions, summary: transitionsSummary(transitions) })
        pushDrillKeys(keys)
    }

    return { tooShort: false, keystrokes, findings, drillKeys }
}
