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

export function isTrackableTransitionPair(pair: string): boolean {
    const normalized = pair.toLowerCase()
    return /^[a-z]{2}$/.test(normalized) && realTransitionWordCount(normalized) >= MIN_REAL_TRANSITION_WORDS
}
