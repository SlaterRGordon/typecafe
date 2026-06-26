import biGrams from './languages/nGrams/biGrams.json'
import triGrams from './languages/nGrams/triGrams.json'
import tetraGrams from './languages/nGrams/tetraGrams.json'

import english10k from './languages/english10k.json'

import { TestGramScopes, TestGramSources, type QuoteLength } from './types'
// Drillable-key definitions live in lib (single source shared with diagnosis and
// the drill page); re-exported here for the typer modules that import from utils.
import { DRILL_MARKS, ENDER_MARKS, MID_MARKS, isDrillMark, isDrillDigit } from '~/lib/drillKeys'
export { DRILL_MARKS, isDrillMark, isDrillDigit }

interface WordList {
    words: string[],
}

type QuoteBuckets = { short: string[], medium: string[], long: string[] }

// Quotes load on demand (the JSON is a few hundred KB) — Quotes is a secondary
// mode, so it never belongs in the first-paint bundle.
let quotes: QuoteBuckets | null = null
let quotesPromise: Promise<void> | null = null

export const ensureQuotesLoaded = (): Promise<void> => {
    if (quotes) return Promise.resolve()
    quotesPromise ??= import('./languages/quotes.json').then((m) => { quotes = m.default as QuoteBuckets })
    return quotesPromise
}

// A random verbatim quote from the chosen length bucket ("all" pools them).
// Returns "" until the JSON has loaded — callers await ensureQuotesLoaded first.
export const generateQuote = (length: QuoteLength): string => {
    if (!quotes) return ""
    const pool = length === "short" || length === "medium" || length === "long"
        ? quotes[length]
        : [...quotes.short, ...quotes.medium, ...quotes.long] // "all" or any stale value
    return pool[Math.floor(Math.random() * pool.length)] ?? ""
}

// English ships in the main bundle because it is the default language for every
// mode. All other word lists (and the 400 KB pentagrams file) load on demand —
// they would otherwise dominate the first-paint bundle.
const languages: Record<string, WordList> = {
    english: english10k,
}

