// Error taxonomy (Phase 4 §4.2): classify *why* a user misses, from the
// keystroke timeline we already persist, and prescribe one fix. Pure and
// unit-tested. The diagnosis panel picks the single dominant class — never a
// wall of findings.
//
// The persisted timeline (KeystrokeEvent) records the *expected* char, whether
// it was hit, and the timing — but not the wrong char that was typed. So two of
// the doc's classes (adjacent-finger, transposition) need typed-char capture
// that doesn't exist yet and are intentionally out of scope here; the three
// below are robust from correctness + position + the expected sequence.

import type { KeystrokeEvent } from "./keystrokes"

export const TAXONOMY_CONFIG = {
    minKeystrokes: 30,
    minErrors: 3,
    // An error "spirals" when it lands within this many keystrokes of a prior one.
    spiralWindow: 3,
    spiralRatio: 0.5,
    // Quartile accuracy drop that counts as fatigue.
    fatigueDrop: 0.1,
    minQuartile: 5,
    // Share of errors landing on a doubled letter that counts as a pattern.
    doubledShare: 0.3,
    minDoubled: 2,
} as const

export type ErrorClass = "post-error-spiral" | "fatigue-fade" | "doubled-letter"

export interface ErrorFinding {
    class: ErrorClass
    headline: string
    detail: string
    action: { label: string; href: string }
}

function correctRatio(events: KeystrokeEvent[]): number {
    if (events.length === 0) return 1
    return events.filter((e) => e.correct).length / events.length
}

function uniq(values: string[]): string[] {
    return Array.from(new Set(values))
}

// The dominant error pattern, or null when there aren't enough errors to be
// honest or no class clears its threshold (the score card still shows the
// slow/least-accurate keys from diagnosis.ts in that case).
export function classifyErrors(events: KeystrokeEvent[]): ErrorFinding | null {
    const errorIndices = events.flatMap((e, i) => (e.correct ? [] : [i]))
    if (events.length < TAXONOMY_CONFIG.minKeystrokes || errorIndices.length < TAXONOMY_CONFIG.minErrors) {
        return null
    }

    // Post-error spiral: errors clustered right after other errors.
    let spiral = 0
    for (let i = 1; i < errorIndices.length; i++) {
        if (errorIndices[i]! - errorIndices[i - 1]! <= TAXONOMY_CONFIG.spiralWindow) spiral++
    }
    const spiralRatio = spiral / errorIndices.length

    // Fatigue fade: last-quartile accuracy well below the first.
    const q = Math.floor(events.length / 4)
    const fatigueDrop = q >= TAXONOMY_CONFIG.minQuartile
        ? correctRatio(events.slice(0, q)) - correctRatio(events.slice(events.length - q))
        : 0

    // Doubled letter: errors on a char that repeats the one before it (ll, ss…).
    const doubledKeys: string[] = []
    for (let i = 1; i < events.length; i++) {
        if (!events[i]!.correct && events[i]!.key === events[i - 1]!.key && /^[a-z]$/i.test(events[i]!.key)) {
            doubledKeys.push(events[i]!.key.toLowerCase())
        }
    }
    const doubledShare = doubledKeys.length / errorIndices.length

    const candidates: { finding: ErrorFinding; score: number }[] = []

    if (spiralRatio >= TAXONOMY_CONFIG.spiralRatio) {
        candidates.push({
            score: spiralRatio,
            finding: {
                class: "post-error-spiral",
                headline: "Your mistakes come in clusters",
                detail: `${Math.round(spiralRatio * 100)}% of your errors landed right after another — you're rushing to recover instead of resetting.`,
                action: { label: "Drill slowing down", href: "/?mode=practice" },
            },
        })
    }

    if (fatigueDrop >= TAXONOMY_CONFIG.fatigueDrop) {
        candidates.push({
            score: fatigueDrop,
            finding: {
                class: "fatigue-fade",
                headline: "Your accuracy fades as you go",
                detail: `You were ${Math.round(fatigueDrop * 100)} points less accurate by the end than at the start — shorter, sharper sessions will hold quality.`,
                action: { label: "Try a shorter test", href: "/" },
            },
        })
    }

    if (doubledKeys.length >= TAXONOMY_CONFIG.minDoubled && doubledShare >= TAXONOMY_CONFIG.doubledShare) {
        const keys = uniq(doubledKeys)
        candidates.push({
            score: doubledShare,
            finding: {
                class: "doubled-letter",
                headline: "Double letters trip you up",
                detail: `Repeated letters (${keys.join(", ")}) cost you several misses — drill the doubles directly.`,
                action: { label: `Drill ${keys.join(", ")}`, href: `/drill?keys=${keys.join(",")}` },
            },
        })
    }

    if (candidates.length === 0) return null
    // Dominant = highest score; stable tie-break by the order pushed above.
    return candidates.reduce((best, c) => (c.score > best.score ? c : best)).finding
}
