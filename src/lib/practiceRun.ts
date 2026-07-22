import { compileCustomGramsPractice, type CustomGramsPracticePreferences } from "./customGramsPractice"
import { compileCustomKeysPractice, type CustomKeysPracticePreferences } from "./customKeysPractice"
import { compileGuidedPractice, type GuidedPracticeSetup } from "./guidedPractice"
import { practiceWordCapacity } from "./practiceCapacity"

export const INFINITE_PRACTICE_CHUNK_WORDS = 100

export type PracticeRunPlan =
    | { kind: "finite", count: number, wordCount: number, persists: true }
    | { kind: "infinite", count: 0, wordCount: typeof INFINITE_PRACTICE_CHUNK_WORDS, persists: false }

export function planPracticeRun(preferences: { durationSeconds: number, infinite?: boolean }): PracticeRunPlan {
    return preferences.infinite
        ? { kind: "infinite", count: 0, wordCount: INFINITE_PRACTICE_CHUNK_WORDS, persists: false }
        : { kind: "finite", count: preferences.durationSeconds, wordCount: practiceWordCapacity(preferences.durationSeconds), persists: true }
}

export type PracticeTextConfiguration =
    | { kind: "guided", setup: GuidedPracticeSetup, corpus: readonly string[], language: string }
    | { kind: "keys", preferences: CustomKeysPracticePreferences, corpus: readonly string[], language: string }
    | { kind: "grams", preferences: CustomGramsPracticePreferences, corpus: readonly string[], language: string }

/** Pure finite/infinite compiler seam; every streamed chunk keeps the same focus policy. */
export function compilePracticeText(
    configuration: PracticeTextConfiguration,
    seed: number,
    wordCount: number,
): string {
    if (configuration.kind === "guided") {
        return compileGuidedPractice({
            setup: configuration.setup,
            corpus: configuration.corpus,
            language: configuration.language,
            seed,
            wordCount,
        })
    }
    if (configuration.kind === "keys") {
        return compileCustomKeysPractice({
            keys: configuration.preferences.keys,
            corpus: configuration.corpus,
            language: configuration.language,
            textStyle: configuration.preferences.textStyle,
            seed,
            wordCount,
        })
    }
    return compileCustomGramsPractice({
        grams: configuration.preferences.grams,
        corpus: configuration.corpus,
        language: configuration.language,
        textStyle: configuration.preferences.textStyle,
        seed,
        wordCount,
    })
}

export function practiceStreamSeed(seed: number, chunkIndex: number): number {
    return seed + Math.max(0, Math.trunc(chunkIndex)) * 1_000_003
}
