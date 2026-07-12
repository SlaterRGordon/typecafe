import { profileFor, type PhonologyProfile } from "./profiles"

// A generation-focused phonology engine: profiles provide grapheme-to-phoneme
// rules, while corpus evidence supplies each language's productive syllable
// shapes. It deliberately does not present itself as dictionary-grade phonetic
// transcription; its interface guarantees phonotactically licensed nonce words.

type Random = () => number

export interface PhonologicalWordRequest {
    language: string
    corpus: readonly string[]
    allowedCharacters: readonly string[]
    requiredCharacter: string
    rng?: Random
}

export interface PhonologicalTextRequest {
    language: string
    corpus: readonly string[]
    allowedCharacters: readonly string[]
    count: number
    rng?: Random
}

interface Segment {
    spelling: string
    phonemes: readonly string[]
    nucleus: boolean
}

interface Syllable {
    spelling: string
    phonemes: string
    onset: string
    coda: string
    count: number
    initial: boolean
    final: boolean
}

interface PhonologyModel {
    words: ReadonlySet<string>
    syllables: readonly Syllable[]
    initialOnsets: ReadonlySet<string>
    finalCodas: ReadonlySet<string>
    allowedPools: Map<string, readonly Syllable[]>
}

const models = new WeakMap<readonly string[], Map<string, PhonologyModel>>()
const PASSAGE_TARGET_OCCURRENCES = 2
const RECENT_WORD_WINDOW = 8
const COMPOSITION_BRANCH_LIMIT = 32
const MIN_WORD_CHARACTERS = 2

const normalizeWord = (word: string): string | null => {
    const normalized = word.trim().toLowerCase().normalize("NFC")
    return normalized.length > 0 && [...normalized].every((char) => /\p{L}/u.test(char)) ? normalized : null
}

const phoneKey = (segments: readonly Segment[]): string =>
    segments.flatMap((segment) => segment.phonemes).join(".")

const phonemize = (word: string, profile: PhonologyProfile): Segment[] => {
    const segments: Segment[] = []
    let offset = 0
    while (offset < word.length) {
        const matched = profile.rules.find((rule) => {
            if (!word.startsWith(rule.grapheme, offset)) return false
            const end = offset + rule.grapheme.length
            if (rule.atEnd && end !== word.length) return false
            const next = word.codePointAt(end)
            if (rule.before && (next === undefined || !rule.before.has(String.fromCodePoint(next)))) return false
            return true
        })
        if (matched) {
            segments.push({ spelling: matched.grapheme, phonemes: matched.phonemes, nucleus: matched.nucleus })
            offset += matched.grapheme.length
            continue
        }

        const spelling = String.fromCodePoint(word.codePointAt(offset)!)
        segments.push({
            spelling,
            phonemes: profile.phones[spelling] ?? [spelling],
            nucleus: profile.vowels.has(spelling),
        })
        offset += spelling.length
    }
    return segments
}

const nucleusIndexes = (segments: readonly Segment[]): number[] => {
    const indexes: number[] = []
    segments.forEach((segment, index) => { if (segment.nucleus) indexes.push(index) })
    return indexes
}

const initialOnset = (segments: readonly Segment[]): string => {
    const nucleus = segments.findIndex((segment) => segment.nucleus)
    return nucleus < 0 ? "" : phoneKey(segments.slice(0, nucleus))
}

const finalCoda = (segments: readonly Segment[]): string => {
    const nuclei = nucleusIndexes(segments)
    return nuclei.length === 0 ? "" : phoneKey(segments.slice(nuclei.at(-1)! + 1))
}

const onsetStart = (
    segments: readonly Segment[],
    previousNucleus: number,
    nextNucleus: number,
    legalOnsets: ReadonlySet<string>,
): number => {
    for (let start = previousNucleus + 1; start <= nextNucleus; start += 1) {
        if (legalOnsets.has(phoneKey(segments.slice(start, nextNucleus)))) return start
    }
    return nextNucleus
}

const syllabify = (segments: readonly Segment[], legalOnsets: ReadonlySet<string>): Segment[][] => {
    const nuclei = nucleusIndexes(segments)
    if (nuclei.length === 0) return []

    const starts = [0]
    for (let index = 1; index < nuclei.length; index += 1) {
        starts.push(onsetStart(segments, nuclei[index - 1]!, nuclei[index]!, legalOnsets))
    }

    return starts.map((start, index) => segments.slice(start, starts[index + 1] ?? segments.length))
}

