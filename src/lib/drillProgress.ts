// Post-drill progression (Phase 4): the "what next" pick shared by the home
// coach tab and the drill result card, and the lifetime-vs-this-rep delta the
// result card headlines. Pure and React-free - the numbers are the product.

import type { KeystrokeEvent } from "./keystrokes"
import type { LocalKeyStat } from "./localSync"
import type { SkillCandidate } from "./skillEvidence"
import { targetAction } from "./coachingTarget"
import { composeWeakKeys, worstKeysFromAttempts } from "./stats"
import { aggregateTransitions, overallTransitionMeanMs, worstTransitions, TRANSITION_MIN_COUNT, type TransitionAggregate } from "./transitions"

export type KeyAttempts = Map<string, { attempts: number, correct: number }>

// The single next thing worth drilling: the slowest recurring transition first
// (the coach's real edge), weakest keys as the fallback. `id` is the dismissal
// token the coach tab stores; `href` is the drill deep-link.
export type DrillFinding =
    | { kind: "transition", id: string, href: string, pair: string, from: string, to: string, ratio: number, evidence?: SkillCandidate }
    | { kind: "keys", id: string, href: string, keys: string[], evidence?: SkillCandidate }

// Query strings and the legacy DrillTarget wire shape stay outside the deep
// evidence module. The target adapter owns canonical links and preserves old
// key/Transition/word deep links.
export function drillFindingFromCandidate(candidate: SkillCandidate | null): DrillFinding | null {
    if (!candidate) return null
    const target = candidate.target
    if (target.kind === "transition") {
        return {
            kind: "transition",
            id: candidate.id,
            href: `/drill?transitions=${encodeURIComponent(target.pair)}`,
            pair: target.pair,
            from: target.pair[0]!,
            to: target.pair[1]!,
            ratio: candidate.reason.code === "transition_latency_above_baseline" ? candidate.reason.ratio : 1,
            evidence: candidate,
        }
    }
    if (target.kind === "key") {
        return {
            kind: "keys",
            id: candidate.id,
            href: `/drill?keys=${target.keys.map(encodeURIComponent).join(",")}`,
            keys: target.keys,
            evidence: candidate,
        }
    }
    if (target.kind === "correction") {
        return {
            kind: "keys",
            id: candidate.id,
            href: targetAction(target).href,
            keys: [target.expected],
            evidence: candidate,
        }
    }
    return null
}

// `exclude` drops the just-drilled target so a post-drill "next" never
// re-suggests the drill the user only just finished.
export function nextDrillFinding(
    transitions: TransitionAggregate[],
    attempts: KeyAttempts,
    exclude?: { pairs?: string[], keys?: string[] },
): DrillFinding | null {
    const excludedPairs = new Set(exclude?.pairs ?? [])
    const slowest = worstTransitions(transitions).find((t) => !excludedPairs.has(t.pair))
    if (slowest) {
        return {
            kind: "transition",
            id: `transition:${slowest.pair}`,
            href: `/drill?transitions=${slowest.pair}`,
            pair: slowest.pair,
            from: slowest.from,
            to: slowest.to,
            ratio: slowest.ratio,
        }
    }

    const excludedKeys = new Set(exclude?.keys ?? [])
    const ranked = worstKeysFromAttempts(attempts, Infinity).filter((k) => !excludedKeys.has(k.key))
    const keys = composeWeakKeys(ranked).slice(0, 4).map((k) => k.key)
    if (keys.length === 0) return null
    return { kind: "keys", id: `keys:${keys.join(",")}`, href: `/drill?keys=${keys.join(",")}`, keys }
}

// Roll a test's timeline into per-key attempt counts - the same shape the
// lifetime key stats use, so rep and lifetime data merge and compare directly.
export function attemptsFromEvents(events: KeystrokeEvent[]): KeyAttempts {
    const byKey: KeyAttempts = new Map()
    for (const event of events) {
        const entry = byKey.get(event.key) ?? { attempts: 0, correct: 0 }
        entry.attempts += 1
        if (event.correct) entry.correct += 1
        byKey.set(event.key, entry)
    }
    return byKey
}

