import { TestModes, TestSubModes } from "../types"
import type { QuoteLength } from "../types"
import type { Level } from "../train/levels"
import { applyTextOptions, ensureQuotesLoaded, ensureSizedLoaded, generateBetterPseudoText, generateQuote, generateText, parseLanguage } from "../utils"
import { ALL_DIGITS } from "~/lib/drillKeys"

export interface TestTextConfig {
    mode: TestModes,
    subMode: TestSubModes,
    count: number,
    language: string,
    quoteLength: QuoteLength,
    punctuation: boolean,
    capitals: boolean,
    numbers: boolean,
    level?: Level,
}

// The one place that decides what text a test starts with, per mode/submode.
// Timed and relaxed tests start with a buffer that Text.tsx extends as the user
// approaches the end, so the initial size only needs to outrun the first append.
// Async because non-English word lists load on demand.
export async function generateTestText(config: TestTextConfig): Promise<string> {
    const { mode, subMode, count, language, punctuation, capitals, numbers, level } = config
    // The numbers toggle sprinkles standalone digit tokens into word-list text,
    // exactly like punctuation/capitals ride applyTextOptions.
    const numberPool = numbers ? ALL_DIGITS : []

    if (mode === TestModes.quotes) {
        // Quotes are typed verbatim - no lowercasing, no punctuation/capitals
        // toggles, no shuffling. applyTextOptions would mangle their own casing.
        await ensureQuotesLoaded()
        return generateQuote(config.quoteLength)
    }

    const { base, size } = parseLanguage(language)
    await ensureSizedLoaded(base, size)

    if (mode === TestModes.normal) {
        if (subMode === TestSubModes.timed) {
            // A speed-round level drills its own keys at speed; the buffer is large
            // so a 30s run never exhausts it (Text appends more from the same keys).
            if (level) return applyTextOptions(generateBetterPseudoText(500, level.keys.split(""), base), punctuation, capitals, { language: base })
            return applyTextOptions(generateText(500, language), punctuation, capitals, { digits: numberPool, language: base })
        }
        if (subMode === TestSubModes.words) {
            if (level) return applyTextOptions(generateBetterPseudoText(count, level.keys.split(""), base), punctuation, capitals, { language: base })
            return applyTextOptions(generateText(count, language), punctuation, capitals, { digits: numberPool, language: base })
        }
        return ""
    }

    if (mode === TestModes.relaxed) {
        return applyTextOptions(generateText(50, language), punctuation, capitals, { digits: numberPool, language: base })
    }

    return ""
}
