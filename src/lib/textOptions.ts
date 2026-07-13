import { ENDER_MARKS, MID_MARKS } from "./drillKeys"
import { capitalizeProperNouns } from "./properNouns"

const SENTENCE_ENDERS = [".", ".", ".", ".", "?", "!"]
const MID_PUNCTUATION = [",", ",", ",", ";", ":"]

export interface TextOptionPolicy {
    marks?: string[]
    digits?: string[]
    language?: string
    targeted?: boolean
    random?: () => number
}

const localeFor = (language: string) => ({
    english: "en", french: "fr", spanish: "es", german: "de", italian: "it",
    portuguese: "pt", dutch: "nl", polish: "pl", chinese: "zh", hindi: "hi",
} as Record<string, string>)[language.replace(/(?:1|5|10|25)k$/, "")] ?? "en"

const pick = <T,>(choices: readonly T[], random: () => number): T =>
    choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] as T

const capitalize = (word: string, locale: string) => {
    const [first = "", ...rest] = [...word]
    return first.toLocaleUpperCase(locale) + rest.join("")
}

function shuffledPositions(length: number, count: number, random: () => number, includeFirst = false): number[] {
    const positions = Array.from({ length }, (_, index) => index).filter((index) => includeFirst || index > 0)
    for (let index = positions.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1))
        ;[positions[index], positions[swap]] = [positions[swap]!, positions[index]!]
    }
    return positions.slice(0, Math.min(count, positions.length)).sort((a, b) => a - b)
}

// Natural sentence spans are bounded rather than decided independently after
// every word. This guarantees a capital/punctuation rep while avoiding choppy
// two-word sentences and very long unpunctuated runs.
function naturalSentenceEnds(length: number, random: () => number): number[] {
    const ends: number[] = []
    let start = 0
    while (start < length) {
        const sentenceLength = 7 + Math.floor(random() * 8)
        const end = Math.min(length - 1, start + sentenceLength - 1)
        ends.push(end)
        start = end + 1
    }
    return ends
}

function generalPunctuation(length: number, random: () => number): Map<number, string> {
    const marks = new Map<number, string>()
    let start = 0
    for (const end of naturalSentenceEnds(length, random)) {
        marks.set(end, end === length - 1 ? "." : pick(SENTENCE_ENDERS, random))
        const span = end - start + 1
        if (span >= 6) {
            const middle = start + 2 + Math.floor(random() * Math.max(1, span - 4))
            if (middle < end) marks.set(middle, pick(MID_PUNCTUATION, random))
        }
        start = end + 1
    }
    return marks
}

// A focused drill promises reps of every selected mark. Quotas, rather than
// Bernoulli rolls, make that promise true even in a short passage.
function targetedPunctuation(length: number, selected: string[], random: () => number): Map<number, string> {
    const marks = [...new Set(selected.filter((mark) => ENDER_MARKS.includes(mark) || MID_MARKS.includes(mark)))]
    if (marks.length === 0) return new Map()
    const count = Math.min(length, Math.max(marks.length, Math.round(length * 0.15)))
    const positions = shuffledPositions(length, count, random, true)
    const assignments = new Map<number, string>()
    positions.forEach((position, index) => assignments.set(position, marks[index % marks.length]!))
    const closingMark = marks.find((mark) => ENDER_MARKS.includes(mark))
    if (closingMark) {
        const currentPosition = [...assignments.entries()].find(([, mark]) => mark === closingMark)?.[0]
        const displaced = assignments.get(length - 1)
        assignments.set(length - 1, closingMark)
        if (currentPosition !== undefined && currentPosition !== length - 1) {
            if (displaced) assignments.set(currentPosition, displaced)
            else assignments.delete(currentPosition)
        }
    }
    return assignments
}

function randomDigits(pool: string[], count: number, random: () => number): string {
    return Array.from({ length: count }, () => pick(pool, random)).join("")
}

function realisticNumber(pool: string[], punctuation: boolean, random: () => number): string {
    const roll = random()
    if (punctuation && roll >= 0.9) return `${randomDigits(pool, 1, random)},${randomDigits(pool, 3, random)}`
    if (punctuation && roll >= 0.82) return `${randomDigits(pool, 1 + Math.floor(random() * 2), random)}:${randomDigits(pool, 2, random)}`
    if (punctuation && roll >= 0.74) return `${randomDigits(pool, 1 + Math.floor(random() * 2), random)}.${randomDigits(pool, 1, random)}`
    if (roll >= 0.58) return randomDigits(pool, 4, random)
    if (roll >= 0.3) return randomDigits(pool, 2 + Math.floor(random() * 2), random)
    return randomDigits(pool, 1, random)
}

