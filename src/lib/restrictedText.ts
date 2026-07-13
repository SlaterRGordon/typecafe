import { generatePhonologicalWord } from "./phonology"

const TARGET_OCCURRENCES = 2

type Random = () => number

export interface RestrictedTextRequest {
    language: string
    words: readonly string[]
    characters: readonly string[]
    count: number
    rng?: Random
}

interface CorpusModel {
    words: string[]
    restrictedPools: Map<string, string[]>
}

const models = new WeakMap<readonly string[], CorpusModel>()

const normalizeWord = (word: string): string | null => {
    const normalized = word.trim().toLowerCase().normalize("NFC")
    return normalized.length > 0 && [...normalized].every((char) => /\p{L}/u.test(char)) ? normalized : null
}

const modelFor = (source: readonly string[]): CorpusModel => {
    let model = models.get(source)
    if (model) return model

    const seen = new Set<string>()
    const words: string[] = []
    for (const raw of source) {
        const word = normalizeWord(raw)
        if (!word || seen.has(word)) continue
        seen.add(word)
        words.push(word)
    }
    model = { words, restrictedPools: new Map() }
    models.set(source, model)
    return model
}

const poolFor = (model: CorpusModel, allowed: ReadonlySet<string>): string[] => {
    const key = [...allowed].sort().join("")
    let pool = model.restrictedPools.get(key)
    if (!pool) {
        pool = model.words.filter((word) => [...word].every((char) => allowed.has(char)))
        model.restrictedPools.set(key, pool)
    }
    return pool
}

const deficitScore = (word: string, deficits: ReadonlyMap<string, number>): number => {
    let score = 0
    for (const char of word) {
        if ((deficits.get(char) ?? 0) > 0) score += 1
    }
    return score
}

const applyCoverage = (word: string, deficits: Map<string, number>): void => {
    for (const char of word) {
        const remaining = deficits.get(char)
        if (remaining) deficits.set(char, Math.max(0, remaining - 1))
    }
}

const pick = <T>(items: readonly T[], rng: Random): T | undefined =>
    items[Math.floor(rng() * items.length)]

const pickDifferent = (items: readonly string[], previous: string | undefined, rng: Random): string => {
    const index = Math.floor(rng() * items.length)
    const candidate = items[index]!
    return candidate !== previous || items.length === 1 ? candidate : items[(index + 1) % items.length]!
}

const bestCarrier = (
    words: readonly string[],
    deficits: ReadonlyMap<string, number>,
    previous: string | undefined,
    rng: Random,
): string | null => {
    let bestScore = 0
    const best: string[] = []
    for (const word of words) {
        const score = deficitScore(word, deficits)
        if (score < bestScore) continue
        if (score > bestScore) {
            bestScore = score
            best.length = 0
        }
        if (score > 0 && (word !== previous || words.length === 1)) best.push(word)
    }
    return pick(best, rng) ?? null
}

const shuffle = <T>(items: T[], rng: Random): void => {
    for (let index = items.length - 1; index > 0; index -= 1) {
        const other = Math.floor(rng() * (index + 1))
        ;[items[index], items[other]] = [items[other]!, items[index]!]
    }
}

/**
 * Builds lowercase practice text from only the requested characters. Real words
 * carry coverage first; the phonology module supplies pronounceable novel words
 * when the restricted real-word pool cannot exercise a key. An explicit key
 * token is the final, honest fallback for a linguistically impossible alphabet.
 */
export function generateRestrictedText(request: RestrictedTextRequest): string {
    if (request.count <= 0) return ""
    const rng = request.rng ?? Math.random
    const unique = [...new Set(request.characters
        .map((char) => char.toLowerCase().normalize("NFC"))
        .filter((char) => char.length > 0 && [...char].every((part) => /\p{L}/u.test(part))))]
    if (unique.length === 0) return ""

    const allowed = new Set(unique)
    const model = modelFor(request.words)
    const pool = poolFor(model, allowed)
    const deficits = new Map(unique.map((char) => [char, TARGET_OCCURRENCES]))
    const output: string[] = []

    while (output.length < request.count && [...deficits.values()].some((value) => value > 0)) {
        const carrier = bestCarrier(pool, deficits, output.at(-1), rng)
        if (carrier) {
            output.push(carrier)
            applyCoverage(carrier, deficits)
            continue
        }

        const target = [...unique].reverse().find((char) => (deficits.get(char) ?? 0) > 0)
        if (!target) break
        const phonological = generatePhonologicalWord({
            language: request.language,
            corpus: model.words,
            allowedCharacters: unique,
            requiredCharacter: target,
            rng,
        })
        const fallback = phonological ?? target
        output.push(fallback)
        applyCoverage(fallback, deficits)
    }

    const filler = pool.length > 0 ? pool : output
    while (output.length < request.count && filler.length > 0) {
        output.push(pickDifferent(filler, output.at(-1), rng))
    }

    const coverageLength = Math.min(output.length, unique.length * TARGET_OCCURRENCES)
    const prefix = output.slice(0, coverageLength)
    shuffle(prefix, rng)
    output.splice(0, coverageLength, ...prefix)
    return output.join(" ")
}
