export interface CompileDrillTextInput {
    keys?: string[],
    transitions?: string[],
    wordList: string[],
    length?: number,
    rng?: () => number,
}

export interface DrillWordCandidate {
    word: string,
    targetCount: number,
    density: number,
}

const DEFAULT_LENGTH = 80
const TOP_POOL_MIN = 24

const normalizeWord = (word: string): string | null => {
    const normalized = word.trim().toLowerCase()
    if (!/^[a-z]+$/.test(normalized)) return null
    return normalized
}

const uniqueChars = (chars: string[] | undefined): string[] =>
    Array.from(new Set((chars ?? [])
        .flatMap((char) => char.toLowerCase().split(""))
        .filter((char) => /^[a-z]$/.test(char))))

const normalizeTransitions = (transitions: string[] | undefined): string[] =>
    Array.from(new Set((transitions ?? [])
        .map((pair) => pair.toLowerCase().replace(/[^a-z]/g, ""))
        .filter((pair) => pair.length >= 2)
        .map((pair) => pair.slice(0, 2))))

const countChars = (word: string, targets: Set<string>): number => {
    let count = 0
    for (const char of word) {
        if (targets.has(char)) count += 1
    }
    return count
}

const countPair = (word: string, pair: string): number => {
    let count = 0
    for (let i = 0; i < word.length - 1; i += 1) {
        if (word.slice(i, i + 2) === pair) count += 1
    }
    return count
}

export function rankDrillWords(wordList: string[], keys: string[]): DrillWordCandidate[] {
    const targets = new Set(uniqueChars(keys))
    if (targets.size === 0) return []

    const seen = new Set<string>()
    const candidates: DrillWordCandidate[] = []
    for (const raw of wordList) {
        const word = normalizeWord(raw)
        if (!word || seen.has(word)) continue
        seen.add(word)

        const targetCount = countChars(word, targets)
        if (targetCount === 0) continue
        candidates.push({ word, targetCount, density: targetCount / word.length })
    }

    return candidates.sort((a, b) =>
        b.density - a.density ||
        b.targetCount - a.targetCount ||
        a.word.length - b.word.length ||
        a.word.localeCompare(b.word)
    )
}

function rankTransitionWords(wordList: string[], transitions: string[]): DrillWordCandidate[] {
    if (transitions.length === 0) return []

    const seen = new Set<string>()
    const candidates: DrillWordCandidate[] = []
    for (const raw of wordList) {
        const word = normalizeWord(raw)
        if (!word || seen.has(word)) continue
        seen.add(word)

        const targetCount = transitions.reduce((sum, pair) => sum + countPair(word, pair), 0)
        if (targetCount === 0) continue
        candidates.push({ word, targetCount, density: targetCount / Math.max(word.length - 1, 1) })
    }

    return candidates.sort((a, b) =>
        b.targetCount - a.targetCount ||
        b.density - a.density ||
        a.word.length - b.word.length ||
        a.word.localeCompare(b.word)
    )
}

const choose = <T,>(items: T[], rng: () => number, previous?: T): T | undefined => {
    if (items.length === 0) return undefined
    if (items.length === 1) return items[0]

    const choices = previous === undefined ? items : items.filter((item) => item !== previous)
    const pool = choices.length > 0 ? choices : items
    return pool[Math.floor(rng() * pool.length) % pool.length]
}

const fallbackKeyTokens = (keys: string[]): string[] => {
    const targets = uniqueChars(keys)
    if (targets.length === 0) return []
    return targets.flatMap((key) => [key, `${key}${key}`, `${key}a`, `a${key}`])
}

const fallbackTransitionTokens = (transitions: string[]): string[] =>
    transitions.flatMap((pair) => {
        const [from, to] = pair.split("") as [string, string]
        return [pair, `${pair}${pair}`, `${from}${pair}`, `${pair}${to}`]
    })

const genericWords = (wordList: string[]): string[] => {
    const seen = new Set<string>()
    const words: string[] = []
    for (const raw of wordList) {
        const word = normalizeWord(raw)
        if (!word || seen.has(word)) continue
        seen.add(word)
        words.push(word)
    }
    return words
}

// Build the word pool for a multi-key drill so every target key is represented.
// Ranking purely by density lets dense common-key words (e.g. words full of s/u/h/b)
// crowd out a rarer key like 'v', so it never appears. Round-robin the best words
// for each key first, then fill the rest by overall density.
export function buildKeyDrillPool(ranked: DrillWordCandidate[], keys: string[], poolSize: number): string[] {
    const targets = uniqueChars(keys)
    if (targets.length === 0) return ranked.slice(0, poolSize).map((candidate) => candidate.word)

    const seen = new Set<string>()
    const pool: string[] = []
    const perKey = Math.max(3, Math.ceil(poolSize / targets.length))

    for (const key of targets) {
        let added = 0
        for (const candidate of ranked) {
            if (added >= perKey) break
            if (seen.has(candidate.word) || !candidate.word.includes(key)) continue
            seen.add(candidate.word)
            pool.push(candidate.word)
            added += 1
        }
    }

    for (const candidate of ranked) {
        if (pool.length >= poolSize) break
        if (seen.has(candidate.word)) continue
        seen.add(candidate.word)
        pool.push(candidate.word)
    }

    return pool
}

function buildText(pool: string[], length: number, rng: () => number): string {
    const words: string[] = []
    let previous: string | undefined

    while (words.length < length) {
        const next = choose(pool, rng, previous)
        if (!next) break
        words.push(next)
        previous = next
    }

    return words.join(" ")
}

export function compileDrillText(input: CompileDrillTextInput): string {
    const length = Math.max(0, Math.floor(input.length ?? DEFAULT_LENGTH))
    if (length === 0) return ""

    const rng = input.rng ?? Math.random
    const transitions = normalizeTransitions(input.transitions)
    const keys = uniqueChars(input.keys)

    if (transitions.length > 0) {
        const ranked = rankTransitionWords(input.wordList, transitions)
        const top = ranked.slice(0, Math.max(TOP_POOL_MIN, length * 2)).map((candidate) => candidate.word)
        const fallback = fallbackTransitionTokens(transitions)
        const pool = top.length >= 4 ? top : [...top, ...fallback]
        return buildText(pool, length, rng)
    }

    if (keys.length > 0) {
        const ranked = rankDrillWords(input.wordList, keys)
        const pool = ranked.length > 0
            ? buildKeyDrillPool(ranked, keys, Math.max(TOP_POOL_MIN, length * 2))
            : fallbackKeyTokens(keys)
        return buildText(pool, length, rng)
    }

    return buildText(genericWords(input.wordList), length, rng)
}
