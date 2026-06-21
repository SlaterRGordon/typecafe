import { TestModes, TestSubModes } from "../types"
import type { TestGramScopes, TestGramSources } from "../types"
import type { Level } from "../learn/levels"
import { applyTextOptions, ensureLanguageLoaded, generateBetterPseudoText, generateNGram, generateText, getWords } from "../utils"
import { compileDrillText } from "~/lib/drill"

export interface TestTextConfig {
    mode: TestModes,
    subMode: TestSubModes,
    count: number,
    language: string,
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

    await ensureLanguageLoaded(language)

    if (mode === TestModes.normal) {
        if (subMode === TestSubModes.timed) {
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
        return applyTextOptions(compileDrillText({ keys: selectedKeys, wordList: getWords(language), length: 500 }), punctuation, capitals)
    }

    if (mode === TestModes.ngrams) {
        return generateNGram(config.gramSource, config.gramScope, config.gramCombination, config.gramRepetition, gramLevel)
    }

    if (mode === TestModes.relaxed) {
        return applyTextOptions(generateText(50, language), punctuation, capitals)
    }

    return ""
}