const languageLoaders: Record<string, () => Promise<WordList>> = {
    french: async () => (await import('./languages/french10k.json')).default,
    spanish: async () => (await import('./languages/spanish10k.json')).default,
    chinese: async () => (await import('./languages/chinese10k.json')).default,
    hindi: async () => (await import('./languages/hindi1k.json')).default,
    // English vocabulary sizes: frequency-ranked, then filtered against SCOWL so
    // only real words survive. The default `english` (10k) ships in the main
    // bundle; these slices load on demand so they never weigh down first paint.
    english1k: async () => (await import('./languages/english1k.json')).default,
    english5k: async () => (await import('./languages/english5k.json')).default,
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

// Falls back to English when a language hasn't loaded yet — callers that need a
// guarantee should await ensureLanguageLoaded first.
export const getWords = (language: string): string[] =>
    (languages[language] ?? languages.english!).words

interface NGrams {
    biGrams: string[],
    triGrams: string[],
    tetraGrams: string[],
    pentaGrams: string[],
}

const ngrams: NGrams = {
    biGrams: biGrams.grams,
    triGrams: triGrams.grams,
    tetraGrams: tetraGrams.grams,
    pentaGrams: [],
}

let pentaGramsRequested = false

// Fire-and-forget: the first practice text may be generated without pentagrams
// (bi/tri/tetragrams still apply), every later one includes them.
const requestPentaGrams = () => {
    if (pentaGramsRequested) return
    pentaGramsRequested = true
    void import('./languages/nGrams/pentaGrams.json').then((module) => {
        ngrams.pentaGrams = module.default.grams
    })
}

export const generateBetterPseudoText = (count: number, characters: string[]) => {
    requestPentaGrams()
    let text = ''

    let allGrams: string[] = []
    Object.keys(ngrams).map((key: string) => {
        allGrams = allGrams.concat(ngrams[key as keyof typeof ngrams])
    })
    
    const filteredGrams = allGrams.filter((gram: string) => {
        if (!gram.includes(characters[characters.length - 1] as string)) return false

        for (let i = 0; i < gram.length; i++) {
            if (!characters.includes(gram[i] as string)) return false
        }

        return true
    })

    // Decide next word length
    const wordLengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const wordLengthFrequencies = [0.14, 0.3, 0.5, 0.7, 0.8, 0.87, 0.92, 0.96, 0.99, 1.0]
    const vowels = ['a', 'e', 'i', 'o', 'u']
    const consonants = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z']
    const availableVowels = characters.filter((char: string) => vowels.includes(char))
    const availableConsonants = characters.filter((char: string) => consonants.includes(char))

    const englishWords = getWords("english")
    const filteredWords = englishWords.filter((word: string) => {
        for (let i = 0; i < word.length; i++) {
            if (!characters.includes(word[i] as string)) return false
        }

        return true
    })

    // Generate random text
    let wordLength = 0
    for (let i = 0; i < count; i++) {
        // Try to use real words 50% of the time
        // const isRealWord = Math.random() > 0.5
        if (filteredWords.length > 0) {
            const randomIndex = Math.floor(Math.random() * filteredWords.length)
            text = text += (filteredWords[randomIndex] as string) + ' '
            continue
        }

        const randomDecimal = Math.random()
        for (let i = 0; i < wordLengthFrequencies.length; i++) {
            if (randomDecimal <= (wordLengthFrequencies[i] as number)) {
                wordLength = wordLengths[i] as number
                break;
            }
        }

        if (wordLength === 1) {
            const vowelChoices = ["a", "i"]
            // See what vowelChoices are available
            const availableVowelChoices = vowelChoices.filter((vowel: string) => characters.includes(vowel))

            if (availableVowelChoices.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableVowelChoices.length)
                const vowel = availableVowelChoices[randomIndex]
                if (vowel) {
                    text += vowel + ' '
                }
                continue
            } else {
                wordLength = 2
            }
        }

        let newWord = ''
        // `< wordLength` (not `!==`) plus the break below guarantees this loop
        // always terminates: each pass either grows newWord or breaks out. With
        // `!==` and a missing gram (e.g. a vowel is needed but no selected key is a
        // vowel) the word could never reach its target length and the loop — and
        // the whole UI — would hang. See utils.test.ts "always terminates".
        while(newWord.length < wordLength) {
            let filteredGramsByLength: string[] = []
            let randomGram = ''

            if (wordLength - newWord.length === 1) {
                // if last character is a consonant, add a vowel
                if (!newWord.slice(-1).match(/[aeiou]/g)) {
                    randomGram = availableVowels[Math.floor(Math.random() * availableVowels.length)] as string
                } else {
                    randomGram = availableConsonants[Math.floor(Math.random() * availableConsonants.length)] as string
                }
            } else {
                if (wordLength === 2) {
                    // Add bigram that has a vowel
                    filteredGramsByLength = filteredGrams.filter((gram: string) => gram.length === 2 && gram.match(/[aeiou]/g))
                } else if (!newWord.slice(-2).match(/[aeiou]/g)) {
                    // Add bigram that has a vowel as its first character
                    filteredGramsByLength = filteredGrams.filter((gram: string) => gram.length <= (wordLength - newWord.length) && gram.match(/^[aeiou]/))
                } else if (newWord.length === 0) {
                    // Add gram that has a vowel in it
                    filteredGramsByLength = filteredGrams.filter((gram: string) => gram.length <= (wordLength - newWord.length) && gram.match(/[aeiou]/g))
                } else {
                    filteredGramsByLength = filteredGrams.filter((gram: string) => gram.length <= (wordLength - newWord.length))
                }
                const randomIndex = Math.floor(Math.random() * filteredGramsByLength.length)
                randomGram = filteredGramsByLength[randomIndex] as string
            }
            // Nothing can extend the word — bail out instead of spinning forever.
            if (!randomGram) break
            newWord += randomGram
        }
        if (newWord) text = text += newWord + ' '
    }

    return text.toLowerCase().slice(0, -1)
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

    // Generate random text
    const words = getWords(language)
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * words.length)
        const randomWord = String(words[randomIndex])
        text = text += randomWord + ' '
    }

    // Remove last space
    return text.toLowerCase().slice(0, -1)
}

const MAX_NGRAM_COPIES = 20

export const generateNGram = (source: TestGramSources, scope: TestGramScopes, combination: number, repetition: number, level: number) => {
    let ngram = ''
    let words: string[] = []

    if (source === TestGramSources.words) {
        words = getWords("english")
    } else if (source === TestGramSources.bigrams) {
        words = ngrams.biGrams
    } else if (source === TestGramSources.trigrams) {
        words = ngrams.triGrams
    } else if (source === TestGramSources.tetragrams) {
        words = ngrams.tetraGrams
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
