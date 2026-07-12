import biGrams from './languages/nGrams/biGrams.json'
import triGrams from './languages/nGrams/triGrams.json'
import tetraGrams from './languages/nGrams/tetraGrams.json'

import english1k from './languages/english1k.json'

import { TestGramScopes, TestGramSources, type QuoteLength, type WordSize } from './types'
// Drillable-key definitions live in lib (single source shared with diagnosis and
// the drill page); re-exported here for the typer modules that import from utils.
import { DRILL_MARKS, ENDER_MARKS, MID_MARKS, isDrillMark, isDrillDigit } from '~/lib/drillKeys'
import { generateRestrictedText } from '~/lib/restrictedText'
export { DRILL_MARKS, isDrillMark, isDrillDigit }

interface WordList {
    words: string[],
}

type QuoteBuckets = { short: string[], medium: string[], long: string[] }

// Quotes load on demand (the JSON is a few hundred KB) - Quotes is a secondary
// mode, so it never belongs in the first-paint bundle.
let quotes: QuoteBuckets | null = null
let quotesPromise: Promise<void> | null = null

export const ensureQuotesLoaded = (): Promise<void> => {
    if (quotes) return Promise.resolve()
    quotesPromise ??= import('./languages/quotes.json').then((m) => { quotes = m.default as QuoteBuckets })
    return quotesPromise
}

// A random verbatim quote from the chosen length bucket ("all" pools them).
// Returns "" until the JSON has loaded - callers await ensureQuotesLoaded first.
export const generateQuote = (length: QuoteLength): string => {
    if (!quotes) return ""
    const pool = length === "short" || length === "medium" || length === "long"
        ? quotes[length]
        : [...quotes.short, ...quotes.medium, ...quotes.long] // "all" or any stale value
    return pool[Math.floor(Math.random() * pool.length)] ?? ""
}

// English ships in the main bundle because it is the default language for every
// mode. All other word lists load on demand so they do not dominate first paint.
const languages: Record<string, WordList> = {
    english: english1k,
}

const languageLoaders: Record<string, () => Promise<WordList>> = {
    french: async () => (await import('./languages/french10k.json')).default,
    spanish: async () => (await import('./languages/spanish10k.json')).default,
    german: async () => (await import('./languages/german10k.json')).default,
    italian: async () => (await import('./languages/italian10k.json')).default,
    portuguese: async () => (await import('./languages/portuguese10k.json')).default,
    dutch: async () => (await import('./languages/dutch10k.json')).default,
    polish: async () => (await import('./languages/polish10k.json')).default,
    chinese: async () => (await import('./languages/chinese10k.json')).default,
    hindi: async () => (await import('./languages/hindi1k.json')).default,
    // English vocabulary sizes: frequency-ranked, then filtered against SCOWL so
    // only real words survive. The default `english` (1k) ships in the main
    // bundle; these slices load on demand so they never weigh down first paint.
    english5k: async () => (await import('./languages/english5k.json')).default,
    english10k: async () => (await import('./languages/english10k.json')).default,
    english25k: async () => (await import('./languages/english25k.json')).default,
}

const languagePromises: Record<string, Promise<void>> = {}

export const ensureLanguageLoaded = (language: string): Promise<void> => {
    if (languages[language]) return Promise.resolve()
    const loader = languageLoaders[language]
    if (!loader) return Promise.resolve()
    languagePromises[language] ??= loader().then((wordList) => {
        languages[language] = wordList
    })
    return languagePromises[language]
}

// Falls back to English when a language hasn't loaded yet - callers that need a
// guarantee should await ensureLanguageLoaded first.
export const getWords = (language: string): string[] =>
    (languages[language] ?? languages.english!).words

const SIZE_COUNTS: Record<WordSize, number> = { "1k": 1000, "5k": 5000, "10k": 10000, "25k": 25000 }
const WORD_SIZES: WordSize[] = ["1k", "5k", "10k", "25k"]

// Base languages the app knows. A stored test language is a base optionally
// suffixed with a size ("french5k"); "1k" is the bare base ("french", "english").
export const BASE_LANGUAGES = [
    "english", "french", "spanish", "german", "italian", "portuguese", "dutch", "polish", "chinese", "hindi",
]

// A stored/composed test language ("english5k", "french", "french10k") splits into
// a base language (global, nav-chosen) and a vocabulary size (per-test, bar-chosen).
export const parseLanguage = (language: string): { base: string, size: WordSize } => {
    for (const base of BASE_LANGUAGES) {
        if (language === base) return { base, size: "1k" }
        if (language.startsWith(base)) {
            const suffix = language.slice(base.length) as WordSize
            if (WORD_SIZES.includes(suffix)) return { base, size: suffix }
        }
    }
    return { base: "english", size: "1k" }
}

export const composeLanguage = (base: string, size: WordSize): string =>
    size === "1k" ? base : `${base}${size}`

