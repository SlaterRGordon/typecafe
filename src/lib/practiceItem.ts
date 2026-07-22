export type PracticeItemKind = "gram" | "word"

const characters = (value: string): string[] => [...value]
const WORD_PATTERN = /^\p{L}+(?:['-]\p{L}+)*$/u

function normalized(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize("NFC")
        .replace(/[‘’]/gu, "'")
        .replace(/[‐‑‒–—]/gu, "-")
}

/** Grams are complete 2–4-code-point letter sequences. */
export function normalizePracticeGram(value: string): string | null {
    const item = normalized(value)
    const points = characters(item)
    return points.length >= 2 && points.length <= 4 && points.every((point) => /\p{L}/u.test(point))
        ? item
        : null
}

/** Words are complete 5–32-code-point tokens, optionally joined internally. */
export function normalizePracticeWord(value: string): string | null {
    const item = normalized(value)
    const length = characters(item).length
    return length >= 5 && length <= 32 && WORD_PATTERN.test(item) ? item : null
}

export function normalizePracticeItem(value: string): string | null {
    return normalizePracticeGram(value) ?? normalizePracticeWord(value)
}

export function practiceItemKind(value: string): PracticeItemKind | null {
    if (normalizePracticeGram(value) === value) return "gram"
    if (normalizePracticeWord(value) === value) return "word"
    return null
}
