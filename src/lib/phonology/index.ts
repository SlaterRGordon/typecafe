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
        const segments = phonemize(word, profile)
        if (nucleusIndexes(segments).length === 0) continue
        words.add(word)
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

const score = (syllable: Syllable, rng: Random): number =>
    Math.log1p(syllable.count) + (syllable.initial ? 0.15 : 0) + (syllable.final ? 0.15 : 0) + rng() * 0.01

const ranked = (syllables: readonly Syllable[], rng: Random): Syllable[] =>
    syllables.map((syllable) => ({ syllable, score: score(syllable, rng) }))
        .sort((a, b) => b.score - a.score)
        .map(({ syllable }) => syllable)

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
    const allowed = new Set(request.allowedCharacters.map((char) => char.toLowerCase().normalize("NFC")))
    const required = request.requiredCharacter.toLowerCase().normalize("NFC")
    if (!allowed.has(required)) return null

    const model = modelFor(request.corpus, profile)
    const pool = poolFor(model, allowed)
    const targets = ranked(pool.filter((syllable) => syllable.spelling.includes(required)), rng)

    for (const target of targets) {
        const boundaryLicensed = model.initialOnsets.has(target.onset) && model.finalCodas.has(target.coda)
        if (boundaryLicensed && !model.words.has(target.spelling)) return target.spelling

        const prefixes = target.initial ? [null] : ranked(pool.filter((syllable) => syllable.initial), rng)
        const suffixes = target.final ? [null] : ranked(pool.filter((syllable) => syllable.final), rng)
        for (const prefix of prefixes.slice(0, 8)) {
            for (const suffix of suffixes.slice(0, 8)) {
                const word = `${prefix?.spelling ?? ""}${target.spelling}${suffix?.spelling ?? ""}`
                if (word.length <= 16 && !model.words.has(word)) return word
            }
        }
    }
    return null
}