// 25k is English-only (subtitle frequency past ~10k is noisy); a size carried
// over from English collapses to the largest the new language supports.
export const clampSize = (base: string, size: WordSize): WordSize =>
    base !== "english" && size === "25k" ? "10k" : size

// A word test is (global language) × (per-test size). English resolves to its
// size-specific SCOWL file; every other language loads one frequency-ranked list
// and slices the top-N - so sizes cost no extra files (derived-on-read). English
// "1k" is the base `english` key that ships in the main bundle.
export const resolveWordKey = (language: string, size: WordSize): string => {
    if (language === "english") return size === "1k" ? "english" : `english${size}`
    return language
}

export const ensureSizedLoaded = (language: string, size: WordSize): Promise<void> =>
    ensureLanguageLoaded(resolveWordKey(language, size))

export const getSizedWords = (language: string, size: WordSize): string[] => {
    const words = getWords(resolveWordKey(language, size))
    // English files are already the requested size; other languages slice by rank.
    return language === "english" ? words : words.slice(0, SIZE_COUNTS[size])
}

interface NGrams {
    biGrams: string[],
    triGrams: string[],
    tetraGrams: string[],
}

const ngrams: NGrams = {
    biGrams: biGrams.grams,
    triGrams: triGrams.grams,
    tetraGrams: tetraGrams.grams,
}

// Frequency-ranked character n-grams across a word list (most common first).
// Ties keep first-seen order (Map insertion), so results are deterministic.
export const rankNGrams = (words: string[], n: number, limit: number): string[] => {
    const freq = new Map<string, number>()
    for (const word of words) {
        for (let i = 0; i + n <= word.length; i++) {
            const gram = word.slice(i, i + n)
            freq.set(gram, (freq.get(gram) ?? 0) + 1)
        }
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([gram]) => gram)
}

// Non-English Grams derive their n-grams from the language's word list on first use
// (no gram data files - derived-on-read), memoized per base. English keeps its
// curated static arrays. generateNGram slices to its scope before the level walk,
// so the deepest scope the bar offers (200) is all the depth ever read.
const NGRAM_DEPTH = 200
const derivedNGrams = new Map<string, NGrams>()

const gramsFor = (base: string): NGrams => {
    if (base === "english") return ngrams
    // List not loaded yet (callers ensureSizedLoaded first) - fall back to the
    // English grams *without* memoizing them under this base.
    if (!languages[base]) return ngrams
    const cached = derivedNGrams.get(base)
    if (cached) return cached
    const words = getWords(base)
    const derived: NGrams = {
        biGrams: rankNGrams(words, 2, NGRAM_DEPTH),
        triGrams: rankNGrams(words, 3, NGRAM_DEPTH),
        tetraGrams: rankNGrams(words, 4, NGRAM_DEPTH),
    }
    derivedNGrams.set(base, derived)
    return derived
}

// The extra letters a language uses beyond a–z (é, ü, ł …), most frequent across
// its word list first. Pure; ties keep first-seen order so results are stable.
export const accentChars = (words: string[]): string[] => {
    const freq = new Map<string, number>()
    for (const word of words) {
        for (const char of word) {
            if (/[a-z]/.test(char) || !/\p{L}/u.test(char)) continue
            freq.set(char, (freq.get(char) ?? 0) + 1)
        }
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([char]) => char)
}

// Derived-on-read per base, memoized like gramsFor. English (and a list that
// hasn't loaded yet - callers ensureLanguageLoaded first) yields none.
const derivedAccents = new Map<string, string[]>()

export const accentsFor = (base: string): string[] => {
    if (base === "english" || !languages[base]) return []
    let cached = derivedAccents.get(base)
    if (!cached) {
        cached = accentChars(getWords(base))
        derivedAccents.set(base, cached)
    }
    return cached
}

// Training/Practice key-drill text. The deep restricted-text module owns real
// word selection, per-key coverage, and language-derived orthographic fallbacks.
// Chinese and Hindi retain a Latin/English fallback until their script-specific
// generation is deliberately designed.
export const generateBetterPseudoText = (count: number, characters: string[], language = "english") => {
    const phonologyLanguage = language === "chinese" || language === "hindi" ? "english" : language
    return generateRestrictedText({
        language: phonologyLanguage,
        words: getWords(phonologyLanguage),
        characters,
        count,
    })
}

// Weighted so periods/commas dominate, matching natural prose.
const SENTENCE_ENDERS = ['.', '.', '.', '.', '?', '!']
const MID_PUNCTUATION = [',', ',', ',', ';', ':']

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
const pick = (choices: string[]) => choices[Math.floor(Math.random() * choices.length)] as string

// A standalone 1–2 digit number token built from the locked drill digits.
const digitToken = (digits: string[]) => {
    const len = 1 + Math.floor(Math.random() * 2)
    let token = ''
    for (let i = 0; i < len; i++) token += pick(digits)
    return token
}