const describeSyllable = (segments: readonly Segment[], initial: boolean, final: boolean): Omit<Syllable, "count"> => {
    const nuclei = nucleusIndexes(segments)
    const firstNucleus = nuclei[0]!
    const lastNucleus = nuclei.at(-1)!
    return {
        spelling: segments.map((segment) => segment.spelling).join(""),
        phonemes: phoneKey(segments),
        onset: phoneKey(segments.slice(0, firstNucleus)),
        coda: phoneKey(segments.slice(lastNucleus + 1)),
        initial,
        final,
    }
}

const buildModel = (corpus: readonly string[], profile: PhonologyProfile): PhonologyModel => {
    const words = new Set<string>()
    const pronunciations: Segment[][] = []
    const initialOnsets = new Set<string>([""])
    const finalCodas = new Set<string>([""])

    for (const raw of corpus) {
        const word = normalizeWord(raw)
        if (!word || words.has(word)) continue
        // Novelty is orthographic: every corpus spelling is excluded even when
        // this deliberately small profile cannot derive a vowel-bearing model
        // for it (for example English "be" under the silent-final-e rule).
        words.add(word)
        const segments = phonemize(word, profile)
        if (nucleusIndexes(segments).length === 0) continue
        pronunciations.push(segments)
        initialOnsets.add(initialOnset(segments))
        finalCodas.add(finalCoda(segments))
    }

    const syllables = new Map<string, Syllable>()
    for (const pronunciation of pronunciations) {
        const parts = syllabify(pronunciation, initialOnsets)
        parts.forEach((part, index) => {
            const described = describeSyllable(part, index === 0, index === parts.length - 1)
            const key = `${described.spelling}\0${described.phonemes}\0${described.onset}\0${described.coda}`
            const existing = syllables.get(key)
            if (existing) {
                existing.count += 1
                existing.initial ||= described.initial
                existing.final ||= described.final
            } else {
                syllables.set(key, { ...described, count: 1 })
            }
        })
    }

    return {
        words,
        syllables: [...syllables.values()],
        initialOnsets,
        finalCodas,
        allowedPools: new Map(),
    }
}

const modelFor = (corpus: readonly string[], profile: PhonologyProfile): PhonologyModel => {
    let byLanguage = models.get(corpus)
    if (!byLanguage) {
        byLanguage = new Map()
        models.set(corpus, byLanguage)
    }
    let model = byLanguage.get(profile.language)
    if (!model) {
        model = buildModel(corpus, profile)
        byLanguage.set(profile.language, model)
    }
    return model
}

const alphabetKey = (allowed: ReadonlySet<string>): string => [...allowed].sort().join("")

const poolFor = (model: PhonologyModel, allowed: ReadonlySet<string>): readonly Syllable[] => {
    const key = alphabetKey(allowed)
    let pool = model.allowedPools.get(key)
    if (!pool) {
        pool = model.syllables.filter((syllable) => [...syllable.spelling].every((char) => allowed.has(char)))
        model.allowedPools.set(key, pool)
    }
    return pool
}

const score = (syllable: Syllable, rng: Random): number => {
    const sample = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, rng()))
    const gumbel = -Math.log(-Math.log(sample))
    return Math.log1p(syllable.count) + (syllable.initial ? 0.15 : 0) + (syllable.final ? 0.15 : 0) + gumbel * 0.35
}

const ranked = (syllables: readonly Syllable[], rng: Random): Syllable[] =>
    syllables.map((syllable) => ({ syllable, score: score(syllable, rng) }))
        .sort((a, b) => b.score - a.score)
        .map(({ syllable }) => syllable)

