// Transition (bigram) analytics (Phase 4 §4.1) — the coach's real edge. Single
// keys are table stakes; the *transitions* between them (th, ion, br) are what
// cap intermediate typists. Pure and React-free: the same aggregation runs on a
// single test's timeline (to sync) and over a user's lifetime rows (to surface).

import type { KeystrokeEvent } from "./keystrokes"
import { isTrackableTransitionPair } from "./drillableTransitions"

// A pair recurs this many times in the lifetime data before its slowness is
// signal rather than a fluke.
export const TRANSITION_MIN_COUNT = 4
// Slower than this multiple of the user's overall transition pace = worth drilling.
export const TRANSITION_SLOW_RATIO = 1.3

function isLetter(ch: string): boolean {
    return /^[a-z]$/.test(ch)
}

// Per ordered letter→letter pair: how many times it occurred, the summed
// inter-key latency, and how often the second key was wrong. The unit a
// TransitionStat row stores (count, totalMs, errors), so the sync path and the
// read path share one shape.
export interface TransitionAggregate {
    pair: string // "th"
    count: number
    totalMs: number
    errors: number
}

// Roll one test's timeline into per-pair aggregates. Only letter→letter pairs
// (the drillable ones); space/punctuation transitions are dropped.
export function aggregateTransitions(events: KeystrokeEvent[]): TransitionAggregate[] {
    const byPair = new Map<string, TransitionAggregate>()
    for (let i = 1; i < events.length; i++) {
        const from = events[i - 1]!.key.toLowerCase()
        const to = events[i]!.key.toLowerCase()
        if (!isLetter(from) || !isLetter(to)) continue
        const pair = from + to
        if (!isTrackableTransitionPair(pair)) continue
        const dt = Math.max(events[i]!.t - events[i - 1]!.t, 0)
        const entry = byPair.get(pair) ?? { pair, count: 0, totalMs: 0, errors: 0 }
        entry.count += 1
        entry.totalMs += dt
        if (!events[i]!.correct) entry.errors += 1
        byPair.set(pair, entry)
    }
    return Array.from(byPair.values())
}

export interface SlowTransition {
    pair: string
    from: string
    to: string
    meanMs: number
    count: number
    // meanMs relative to the user's overall transition pace (2.1 = 2.1× slower).
    ratio: number
    errorRate: number // 0..1
}

// The overall mean transition latency across all pairs — the baseline a single
// pair is judged "slow" against.
export function overallTransitionMeanMs(aggregates: TransitionAggregate[]): number {
    let totalMs = 0
    let count = 0
    for (const a of aggregates) {
        if (!isTrackableTransitionPair(a.pair)) continue
        totalMs += a.totalMs
        count += a.count
    }
    return count === 0 ? 0 : totalMs / count
}

// The slowest recurring transitions, slowest first, judged against the user's
// own overall pace. Works on a single test's aggregates or lifetime rows.
export function worstTransitions(aggregates: TransitionAggregate[], limit = 5): SlowTransition[] {
    const baseline = overallTransitionMeanMs(aggregates)
    if (baseline <= 0) return []

    return aggregates
        .filter((a) => isTrackableTransitionPair(a.pair))
        .filter((a) => a.count >= TRANSITION_MIN_COUNT)
        .map((a) => {
            const pair = a.pair.toLowerCase()
            const meanMs = a.totalMs / a.count
            return {
                pair,
                from: pair[0]!,
                to: pair[1]!,
                meanMs,
                count: a.count,
                ratio: meanMs / baseline,
                errorRate: a.errors / a.count,
            }
        })
        .filter((t) => t.ratio >= TRANSITION_SLOW_RATIO)
        .sort((a, b) => b.meanMs - a.meanMs)
        .slice(0, limit)
}

// Merge two sets of aggregates (lifetime + a new test, or local + incoming) by
// summing — the same shape the DB upsert increments by.
export function mergeTransitions(existing: TransitionAggregate[], incoming: TransitionAggregate[]): TransitionAggregate[] {
    const byPair = new Map<string, TransitionAggregate>()
    for (const a of [...existing, ...incoming]) {
        if (a.count <= 0) continue
        const pair = a.pair.toLowerCase()
        if (!isTrackableTransitionPair(pair)) continue
        const entry = byPair.get(pair) ?? { pair, count: 0, totalMs: 0, errors: 0 }
        entry.count += a.count
        entry.totalMs += a.totalMs
        entry.errors += a.errors
        byPair.set(pair, entry)
    }
    return Array.from(byPair.values())
}