// Layer punctuation, capitalisation and/or drill targets onto generated
// (lowercase) text.
// - punctuation: sprinkles sentence-ending and mid-sentence marks between words.
// - capitals: with punctuation on, capitalises sentence starts; on its own it
//   capitalises a sprinkle of words so the user still practises the shift key.
// - drill: Practice's locked number/punctuation keys. Locked marks force
//   sprinkling restricted to exactly those marks; locked digits get injected as
//   standalone number tokens, so the weak key gets real reps in natural prose.
export const applyTextOptions = (
    text: string,
    punctuation: boolean,
    capitals: boolean,
    drill?: { marks?: string[]; digits?: string[] },
) => {
    const lockedMarks = drill?.marks ?? []
    const digits = drill?.digits ?? []
    // Locked drill marks force punctuation even if the toggle is off.
    const usePunct = punctuation || lockedMarks.length > 0
    if (!text || (!usePunct && !capitals && digits.length === 0)) return text

    // Restrict the sprinkle pools to the locked marks when drilling; otherwise
    // use the natural prose weighting.
    const enders = lockedMarks.length ? lockedMarks.filter((m) => ENDER_MARKS.includes(m)) : SENTENCE_ENDERS
    const mids = lockedMarks.length ? lockedMarks.filter((m) => MID_MARKS.includes(m)) : MID_PUNCTUATION

    const words = text.split(' ')
    let startsSentence = true
    const out: string[] = []

    words.forEach((word, index) => {
        if (!word) { out.push(word); return }
        let result = word
        const isLast = index === words.length - 1

        if (capitals) {
            if (usePunct) {
                if (startsSentence) result = capitalise(result)
            } else if (Math.random() < 0.2) {
                result = capitalise(result)
            }
        }
        startsSentence = false

        if (usePunct && !isLast) {
            const roll = Math.random()
            if (enders.length && roll < 0.1) {
                result += pick(enders)
                startsSentence = true
            } else if (mids.length && roll < 0.22) {
                result += pick(mids)
            }
        }
        out.push(result)

        // Drill number tokens land as their own standalone "words".
        if (digits.length && !isLast && Math.random() < 0.14) out.push(digitToken(digits))
    })

    let output = out.join(' ')
    // Close the passage on a sentence ender when one is available.
    if (usePunct && enders.length && !enders.includes(output.slice(-1))) {
        output += lockedMarks.length ? pick(enders) : '.'
    }
    return output
}

export const generateText = (count: number, language: string) => {
    let text = ''

    // Generate random text. `language` is a composed base+size - slice accordingly.
    const { base, size } = parseLanguage(language)
    const words = getSizedWords(base, size)
    let prev = ''
    for (let i = 0; i < count; i++) {
        // Re-roll so no word repeats back-to-back - a doubled word reads as a typo
        // and breaks flow. ponytail: word lists have hundreds of entries so this
        // terminates in ~1 roll; a single-word list simply can't avoid the repeat.
        let randomWord = prev
        while (randomWord === prev && words.length > 1) {
            randomWord = String(words[Math.floor(Math.random() * words.length)])
        }
        text += randomWord + ' '
        prev = randomWord
    }

    // Remove last space
    return text.toLowerCase().slice(0, -1)
}

const MAX_NGRAM_COPIES = 20

export const generateNGram = (source: TestGramSources, scope: TestGramScopes, combination: number, repetition: number, level: number, language = "english") => {
    let ngram = ''
    let words: string[] = []

    // Grams follow the active language: whole-word source and derived character
    // n-grams both come from the language's list (English uses its curated grams).
    const { base } = parseLanguage(language)
    const grams = gramsFor(base)
    if (source === TestGramSources.words) {
        words = getWords(base)
    } else if (source === TestGramSources.bigrams) {
        words = grams.biGrams
    } else if (source === TestGramSources.trigrams) {
        words = grams.triGrams
    } else if (source === TestGramSources.tetragrams) {
        words = grams.tetraGrams
    }

    if (scope === TestGramScopes.fifty) words = words.slice(0, 50)
    else if (scope === TestGramScopes.oneHundred) words = words.slice(0, 100)
    else if (scope === TestGramScopes.twoHundred) words = words.slice(0, 200)

    for (let i = 0; i < combination; i++) {
        const levelGram = words[(level * combination) + i] as string
        ngram = ngram += levelGram + ' '
    }

    // `repetition` extra copies on top of the base, clamped so a large input
    // can't generate an unrenderably long string.
    const copies = Math.min(repetition + 1, MAX_NGRAM_COPIES)
    ngram = ngram.repeat(copies)

    // Remove last space
    return ngram.toLowerCase().slice(0, -1)
}

export const getGramLevelText = (level: number, combination: number, scope: TestGramScopes) => {
    if (scope === TestGramScopes.fifty) {
        const total: number = Math.ceil(50 / combination)

        return `${level}/${total}`
    }
    else if (scope === TestGramScopes.oneHundred) {
        const total: number = Math.ceil(100 / combination)

        return `${level}/${total}`
    }
    else {
        const total: number = Math.ceil(200 / combination)

        return `${level}/${total}`
    }
}