const generateFromPool = (
    model: PhonologyModel,
    pool: readonly Syllable[],
    required: string,
    excluded: ReadonlySet<string>,
    rng: Random,
): string | null => {
    const targets = ranked(pool.filter((syllable) => syllable.spelling.includes(required)), rng)
    for (const target of targets) {
        const boundaryLicensed = model.initialOnsets.has(target.onset) && model.finalCodas.has(target.coda)
        if (
            boundaryLicensed
            && target.spelling.length >= MIN_WORD_CHARACTERS
            && !model.words.has(target.spelling)
            && !excluded.has(target.spelling)
        ) return target.spelling

        // A licensed standalone syllable may still be a corpus word. Let it take
        // an attested neighbour to become novel; null preserves the shorter form
        // when its own boundary is legal. Internal syllables require neighbours
        // on whichever edge is not licensed at a word boundary.
        const prefixes: Array<Syllable | null> = [
            ...(model.initialOnsets.has(target.onset) ? [null] : []),
            ...ranked(pool.filter((syllable) => syllable.initial), rng),
        ]
        const suffixes: Array<Syllable | null> = [
            ...(model.finalCodas.has(target.coda) ? [null] : []),
            ...ranked(pool.filter((syllable) => syllable.final), rng),
        ]
        // Bound the Cartesian search independently of corpus size. Ranking puts
        // frequent, boundary-attested syllables first; 32×32 still leaves ample
        // novelty while keeping a 500-word prompt comfortably interactive.
        for (const prefix of prefixes.slice(0, COMPOSITION_BRANCH_LIMIT)) {
            for (const suffix of suffixes.slice(0, COMPOSITION_BRANCH_LIMIT)) {
                const word = `${prefix?.spelling ?? ""}${target.spelling}${suffix?.spelling ?? ""}`
                if (
                    word !== target.spelling
                    && word.length >= MIN_WORD_CHARACTERS
                    && word.length <= 16
                    && !model.words.has(word)
                    && !excluded.has(word)
                ) return word
            }
        }
    }
    return null
}

const normalizedAlphabet = (characters: readonly string[]): string[] =>
    [...new Set(characters.map((char) => char.toLowerCase().normalize("NFC")).filter(Boolean))]

/**
 * Generates one novel, pronounceable spelling from phoneme-bearing syllables
 * learned from `corpus`. The result uses only `allowedCharacters`, contains the
 * required character, begins with an attested onset, and ends with an attested
 * coda. Returns null when those linguistic constraints cannot all be satisfied.
 * Models and per-alphabet syllable pools are memoized by corpus-array identity.
 */
export function generatePhonologicalWord(request: PhonologicalWordRequest): string | null {
    const profile = profileFor(request.language)
    if (!profile) return null
    const rng = request.rng ?? Math.random
    const alphabet = normalizedAlphabet(request.allowedCharacters)
    const allowed = new Set(alphabet)
    const required = request.requiredCharacter.toLowerCase().normalize("NFC")
    if (!allowed.has(required)) return null

    const model = modelFor(request.corpus, profile)
    const pool = poolFor(model, allowed)
    return generateFromPool(model, pool, required, new Set(), rng)
}

/**
 * Generates a complete all-phonological passage. Every token goes through the
 * syllable engine; active characters are scheduled for early coverage, and a
 * recent-word window prevents mechanical repetition when alternatives exist.
 */
export function generatePhonologicalText(request: PhonologicalTextRequest): string {
    if (request.count <= 0) return ""
    const profile = profileFor(request.language)
    const alphabet = normalizedAlphabet(request.allowedCharacters)
    if (!profile || alphabet.length === 0) return ""

    const rng = request.rng ?? Math.random
    const model = modelFor(request.corpus, profile)
    const pool = poolFor(model, new Set(alphabet))
    const deficits = new Map(alphabet.map((character) => [character, PASSAGE_TARGET_OCCURRENCES]))
    const recent: string[] = []
    const output: string[] = []

    while (output.length < request.count) {
        const target = [...alphabet].reverse().find((character) => (deficits.get(character) ?? 0) > 0)
            ?? alphabet[Math.floor(rng() * alphabet.length)]!
        const excluded = new Set(recent)
        const word = generateFromPool(model, pool, target, excluded, rng)
            ?? generateFromPool(model, pool, target, new Set(), rng)
            ?? target
        output.push(word)
        for (const character of word) {
            const remaining = deficits.get(character)
            if (remaining) deficits.set(character, Math.max(0, remaining - 1))
        }
        recent.push(word)
        if (recent.length > RECENT_WORD_WINDOW) recent.shift()
    }
    return output.join(" ")
}
