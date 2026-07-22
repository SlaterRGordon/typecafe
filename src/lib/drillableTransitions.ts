import english1k from "~/components/typer/languages/english1k.json"

export const MIN_REAL_TRANSITION_WORDS = 2

function transitionCounts(words: readonly string[]): Map<string, number> {
    const counts = new Map<string, number>()
    for (const rawWord of words) {
        const characters = [...rawWord.toLocaleLowerCase()]
        const pairs = new Set<string>()
        for (let index = 0; index < characters.length - 1; index += 1) {
            const pair = characters[index]! + characters[index + 1]!
            if (/^\p{L}{2}$/u.test(pair)) pairs.add(pair)
        }
        for (const pair of pairs) counts.set(pair, (counts.get(pair) ?? 0) + 1)
    }
    return counts
}

const transitionWordCounts = transitionCounts(english1k.words)
const englishTrackableTransitionPairs = new Set(
    [...transitionWordCounts].filter(([, count]) => count >= MIN_REAL_TRANSITION_WORDS).map(([pair]) => pair),
)

export function realTransitionWordCount(pair: string): number {
    return transitionWordCounts.get(pair.toLowerCase()) ?? 0
}

// Drillable = a real letter→letter bigram (both keys drillable, occurs in ≥2
// english1k words). This is the *coaching* gate: what worstTransitions ranks and
// what the baseline mean is measured over. Space pairs are deliberately excluded
// - you can't drill "e→space".
export function trackableTransitionPairs(words: readonly string[]): ReadonlySet<string> {
    return new Set(
        [...transitionCounts(words)].filter(([, count]) => count >= MIN_REAL_TRANSITION_WORDS).map(([pair]) => pair),
    )
}

export function isTrackableTransitionPair(pair: string, eligiblePairs: ReadonlySet<string> = englishTrackableTransitionPairs): boolean {
    const normalized = pair.toLowerCase()
    return /^\p{L}{2}$/u.test(normalized) && eligiblePairs.has(normalized)
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