export function mergeAttempts(base: LocalKeyStat[], extra: KeyAttempts): KeyAttempts {
    const byKey: KeyAttempts = new Map(base.map((s) => [s.key, { attempts: s.attempts, correct: s.correct }]))
    for (const [key, value] of extra) {
        const entry = byKey.get(key) ?? { attempts: 0, correct: 0 }
        byKey.set(key, { attempts: entry.attempts + value.attempts, correct: entry.correct + value.correct })
    }
    return byKey
}

// A rep needs this many samples on the drilled target before its delta is
// signal; below that a single hesitation swings the number.
export const DELTA_MIN_REP_SAMPLES = 3
// Lifetime attempts (summed across the drilled keys) before a key-accuracy
// baseline is worth comparing against.
export const DELTA_MIN_KEY_ATTEMPTS = 10

// Lifetime baseline vs this rep on the drilled target. `unit` decides the
// direction: "ms" improves downward (faster), "%" improves upward (accuracy).
// A flat result is not an improvement - never claim a win that isn't there.
export interface DrillDelta {
    label: string
    before: number
    after: number
    unit: "ms" | "%"
    improved: boolean
}

// The lifetime baseline the drill header states up front - what the user is
// trying to beat. Null when the pair lacks enough lifetime samples.
export function transitionBaseline(pair: string, lifetime: TransitionAggregate[]): { meanMs: number, ratio: number } | null {
    const agg = lifetime.find((a) => a.pair === pair)
    if (!agg || agg.count < TRANSITION_MIN_COUNT) return null
    const overall = overallTransitionMeanMs(lifetime)
    if (overall <= 0) return null
    const meanMs = agg.totalMs / agg.count
    return { meanMs, ratio: meanMs / overall }
}

// Lifetime accuracy summed across the drilled keys - the header's baseline and
// the "before" side of keyDrillDelta.
export function keysBaseline(keys: string[], lifetime: LocalKeyStat[]): { accuracy: number } | null {
    const targets = new Set(keys)
    let attempts = 0
    let correct = 0
    for (const stat of lifetime) {
        if (!targets.has(stat.key)) continue
        attempts += stat.attempts
        correct += stat.correct
    }
    if (attempts < DELTA_MIN_KEY_ATTEMPTS) return null
    return { accuracy: (correct / attempts) * 100 }
}

// Mean inter-key latency on one drilled pair: lifetime vs this rep. Null when
// either side is too thin to be signal.
export function transitionDrillDelta(pair: string, lifetime: TransitionAggregate[], repEvents: KeystrokeEvent[]): DrillDelta | null {
    const base = lifetime.find((a) => a.pair === pair)
    if (!base || base.count < TRANSITION_MIN_COUNT) return null
    const rep = aggregateTransitions(repEvents).find((a) => a.pair === pair)
    if (!rep || rep.count < DELTA_MIN_REP_SAMPLES) return null
    const before = base.totalMs / base.count
    const after = rep.totalMs / rep.count
    return { label: `${pair[0]}→${pair[1]}`, before, after, unit: "ms", improved: after < before }
}

// Accuracy across the drilled keys (summed, not per-key - one honest headline
// number): lifetime vs this rep.
export function keyDrillDelta(keys: string[], lifetime: LocalKeyStat[], repEvents: KeystrokeEvent[]): DrillDelta | null {
    const base = keysBaseline(keys, lifetime)
    if (!base) return null

    const targets = new Set(keys)
    let repAttempts = 0
    let repCorrect = 0
    for (const [key, value] of attemptsFromEvents(repEvents)) {
        if (!targets.has(key)) continue
        repAttempts += value.attempts
        repCorrect += value.correct
    }
    if (repAttempts < DELTA_MIN_REP_SAMPLES) return null

    const after = (repCorrect / repAttempts) * 100
    return { label: keys.join(" "), before: base.accuracy, after, unit: "%", improved: after > base.accuracy }
}
