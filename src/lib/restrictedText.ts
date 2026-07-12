// Restricted-alphabet practice text is a single deep module: callers provide a
// language corpus and unlocked characters; this implementation owns corpus
// indexing, target coverage, orthographic generation, and honest fallbacks.

const START = "^"
const END = "$"
const MAX_CONTEXT = 3
const BEAM_WIDTH = 32
const BRANCH_WIDTH = 12
const MIN_WORD_LENGTH = 2
const MAX_WORD_LENGTH = 12
const TARGET_OCCURRENCES = 2

type Random = () => number

interface Choice {
    char: string
    count: number
}

interface CorpusModel {
    words: string[]
    restrictedPools: Map<string, RestrictedPool>
}

interface RestrictedPool {
    words: string[]
    orthography?: OrthographyModel
}

interface OrthographyModel {
    transitions: Map<string, Choice[]>
    fragments: string[]
}

interface BeamState {
    text: string
    score: number
}

const models = new WeakMap<readonly string[], CorpusModel>()

const isLetterWord = (word: string): boolean => word.length > 0 && [...word].every((char) => /\p{L}/u.test(char))

const normalizeWord = (word: string): string | null => {
    const normalized = word.trim().toLowerCase().normalize("NFC")
    return isLetterWord(normalized) ? normalized : null
}

const addTransition = (counts: Map<string, Map<string, number>>, context: string, char: string): void => {
    let choices = counts.get(context)
    if (!choices) {
        choices = new Map()
        counts.set(context, choices)
    }
    choices.set(char, (choices.get(char) ?? 0) + 1)
}

const buildModel = (source: readonly string[]): CorpusModel => {
    const words: string[] = []
    const seenWords = new Set<string>()

    for (const raw of source) {
        const word = normalizeWord(raw)
        if (!word || seenWords.has(word)) continue
        seenWords.add(word)
        words.push(word)
    }

    return { words, restrictedPools: new Map() }
}

const modelFor = (source: readonly string[]): CorpusModel => {
    let model = models.get(source)
    if (!model) {
        model = buildModel(source)
        models.set(source, model)
    }
    return model
}

const alphabetKey = (allowed: ReadonlySet<string>): string => [...allowed].sort().join("")

const poolFor = (model: CorpusModel, allowed: ReadonlySet<string>): RestrictedPool => {
    const key = alphabetKey(allowed)
    let pool = model.restrictedPools.get(key)
    if (pool) return pool

    const words = model.words.filter((word) => [...word].every((char) => allowed.has(char)))
    pool = { words }
    model.restrictedPools.set(key, pool)
    return pool
}

const orthographyFor = (model: CorpusModel, pool: RestrictedPool, allowed: ReadonlySet<string>): OrthographyModel => {
    if (pool.orthography) return pool.orthography
    const transitions = new Map<string, Map<string, number>>()
    const fragmentCounts = new Map<string, number>()

    for (const word of model.words) {
        const padded = START.repeat(MAX_CONTEXT) + word + END
        for (let index = MAX_CONTEXT; index < padded.length; index += 1) {
            const next = padded[index]!
            if (next !== END && !allowed.has(next)) continue
            for (let length = 1; length <= MAX_CONTEXT; length += 1) {
                const context = padded.slice(index - length, index)
                if ([...context].every((char) => char === START || allowed.has(char))) {
                    addTransition(transitions, context, next)
                }
            }
        }

        const chars = [...word]
        for (let length = 2; length <= 4; length += 1) {
            for (let index = 0; index + length <= chars.length; index += 1) {
                const fragment = chars.slice(index, index + length).join("")
                if (![...fragment].every((char) => allowed.has(char))) continue
                fragmentCounts.set(fragment, (fragmentCounts.get(fragment) ?? 0) + 1)
            }
        }
    }

    const rankedTransitions = new Map<string, Choice[]>()
    for (const [context, choices] of transitions) {
        rankedTransitions.set(context, [...choices]
            .map(([char, count]) => ({ char, count }))
            .sort((a, b) => b.count - a.count || a.char.localeCompare(b.char)))
    }

    pool.orthography = {
        transitions: rankedTransitions,
        fragments: [...fragmentCounts]
            .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
            .map(([fragment]) => fragment),
    }
    return pool.orthography
}

const countTargets = (word: string, targets: ReadonlySet<string>): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const char of word) {
        if (targets.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1)
    }
    return counts
}

const deficitScore = (word: string, deficits: ReadonlyMap<string, number>): number => {
    let score = 0
    for (const char of word) {
        if ((deficits.get(char) ?? 0) > 0) score += 1
    }
    return score
}

const applyCoverage = (word: string, deficits: Map<string, number>): void => {
    for (const [char, count] of countTargets(word, new Set(deficits.keys()))) {
        deficits.set(char, Math.max(0, (deficits.get(char) ?? 0) - count))
    }
}

const pick = <T>(items: readonly T[], rng: Random): T | undefined =>
    items[Math.floor(rng() * items.length)]

const pickDifferent = (items: readonly string[], previous: string | undefined, rng: Random): string => {
    const index = Math.floor(rng() * items.length)
    const candidate = items[index]!
    return candidate !== previous || items.length === 1 ? candidate : items[(index + 1) % items.length]!
}

