import english1k from "~/components/typer/languages/english1k.json"

export const MIN_REAL_TRANSITION_WORDS = 2

const transitionWordCounts = new Map<string, number>()

for (const word of english1k.words) {
    const pairs = new Set<string>()
    for (let i = 0; i < word.length - 1; i += 1) {
        pairs.add(word.slice(i, i + 2))
    }
    for (const pair of pairs) {
        transitionWordCounts.set(pair, (transitionWordCounts.get(pair) ?? 0) + 1)
    }
}

export function realTransitionWordCount(pair: string): number {
    return transitionWordCounts.get(pair.toLowerCase()) ?? 0
}

// Drillable = a real letter→letter bigram (both keys drillable, occurs in ≥2
// english1k words). This is the *coaching* gate: what worstTransitions ranks and
// what the baseline mean is measured over. Space pairs are deliberately excluded
// - you can't drill "e→space".
export function isTrackableTransitionPair(pair: string): boolean {
    const normalized = pair.toLowerCase()
    return /^[a-z]{2}$/.test(normalized) && realTransitionWordCount(normalized) >= MIN_REAL_TRANSITION_WORDS
}

// Tracked = what gets *stored* and rolled up (per-key speed), a superset of
// drillable. Adds space pairs ("e "/" t"): word-boundary rhythm, and the
// word-initial latency that lets keySpeedFromTransitions include first-of-word
// keys. Space pairs appear in zero english1k words, so they can't ride the
// drillable gate - a space on either side (but not both) makes a pair tracked.
export function isTrackedPair(pair: string): boolean {
    const normalized = pair.toLowerCase()
    if (!/^[a-z ]{2}$/.test(normalized) || normalized === "  ") return false
    if (normalized.includes(" ")) return true
    return isTrackableTransitionPair(normalized)
}
