type Random = () => number

interface WeightedValue {
    value: string
    weight: number
}

export interface OrthographicModel {
    transitions: readonly ReadonlyMap<string, readonly WeightedValue[]>[]
    prefixesByCharacter: ReadonlyMap<string, readonly WeightedValue[]>
    allowedPrefixPools: Map<string, ReadonlyMap<string, readonly WeightedValue[]>>
}

interface GenerateRequest {
    model: OrthographicModel
    allowed: ReadonlySet<string>
    required: string | null
    excluded: ReadonlySet<string>
    forbidden: ReadonlySet<string>
    accepts: (word: string) => boolean
    rng: Random
}

const CONTEXT_LENGTH = 3
const TRANSITION_CONTEXT_LENGTHS = [1, CONTEXT_LENGTH] as const
const MIN_WORD_LENGTH = 3
const MAX_WORD_LENGTH = 10
const MAX_PREFIX_LENGTH = 6
const MAX_ATTEMPTS = 32
const START = "\u0002"
const END = "\u0003"
const END_WEIGHT_GROWTH = 1.3
const INTERNAL_SEED_WEIGHT = 0.35

const contextKey = (characters: readonly string[]): string => characters.join("\0")

const rankWeight = (rank: number): number => 1 / Math.sqrt(rank + 1)

const addWeight = (map: Map<string, Map<string, number>>, context: string, value: string, weight: number) => {
    let choices = map.get(context)
    if (!choices) {
        choices = new Map()
        map.set(context, choices)
    }
    choices.set(value, (choices.get(value) ?? 0) + weight)
}

const freezeWeights = (map: ReadonlyMap<string, ReadonlyMap<string, number>>): ReadonlyMap<string, readonly WeightedValue[]> =>
    new Map([...map].map(([context, values]) => [
        context,
        [...values].map(([value, weight]) => ({ value, weight })),
    ]))

/** Builds a frequency-sensitive, order-4 spelling model from ranked words. */
export function buildOrthographicModel(words: readonly string[]): OrthographicModel {
    const transitionCounts = Array.from({ length: CONTEXT_LENGTH + 1 }, () => new Map<string, Map<string, number>>())
    const prefixCounts = new Map<string, Map<string, number>>()

    words.forEach((word, rank) => {
        const characters = [...word]
        const weight = rankWeight(rank)
        const history = Array.from({ length: CONTEXT_LENGTH }, () => START)

        for (let index = 0; index <= characters.length; index += 1) {
            const next = characters[index] ?? END
            for (const length of TRANSITION_CONTEXT_LENGTHS) {
                addWeight(transitionCounts[length]!, contextKey(history.slice(-length)), next, weight)
            }
            if (next !== END) {
                history.push(next)
                history.shift()
            }
        }

        // One shortest attested prefix per character is sufficient to place a
        // focus key naturally; all longer versions are redundant search seeds.
        const prefixLimit = Math.min(MAX_PREFIX_LENGTH, characters.length)
        for (const character of new Set(characters.slice(0, prefixLimit))) {
            const end = characters.indexOf(character) + 1
            const spelling = characters.slice(0, end).join("")
            let prefixes = prefixCounts.get(character)
            if (!prefixes) {
                prefixes = new Map()
                prefixCounts.set(character, prefixes)
            }
            prefixes.set(spelling, (prefixes.get(spelling) ?? 0) + weight)
        }

        // A restricted alphabet may have no word beginning that contains a rare
        // focus key (English x is the common case). Attested internal clusters
        // provide a language-shaped seed; the phonological guard later decides
        // whether moving that cluster to a word edge is legal.
        for (let start = 0; start < characters.length - 1; start += 1) {
            const fragment = characters.slice(start, start + 2)
            const spelling = fragment.join("")
            for (const character of new Set(fragment)) {
                let prefixes = prefixCounts.get(character)
                if (!prefixes) {
                    prefixes = new Map()
                    prefixCounts.set(character, prefixes)
                }
                prefixes.set(spelling, (prefixes.get(spelling) ?? 0) + weight * INTERNAL_SEED_WEIGHT)
            }
        }
    })

    return {
        transitions: transitionCounts.map(freezeWeights),
        prefixesByCharacter: new Map([...prefixCounts].map(([character, prefixes]) => [
            character,
            [...prefixes].map(([value, weight]) => ({ value, weight })),
        ])),
        allowedPrefixPools: new Map(),
    }
}

const alphabetKey = (allowed: ReadonlySet<string>): string => [...allowed].sort().join("")

const prefixPoolsFor = (
    model: OrthographicModel,
    allowed: ReadonlySet<string>,
): ReadonlyMap<string, readonly WeightedValue[]> => {
    const key = alphabetKey(allowed)
    let cached = model.allowedPrefixPools.get(key)
    if (cached) return cached

    cached = new Map([...model.prefixesByCharacter].map(([character, prefixes]) => [
        character,
        prefixes.filter(({ value }) => [...value].every((candidate) => allowed.has(candidate))),
    ]))
    model.allowedPrefixPools.set(key, cached)
    return cached
}

const sample = (choices: readonly WeightedValue[], rng: Random): string | null => {
    const total = choices.reduce((sum, choice) => sum + choice.weight, 0)
    if (!(total > 0)) return null
    let cursor = Math.min(1 - Number.EPSILON, Math.max(0, rng())) * total
    for (const choice of choices) {
        cursor -= choice.weight
        if (cursor < 0) return choice.value
    }
    return choices.at(-1)?.value ?? null
}

const canEnd = (word: string, request: GenerateRequest): boolean =>
    [...word].length >= MIN_WORD_LENGTH
    && (request.required == null || word.includes(request.required))
    && !request.forbidden.has(word)
    && !request.excluded.has(word)
    && request.accepts(word)

const nextChoices = (
    history: readonly string[],
    word: string,
    request: GenerateRequest,
): WeightedValue[] => {
    for (let length = CONTEXT_LENGTH; length >= 1; length -= 1) {
        const entries = request.model.transitions[length]?.get(contextKey(history.slice(-length)))
        if (!entries) continue
        const choices = entries.flatMap(({ value, weight }) => {
            if (value === END) {
                if (!canEnd(word, request)) return []
                return [{ value, weight: weight * Math.pow(END_WEIGHT_GROWTH, [...word].length - MIN_WORD_LENGTH + 1) }]
            }
            if ([...word].length >= MAX_WORD_LENGTH || !request.allowed.has(value)) return []
            return [{ value, weight }]
        })
        if (choices.length > 0) return choices
    }
    return []
}

const growWord = (prefix: string, request: GenerateRequest): string | null => {
    const characters = [...prefix]
    const history = [...Array.from({ length: CONTEXT_LENGTH }, () => START), ...characters].slice(-CONTEXT_LENGTH)

    while (characters.length <= MAX_WORD_LENGTH) {
        const word = characters.join("")
        const next = sample(nextChoices(history, word, request), request.rng)
        if (next === END) return word
        if (next == null) return null
        characters.push(next)
        history.push(next)
        history.shift()
    }
    return null
}

/**
 * Generates a whole spelling from corpus transitions. Focus prefixes place a
 * required key in an attested word beginning; backoff never drops below one
 * character, so every emitted bigram has corpus evidence.
 */
export function generateOrthographicWord(request: GenerateRequest): string | null {
    const prefixes = request.required == null
        ? []
        : prefixPoolsFor(request.model, request.allowed).get(request.required) ?? []
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const prefix = sample(prefixes, request.rng) ?? ""
        const word = growWord(prefix, request)
        if (word != null) return word
    }
    return null
}