const bestCarrier = (words: readonly string[], deficits: ReadonlyMap<string, number>, previous: string | undefined, rng: Random): string | null => {
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

const allowedChoices = (model: OrthographyModel, text: string, allowed: ReadonlySet<string>): { choices: Choice[], backoff: number } | null => {
    const padded = START.repeat(MAX_CONTEXT) + text
    for (let length = MAX_CONTEXT; length >= 1; length -= 1) {
        const context = padded.slice(-length)
        const choices = (model.transitions.get(context) ?? []).filter(({ char }) => char === END || allowed.has(char))
        if (choices.length > 0) return { choices, backoff: MAX_CONTEXT - length }
    }
    return null
}

const generateOrthographicWord = (model: OrthographyModel, allowed: ReadonlySet<string>, required: string, rng: Random): string | null => {
    let beam: BeamState[] = [{ text: "", score: 0 }]
    const completed: BeamState[] = []

    for (let step = 0; step <= MAX_WORD_LENGTH && beam.length > 0; step += 1) {
        const nextBeam: BeamState[] = []
        for (const state of beam) {
            const next = allowedChoices(model, state.text, allowed)
            if (!next) continue
            const total = next.choices.reduce((sum, choice) => sum + choice.count, 0)
            for (const choice of next.choices.slice(0, BRANCH_WIDTH)) {
                if (choice.char === END) {
                    if (state.text.length >= MIN_WORD_LENGTH && state.text.includes(required)) completed.push(state)
                    continue
                }
                if (state.text.length >= MAX_WORD_LENGTH) continue
                // Triple repeats are almost always corpus artefacts or initials,
                // and look especially broken when a tiny alphabet is selected.
                if (state.text.endsWith(choice.char.repeat(2))) continue
                nextBeam.push({
                    text: state.text + choice.char,
                    score: state.score + Math.log(choice.count / total) - next.backoff * 1.5 + rng() * 0.01,
                })
            }
        }
        nextBeam.sort((a, b) => b.score - a.score)
        beam = nextBeam.slice(0, BEAM_WIDTH)
    }

    completed.sort((a, b) => b.score - a.score)
    return completed[0]?.text ?? null
}

const corpusFragment = (model: OrthographyModel, allowed: ReadonlySet<string>, required: string): string | null =>
    model.fragments.find((fragment) => fragment.includes(required) && [...fragment].every((char) => allowed.has(char))) ?? null

const fallbackCarrier = (model: CorpusModel, pool: RestrictedPool, allowed: ReadonlySet<string>, required: string, rng: Random): string => {
    const orthography = orthographyFor(model, pool, allowed)
    return generateOrthographicWord(orthography, allowed, required, rng)
    ?? corpusFragment(orthography, allowed, required)
    ?? required
}

const shuffle = <T>(items: T[], rng: Random): void => {
    for (let index = items.length - 1; index > 0; index -= 1) {
        const other = Math.floor(rng() * (index + 1))
        ;[items[index], items[other]] = [items[other]!, items[index]!]
    }
}

/**
 * Builds lowercase practice text from only `characters`.
 *
 * The first words guarantee two occurrences of every unlocked character when
 * `count` leaves enough carrier slots. Real corpus words are preferred;
 * otherwise a boundary-aware orthographic candidate, an observed corpus
 * fragment, or finally the explicit target key is used. Corpus models and
 * restricted real-word pools are memoized by the stable `words` array identity.
 */
export function generateRestrictedText(
    words: readonly string[],
    characters: readonly string[],
    count: number,
    rng: Random = Math.random,
): string {
    if (count <= 0) return ""
    const unique = [...new Set(characters.map((char) => char.toLowerCase().normalize("NFC")).filter(isLetterWord))]
    if (unique.length === 0) return ""

    const allowed = new Set(unique)
    const model = modelFor(words)
    const pool = poolFor(model, allowed)
    const deficits = new Map(unique.map((char) => [char, TARGET_OCCURRENCES]))
    const output: string[] = []

    while (output.length < count && [...deficits.values()].some((value) => value > 0)) {
        const carrier = bestCarrier(pool.words, deficits, output.at(-1), rng)
        if (carrier) {
            output.push(carrier)
            applyCoverage(carrier, deficits)
            continue
        }

        // Newest-unlocked keys are at the end of the selection, so reverse order
        // puts their guaranteed fallback near the start of the visible prompt.
        const target = [...unique].reverse().find((char) => (deficits.get(char) ?? 0) > 0)
        if (!target) break
        const fallback = fallbackCarrier(model, pool, allowed, target, rng)
        output.push(fallback)
        applyCoverage(fallback, deficits)
    }

    const filler = pool.words.length > 0 ? pool.words : output
    while (output.length < count && filler.length > 0) {
        output.push(pickDifferent(filler, output.at(-1), rng))
    }

    // Coverage belongs at the front, but lightly shuffle that prefix so several
    // fallback targets do not form a mechanical alphabet-order block.
    const coverageLength = Math.min(output.length, unique.length * TARGET_OCCURRENCES)
    const prefix = output.slice(0, coverageLength)
    shuffle(prefix, rng)
    output.splice(0, coverageLength, ...prefix)
    return output.join(" ")
}