function applyNumbers(words: string[], digits: string[], punctuation: boolean, targeted: boolean, random: () => number) {
    const pool = [...new Set(digits.filter((digit) => /^\d$/.test(digit)))]
    if (pool.length === 0 || words.length === 0) return

    if (!targeted) {
        const count = Math.max(1, Math.round(words.length * 0.1))
        for (const position of shuffledPositions(words.length, count, random, true)) {
            words[position] = realisticNumber(pool, punctuation, random)
        }
        return
    }

    const required = pool.flatMap((digit) => [digit, digit])
    const count = Math.max(Math.round(words.length * 0.12), Math.ceil(required.length / 2))
    const positions = shuffledPositions(words.length, count, random, true)
    let requiredIndex = 0
    positions.forEach((position, positionIndex) => {
        const remainingRequired = required.length - requiredIndex
        const remainingPositions = positions.length - positionIndex
        const requiredInToken = Math.max(0, Math.ceil(remainingRequired / remainingPositions))
        const token = required.slice(requiredIndex, requiredIndex + requiredInToken)
        requiredIndex += token.length
        words[position] = token.length > 0 ? token.join("") : randomDigits(pool, 1 + Math.floor(random() * 2), random)
    })
}

function markSuffix(mark: string, language: string): string {
    return language === "french" && [";", ":", "?", "!"].includes(mark) ? ` ${mark}` : mark
}

// Compose three independent policies over lowercase generated words:
// sentence/clause punctuation, sentence/proper-noun casing, and numeric tokens.
// Numeric tokens replace words so a configured 25-word test remains 25 tokens.
export function applyTextOptions(
    text: string,
    punctuation: boolean,
    capitals: boolean,
    policy: TextOptionPolicy = {},
): string {
    const selectedMarks = policy.marks ?? []
    const digits = policy.digits ?? []
    const language = policy.language?.replace(/(?:1|5|10|25)k$/, "") ?? "english"
    const random = policy.random ?? Math.random
    const usePunctuation = punctuation || selectedMarks.length > 0
    if (!text || (!usePunctuation && !capitals && digits.length === 0)) return text

    const words = text.split(" ")
    applyNumbers(words, digits, usePunctuation, policy.targeted ?? false, random)

    const visibleMarks = !usePunctuation
        ? new Map<number, string>()
        : selectedMarks.length > 0
            ? targetedPunctuation(words.length, selectedMarks, random)
            : generalPunctuation(words.length, random)

    const visibleEnders = [...visibleMarks.entries()]
        .filter(([, mark]) => ENDER_MARKS.includes(mark))
        .map(([index]) => index)
        .sort((a, b) => a - b)
    const sentenceEnds = visibleEnders.length > 0 ? visibleEnders : naturalSentenceEnds(words.length, random)
    const sentenceStarts = new Set([0, ...sentenceEnds.map((end) => end + 1).filter((start) => start < words.length)])

    let casedWords = capitals ? capitalizeProperNouns(words, language) : words
    if (capitals) {
        const locale = localeFor(language)
        casedWords = casedWords.map((word, index) => sentenceStarts.has(index) ? capitalize(word, locale) : word)
    }

    // Spanish questions and exclamations require their opening twin at the
    // corresponding sentence start. Derive it from the same boundary plan.
    const prefixes = new Map<number, string>()
    if (language === "spanish") {
        let start = 0
        for (const end of visibleEnders) {
            const mark = visibleMarks.get(end)
            if (mark === "?") prefixes.set(start, "¿")
            if (mark === "!") prefixes.set(start, "¡")
            start = end + 1
        }
    }

    const output: string[] = []
    for (let index = 0; index < casedWords.length; index++) {
        let word = (prefixes.get(index) ?? "") + casedWords[index]!
        const mark = visibleMarks.get(index)
        if (mark === "-" && index + 1 < casedWords.length) {
            word += `-${casedWords[index + 1]!}`
            index++
        } else if (mark) {
            word += markSuffix(mark, language)
        }
        output.push(word)
    }
    return output.join(" ")
}
