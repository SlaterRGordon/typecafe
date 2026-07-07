import { TestModes, TestSubModes } from "../types"
import type { QuoteLength, TestGramScopes, TestGramSources } from "../types"
import type { Level } from "../train/levels"
import { applyTextOptions, ensureLanguageLoaded, ensureQuotesLoaded, generateBetterPseudoText, generateNGram, generateQuote, generateText, isDrillDigit, isDrillMark } from "../utils"

export interface TestTextConfig {
    mode: TestModes,
    subMode: TestSubModes,
    count: number,
    language: string,
    quoteLength: QuoteLength,
    punctuation: boolean,
    capitals: boolean,
    level?: Level,
    selectedKeys?: string[],
    gramSource: TestGramSources,
    gramScope: TestGramScopes,
    gramCombination: number,
    gramRepetition: number,
}

// The one place that decides what text a test starts with, per mode/submode.
// Timed and relaxed tests start with a buffer that Text.tsx extends as the user
// approaches the end, so the initial size only needs to outrun the first append.
// Async because non-English word lists load on demand.
export async function generateTestText(config: TestTextConfig, gramLevel: number): Promise<string> {
    const { mode, subMode, count, language, punctuation, capitals, level, selectedKeys } = config

    if (mode === TestModes.quotes) {
        // Quotes are typed verbatim — no lowercasing, no punctuation/capitals
        // toggles, no shuffling. applyTextOptions would mangle their own casing.
        await ensureQuotesLoaded()
        return generateQuote(config.quoteLength)
    }

    await ensureLanguageLoaded(language)

    if (mode === TestModes.normal) {
        if (subMode === TestSubModes.timed) {
            // A speed-round level drills its own keys at speed; the buffer is large
            // so a 30s run never exhausts it (Text appends more from the same keys).
            if (level) return applyTextOptions(generateBetterPseudoText(500, level.keys.split("")), punctuation, capitals)
            return applyTextOptions(generateText(500, language), punctuation, capitals)
        }
        if (subMode === TestSubModes.words) {
            if (level) return applyTextOptions(generateBetterPseudoText(count, level.keys.split("")), punctuation, capitals)
            return applyTextOptions(generateText(count, language), punctuation, capitals)
        }
        return ""
    }

    if (mode === TestModes.practice) {
        if (!selectedKeys) return ""
        // Practice uses ONLY the unlocked keys: the selected letters build the
        // words *exclusively* (a locked letter never appears), and locked-in
        // numbers/punctuation are sprinkled in as drill targets. The min-keys rule
        // (>=6 letters incl. a vowel + consonant) guarantees text is always buildable.
        const letters = selectedKeys.filter((key) => /^[a-z]$/.test(key))
        // The punctuation toggle gates the locked mark keys: off → no marks
        // sprinkled even if locked; on → sprinkle *only* the locked marks (never the
        // full natural pool, so Practice stays scoped to unlocked keys). Digits are
        // numbers, not punctuation, so they ride the locks regardless. `capitals`
        // stays as the one Capitalize add-on.
        const marks = punctuation ? selectedKeys.filter(isDrillMark) : []
        const digits = selectedKeys.filter(isDrillDigit)
        return applyTextOptions(generateBetterPseudoText(500, letters), false, capitals, { marks, digits })
    }

    if (mode === TestModes.ngrams) {
        return generateNGram(config.gramSource, config.gramScope, config.gramCombination, config.gramRepetition, gramLevel)
    }

    if (mode === TestModes.relaxed) {
        return applyTextOptions(generateText(50, language), punctuation, capitals)
    }

    return ""
}
